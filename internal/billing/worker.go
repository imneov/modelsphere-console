package billing

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"
)

type UsageStore interface {
	Ingest(context.Context, []Event, PriceLookup) error
}

type WorkerOptions struct {
	Consumer      string
	FlushInterval time.Duration
	PollInterval  time.Duration
	MaxEvents     int64
	MaxBytes      int
	Concurrency   int
}

type UsageWorker struct {
	Metrics   *Telemetry
	Queue     EventQueue
	Store     UsageStore
	Prices    PriceLookup
	Options   WorkerOptions
	Log       *slog.Logger
	committed atomic.Uint64
	failures  atomic.Uint64
}

func (worker *UsageWorker) Validate() error {
	options := worker.Options
	if worker.Queue == nil || worker.Store == nil || worker.Prices == nil || worker.Log == nil || options.Consumer == "" || options.FlushInterval <= 0 || options.PollInterval <= 0 || options.MaxEvents < 1 || options.MaxBytes < 1 || options.Concurrency < 1 {
		return errors.New("invalid usage worker dependencies or batch configuration")
	}
	return nil
}

func (worker *UsageWorker) Run(ctx context.Context) error {
	if err := worker.Validate(); err != nil {
		return err
	}
	var group sync.WaitGroup
	group.Add(1)
	go func() { defer group.Done(); worker.maintain(ctx) }()
	for index := 0; index < worker.Options.Concurrency; index++ {
		group.Add(1)
		go func(index int) {
			defer group.Done()
			worker.loop(ctx, fmt.Sprintf("%s-%d", worker.Options.Consumer, index))
		}(index)
	}
	<-ctx.Done()
	group.Wait()
	return ctx.Err()
}

func (worker *UsageWorker) loop(ctx context.Context, consumer string) {
	for ctx.Err() == nil {
		batch, err := worker.Queue.Consume(ctx, consumer, worker.Options.MaxEvents)
		if err == nil && len(batch.Messages) > 0 {
			err = worker.process(ctx, batch, consumer, true)
		}
		if err != nil && ctx.Err() == nil {
			worker.failures.Add(1)
			worker.Log.Warn("usage batch deferred", "err", err)
		}
		if err != nil || len(batch.Messages) == 0 {
			delay := worker.Options.PollInterval
			if errors.Is(err, ErrPriceMissing) || errors.Is(err, ErrPriceVersionConflict) {
				delay = worker.Options.FlushInterval
			}
			if waitContext(ctx, delay) != nil {
				return
			}
		}
	}
}

// FlushOnce exposes an operational flush without relying on wall-clock sleeps.
func (worker *UsageWorker) FlushOnce(ctx context.Context) error {
	if err := worker.Validate(); err != nil {
		return err
	}
	batch, err := worker.Queue.Consume(ctx, worker.Options.Consumer, worker.Options.MaxEvents)
	if err != nil {
		return err
	}
	if len(batch.Messages) == 0 {
		return nil
	}
	return worker.process(ctx, batch, worker.Options.Consumer, false)
}

func (worker *UsageWorker) process(ctx context.Context, batch Batch, consumer string, collect bool) error {
	workContext, cancel := context.WithCancel(ctx)
	done := make(chan error, 1)
	go worker.keepLease(workContext, cancel, batch, done)
	defer func() {
		cancel()
		<-done
		releaseContext, releaseCancel := context.WithTimeout(context.WithoutCancel(ctx), 2*time.Second)
		defer releaseCancel()
		if err := worker.Queue.Release(releaseContext, batch); err != nil {
			worker.Log.Warn("release queue partition deferred", "err", err)
		}
	}()
	if collect {
		var err error
		batch, err = worker.collect(workContext, batch, consumer)
		if err != nil {
			return err
		}
	}
	valid, err := worker.filterPoison(workContext, batch)
	if err != nil {
		return err
	}
	return worker.commit(workContext, valid)
}

func (worker *UsageWorker) keepLease(ctx context.Context, cancel context.CancelFunc, batch Batch, result chan<- error) {
	ticker := time.NewTicker(worker.Queue.LeaseDuration() / 3)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			result <- ctx.Err()
			return
		case <-ticker.C:
			if err := worker.Queue.Renew(ctx, batch); err != nil {
				cancel()
				result <- err
				return
			}
		}
	}
}

func (worker *UsageWorker) collect(ctx context.Context, batch Batch, consumer string) (Batch, error) {
	flush := time.NewTimer(worker.Options.FlushInterval)
	defer flush.Stop()
	poll := time.NewTicker(worker.Options.PollInterval)
	defer poll.Stop()
	for {
		size, err := batchBytes(batch)
		if err != nil {
			return batch, err
		}
		if int64(len(batch.Messages)) >= worker.Options.MaxEvents || size >= worker.Options.MaxBytes {
			return batch, nil
		}
		select {
		case <-ctx.Done():
			return batch, ctx.Err()
		case <-flush.C:
			return batch, nil
		case <-poll.C:
			messages, err := worker.Queue.Poll(ctx, batch, consumer, worker.Options.MaxEvents-int64(len(batch.Messages)))
			if err != nil {
				return batch, err
			}
			batch.Messages = append(batch.Messages, messages...)
		}
	}
}

