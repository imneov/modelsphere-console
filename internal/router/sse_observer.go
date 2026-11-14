package router

import (
	"encoding/json"
	"strings"

	"github.com/modelsphere/console/internal/billing"
)

type sseObserver struct {
	trace     *billing.Trace
	guard     *generationGuard
	limit     int
	frame     strings.Builder
	line      strings.Builder
	lineBytes int
	discarded bool
	done      bool
}

// feed bounds metadata parsing while returning the first protection frame boundary.
func (observer *sseObserver) feed(chunk []byte) int {
	stopAt := -1
	for index, character := range chunk {
		if observer.lineBytes <= observer.limit {
			observer.lineBytes++
		}
		if observer.lineBytes+observer.frame.Len() > observer.limit {
			observer.discarded = true
			observer.frame.Reset()
		}
		if !observer.discarded || observer.line.Len() < 2 {
			observer.line.WriteByte(character)
		}
		if character != '\n' {
			continue
		}
		if observer.finishLine() && stopAt < 0 {
			stopAt = index + 1
		}
	}
	return stopAt
}

func (observer *sseObserver) finishLine() bool {
	line := strings.TrimRight(observer.line.String(), "\r\n")
	blank := observer.lineBytes <= 2 && line == ""
	stopped := false
	if blank {
		if !observer.discarded {
			stopped = observer.event(observer.frame.String())
		}
		observer.frame.Reset()
		observer.discarded = false
	} else if !observer.discarded && strings.HasPrefix(line, "data:") {
		if observer.frame.Len() > 0 {
			observer.frame.WriteByte('\n')
		}
		observer.frame.WriteString(strings.TrimPrefix(strings.TrimPrefix(line, "data:"), " "))
	}
	observer.line.Reset()
	observer.lineBytes = 0
	return stopped
}

func (observer *sseObserver) finish() {
	if observer.lineBytes > 0 {
		observer.finishLine()
	}
	if !observer.discarded && observer.frame.Len() > 0 {
		observer.event(observer.frame.String())
		observer.frame.Reset()
	}
}

func (observer *sseObserver) event(data string) bool {
	if data == "" {
		return false
	}
	if data == "[DONE]" {
		observer.done = true
		return false
	}
	var frame struct {
		ID      string         `json:"id"`
		Usage   *protocolUsage `json:"usage"`
		Choices []struct {
			FinishReason *string `json:"finish_reason"`
			Delta        struct {
				Content   string `json:"content"`
				Reasoning string `json:"reasoning_content"`
			} `json:"delta"`
		} `json:"choices"`
	}
	if err := json.Unmarshal([]byte(data), &frame); err != nil {
		return false
	}
	if observer.trace != nil {
		observer.trace.Observe(billing.Usage{}, frame.ID)
		final := len(frame.Choices) == 0
		if len(frame.Choices) > 0 {
			final = true
			for _, choice := range frame.Choices {
				if choice.FinishReason == nil {
					final = false
				}
			}
		}
		if frame.Usage != nil && final {
			observer.trace.Observe(frame.Usage.fact("upstream_sse"), frame.ID)
		}
	}
	if observer.guard != nil && len(frame.Choices) > 0 {
		return observer.guard.delta(frame.Choices[0].Delta.Content + frame.Choices[0].Delta.Reasoning)
	}
	return false
}
