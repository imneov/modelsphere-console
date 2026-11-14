package router

import (
	"encoding/json"
	"errors"
	"io"
	"strings"
	"sync"

	"github.com/modelsphere/console/internal/billing"
)

type protocolUsage struct {
	Prompt        *int64 `json:"prompt_tokens"`
	Completion    *int64 `json:"completion_tokens"`
	Input         *int64 `json:"input_tokens"`
	Output        *int64 `json:"output_tokens"`
	PromptDetails struct {
		Cached int64 `json:"cached_tokens"`
	} `json:"prompt_tokens_details"`
	InputDetails struct {
		Cached int64 `json:"cached_tokens"`
	} `json:"input_tokens_details"`
}

func (usage protocolUsage) fact(source string) billing.Usage {
	input, output, cached := usage.Prompt, usage.Completion, usage.PromptDetails.Cached
	if input == nil {
		input, output, cached = usage.Input, usage.Output, usage.InputDetails.Cached
	}
	if input == nil || output == nil {
		return billing.Usage{}
	}
	result := billing.Usage{InputTokens: *input, OutputTokens: *output, CacheTokens: cached, Complete: true, Source: source}
	if result.Validate() != nil {
		return billing.Usage{}
	}
	return result
}

type observedBody struct {
	sse     *sseObserver
	guard   *generationGuard
	pending []byte
	stopped bool
	body    io.ReadCloser
	writer  *io.PipeWriter
	done    chan struct{}
	once    sync.Once
	onError func(error)
}

func observeBody(body io.ReadCloser, trace *billing.Trace, contentType string, onError func(error), guard *generationGuard, frameLimit int) *observedBody {
	observed := &observedBody{body: body, onError: onError, guard: guard}
	if strings.HasPrefix(strings.ToLower(contentType), "text/event-stream") {
		observed.sse = &sseObserver{trace: trace, guard: guard, limit: frameLimit}
		return observed
	}
	reader, writer := io.Pipe()
	observed.writer = writer
	observed.done = make(chan struct{})
	go func() {
		defer close(observed.done)
		defer reader.Close()
		observeJSON(reader, trace)
		_, _ = io.Copy(io.Discard, reader)
	}()
	return observed
}

func (body *observedBody) Read(buffer []byte) (int, error) {
	if body.guard.Reason() != "" {
		return body.protectedRead(buffer)
	}
	count, err := body.body.Read(buffer)
	allowed := body.guard.bytes(count)
	if count > 0 {
		if body.sse != nil {
			if stopAt := body.sse.feed(buffer[:count]); stopAt >= 0 && stopAt < allowed {
				allowed = stopAt
			}
		} else {
			_, _ = body.writer.Write(buffer[:count])
		}
	}
	if err != nil {
		body.finish(err)
	}
	if body.guard.Reason() != "" {
		if allowed > 0 {
			return allowed, nil
		}
		return body.protectedRead(buffer)
	}
	return count, err
}

func (body *observedBody) protectedRead(buffer []byte) (int, error) {
	if body.sse == nil {
		return 0, errors.New(body.guard.Reason())
	}
	if !body.stopped {
		body.pending = protectionFrame(body.guard.Reason())
		body.stopped = true
	}
	if len(body.pending) == 0 {
		return 0, io.EOF
	}
	count := copy(buffer, body.pending)
	body.pending = body.pending[count:]
	return count, nil
}

func (body *observedBody) finish(err error) {
	body.once.Do(func() {
		if body.sse != nil {
			body.sse.finish()
			if !body.sse.done && body.guard.Reason() == "" && body.onError != nil {
				body.onError(io.ErrUnexpectedEOF)
			}
		} else {
			_ = body.writer.CloseWithError(err)
			<-body.done
		}
		if err != nil && err != io.EOF && body.onError != nil {
			body.onError(err)
		}
	})
}

func (body *observedBody) Close() error {
	err := body.body.Close()
	body.finish(io.EOF)
	return err
}

func observeJSON(reader io.Reader, trace *billing.Trace) {
	decoder := json.NewDecoder(reader)
	token, err := decoder.Token()
	if err != nil || token != json.Delim('{') {
		return
	}
	var usage protocolUsage
	var upstreamID string
	for decoder.More() {
		field, err := decoder.Token()
		if err != nil {
			return
		}
		switch field {
		case "usage":
			if err := decoder.Decode(&usage); err != nil {
				return
			}
		case "id":
			if err := decoder.Decode(&upstreamID); err != nil {
				return
			}
		default:
			if err := skipJSONValue(decoder); err != nil {
				return
			}
		}
	}
	if token, err := decoder.Token(); err != nil || token != json.Delim('}') {
		return
	}
	if trace != nil {
		trace.Observe(usage.fact("upstream_json"), upstreamID)
	}
}

func skipJSONValue(decoder *json.Decoder) error {
	token, err := decoder.Token()
	if err != nil {
		return err
	}
	delimiter, nested := token.(json.Delim)
	if !nested || (delimiter != '{' && delimiter != '[') {
		return nil
	}
	depth := 1
	for depth > 0 {
		token, err := decoder.Token()
		if err != nil {
			return err
		}
		if delimiter, ok := token.(json.Delim); ok {
			switch delimiter {
			case '{', '[':
				depth++
			case '}', ']':
				depth--
			}
		}
	}
	return nil
}
