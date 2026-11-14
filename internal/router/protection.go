package router

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"sync"
	"time"
)

type generationGuard struct {
	options PipelineOptions
	cancel  context.CancelFunc
	timer   *time.Timer
	// mu guards a timer-triggered reason and stream-triggered accounting.
	mu        sync.Mutex
	reason    string
	received  int64
	lastDelta [sha256.Size]byte
	hasDelta  bool
	repeated  int
	onStop    func(string)
	finished  bool
	callbacks sync.WaitGroup
}

func newGenerationGuard(options PipelineOptions, cancel context.CancelFunc, onStop func(string)) *generationGuard {
	if options.MaxDuration == 0 && options.MaxResponseBytes == 0 && options.RepeatDeltaLimit == 0 {
		return nil
	}
	guard := &generationGuard{options: options, cancel: cancel, onStop: onStop}
	if options.MaxDuration > 0 {
		guard.timer = time.AfterFunc(options.MaxDuration, func() { guard.stop("generation_duration_limit") })
	}
	return guard
}

func (guard *generationGuard) stop(reason string) {
	guard.mu.Lock()
	if guard.reason != "" || guard.finished {
		guard.mu.Unlock()
		return
	}
	guard.reason = reason
	guard.callbacks.Add(1)
	guard.mu.Unlock()
	defer guard.callbacks.Done()
	guard.cancel()
	if guard.onStop != nil {
		guard.onStop(reason)
	}
}

func (guard *generationGuard) Reason() string {
	if guard == nil {
		return ""
	}
	guard.mu.Lock()
	defer guard.mu.Unlock()
	return guard.reason
}

func (guard *generationGuard) close() {
	if guard == nil {
		return
	}
	guard.mu.Lock()
	guard.finished = true
	guard.mu.Unlock()
	if guard.timer != nil {
		guard.timer.Stop()
	}
	guard.callbacks.Wait()
}

func (guard *generationGuard) bytes(count int) int {
	if guard == nil {
		return count
	}
	guard.mu.Lock()
	allowed := count
	if guard.options.MaxResponseBytes > 0 {
		remaining := guard.options.MaxResponseBytes - guard.received
		if remaining < int64(allowed) {
			if remaining < 0 {
				remaining = 0
			}
			allowed = int(remaining)
		}
	}
	guard.received += int64(count)
	exhausted := guard.options.MaxResponseBytes > 0 && guard.received >= guard.options.MaxResponseBytes
	guard.mu.Unlock()
	if exhausted {
		guard.stop("generation_response_limit")
	}
	return allowed
}

func (guard *generationGuard) delta(text string) bool {
	if guard == nil || guard.options.RepeatDeltaLimit == 0 || text == "" {
		return false
	}
	digest := sha256.Sum256([]byte(text))
	guard.mu.Lock()
	if guard.hasDelta && guard.lastDelta == digest {
		guard.repeated++
	} else {
		guard.lastDelta = digest
		guard.hasDelta = true
		guard.repeated = 1
	}
	repeated := guard.repeated >= guard.options.RepeatDeltaLimit
	guard.mu.Unlock()
	if repeated {
		guard.stop("generation_repetition_limit")
	}
	return repeated
}

func protectionFrame(reason string) []byte {
	payload, err := json.Marshal(map[string]any{"error": map[string]string{"code": "generation_protection", "message": "Generation stopped: " + reason}})
	if err != nil {
		panic(err)
	}
	return append(append([]byte("\n\ndata: "), payload...), []byte("\n\n")...)
}