func batchBytes(batch Batch) (int, error) {
	size := 0
	for _, message := range batch.Messages {
		encoded, err := json.Marshal(message.Event)
		if err != nil {
			return 0, err
		}
		size += len(encoded)
	}
	return size, nil
}

func (worker *UsageWorker) commit(ctx context.Context, batch Batch) (result error) {
	started := time.Now()
	defer func() { worker.Metrics.observe("usage_commit", started, result) }()
	var deferred error
	for start := 0; start < len(batch.Messages); {
		chunk, end, err := worker.nextChunk(batch, start)
		if err != nil {
			return err
		}
		if err := worker.commitChunk(ctx, chunk); err != nil {
			if !errors.Is(err, ErrPriceMissing) && !errors.Is(err, ErrPriceVersionConflict) {
				return err
			}
			deferred = errors.Join(deferred, err)
		}
		start = end
	}
	return deferred
}

func (worker *UsageWorker) nextChunk(batch Batch, start int) (Batch, int, error) {
	size, end := 0, start
	for end < len(batch.Messages) {
		encoded, err := json.Marshal(batch.Messages[end].Event)
		if err != nil {
			return Batch{}, start, err
		}
		if len(encoded) > worker.Options.MaxBytes {
			return Batch{}, start, errors.New("event exceeds configured batch byte limit")
		}
		if size+len(encoded) > worker.Options.MaxBytes || int64(end-start) >= worker.Options.MaxEvents {
			break
		}
		size += len(encoded)
		end++
	}
	return Batch{Partition: batch.Partition, Token: batch.Token, Messages: batch.Messages[start:end]}, end, nil
}

func (worker *UsageWorker) commitChunk(ctx context.Context, chunk Batch) error {
	events := make([]Event, 0, len(chunk.Messages))
	for _, message := range chunk.Messages {
		events = append(events, message.Event)
	}
	if err := worker.Store.Ingest(ctx, events, worker.Prices); err != nil {
		if !errors.Is(err, ErrConflict) && !errors.Is(err, ErrPriceMissing) {
			return err
		}
		return worker.commitIndividually(ctx, chunk)
	}
	if err := worker.Queue.Ack(ctx, chunk); err != nil {
		return err
	}
	worker.committed.Add(uint64(len(events)))
	if worker.Metrics != nil {
		for _, event := range events {
			worker.Metrics.durations.WithLabelValues("ingestion_lag").Observe(max(0, time.Since(event.OccurredAt).Seconds()))
		}
	}
	return nil
}

func waitContext(ctx context.Context, duration time.Duration) error {
	timer := time.NewTimer(duration)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func (worker *UsageWorker) filterPoison(ctx context.Context, batch Batch) (Batch, error) {
	valid := Batch{Partition: batch.Partition, Token: batch.Token}
	for _, message := range batch.Messages {
		reason := ""
		encoded, err := json.Marshal(message.Event)
		if err != nil {
			return valid, err
		}
		if message.DecodeError != "" || message.Event.Validate() != nil {
			reason = "invalid_event"
		} else if len(encoded) > worker.Options.MaxBytes {
			reason = "event_exceeds_batch_limit"
		}
		if reason != "" {
			poison := Batch{Partition: batch.Partition, Token: batch.Token, Messages: []Message{message}}
			if err := worker.Queue.DeadLetter(ctx, poison, reason); err != nil {
				return valid, err
			}
			worker.Metrics.record("dead_letter", reason)
		} else {
			valid.Messages = append(valid.Messages, message)
		}
	}
	return valid, nil
}

func (worker *UsageWorker) commitIndividually(ctx context.Context, batch Batch) error {
	var deferred error
	for _, message := range batch.Messages {
		single := Batch{Partition: batch.Partition, Token: batch.Token, Messages: []Message{message}}
		err := worker.Store.Ingest(ctx, []Event{message.Event}, worker.Prices)
		if errors.Is(err, ErrPriceVersionConflict) {
			deferred = errors.Join(deferred, err)
			continue
		}
		if errors.Is(err, ErrConflict) {
			if err := worker.Queue.DeadLetter(ctx, single, "immutable_fact_conflict"); err != nil {
				return err
			}
			worker.Metrics.record("dead_letter", "immutable_fact_conflict")
			continue
		}
		if errors.Is(err, ErrPriceMissing) {
			deferred = errors.Join(deferred, ErrPriceMissing)
			continue
		}
		if err != nil {
			return err
		}
		if err := worker.Queue.Ack(ctx, single); err != nil {
			return err
		}
		worker.committed.Add(1)
	}
	return deferred
}

func (worker *UsageWorker) maintain(ctx context.Context) {
	ticker := time.NewTicker(worker.Options.FlushInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := worker.Queue.Trim(ctx); err != nil && ctx.Err() == nil {
				worker.Log.Warn("queue safe trimming deferred", "err", err)
			}
		}
	}
}
