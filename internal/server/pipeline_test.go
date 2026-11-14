package server

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"net/http/httptrace"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/modelsphere/console/internal/billing"
	"github.com/modelsphere/console/internal/router"
)

type inferenceTransport func(*http.Request) (*http.Response, error)

func (transport inferenceTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	return transport(request)
}

func pipelineServer(t *testing.T) (*Server, *billing.Journal) {
	t.Helper()
	server := crdInferenceServer(t)
	journal, err := billing.OpenJournal(t.Context(), billing.JournalOptions{Directory: t.TempDir(), SegmentBytes: 4096, MaxBytes: 65536, SyncMode: "record"})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := journal.Close(); err != nil {
			t.Error(err)
		}
	})
	server.SetMetering(&billing.Meter{Journal: journal, FailurePolicy: "continue", PublishTimeout: time.Second, Log: slog.New(slog.DiscardHandler)})
	return server, journal
}

func TestSafeDialRetryKeepsOneLogicalRequestAndDistinctAttempts(t *testing.T) {
	server, journal := pipelineServer(t)
	var count atomic.Int64
	requests := []*http.Request{}
	transport := inferenceTransport(func(request *http.Request) (*http.Response, error) {
		requests = append(requests, request.Clone(request.Context()))
		if count.Add(1) == 1 {
			return nil, &net.OpError{Op: "dial", Net: "tcp", Err: net.UnknownNetworkError("injected unavailable connection")}
		}
		return &http.Response{StatusCode: http.StatusOK, Header: http.Header{"Content-Type": []string{"application/json"}}, Body: io.NopCloser(strings.NewReader(`{"usage":{"prompt_tokens":100,"completion_tokens":20}}`)), Request: request}, nil
	})
	if err := server.router.ConfigurePipeline(router.PipelineOptions{MaxAttempts: 3, MaxSSEFrameBytes: 1 << 20, Transport: transport}); err != nil {
		t.Fatal(err)
	}
	handler := server.Handler()
	admin := login(t, handler, "admin", "admin-pw")
	key := createKey(t, handler, admin, `{"name":"retry","user":"bob"}`)
	awaitKeyResponse(t, handler, key.Value, "qwen", http.StatusOK)
	if count.Load() != 2 {
		t.Fatalf("dial attempts: %d", count.Load())
	}
	if requests[0].Header.Get("X-Request-ID") == "" || requests[0].Header.Get("X-Request-ID") != requests[1].Header.Get("X-Request-ID") || requests[0].Header.Get("X-ModelSphere-Attempt-ID") == requests[1].Header.Get("X-ModelSphere-Attempt-ID") {
		t.Fatal("request or attempt identity was reused incorrectly")
	}
	events := []billing.Event{}
	if err := journal.Replay(t.Context(), func(event billing.Event) error { events = append(events, event); return nil }); err != nil {
		t.Fatal(err)
	}
	if len(events) != 2 || events[0].RequestID != events[1].RequestID || len(events[1].Attempts) != 2 || !events[1].Usage.Complete {
		t.Fatalf("logical metering events: %+v", events)
	}
}

func TestUncertainConsumptionIsNeverAutomaticallyRetried(t *testing.T) {
	server, _ := pipelineServer(t)
	var count atomic.Int64
	transport := inferenceTransport(func(request *http.Request) (*http.Response, error) {
		count.Add(1)
		if trace := httptrace.ContextClientTrace(request.Context()); trace != nil && trace.WroteRequest != nil {
			trace.WroteRequest(httptrace.WroteRequestInfo{})
		}
		return nil, io.ErrUnexpectedEOF
	})
	if err := server.router.ConfigurePipeline(router.PipelineOptions{MaxAttempts: 3, MaxSSEFrameBytes: 1 << 20, Transport: transport}); err != nil {
		t.Fatal(err)
	}
	handler := server.Handler()
	admin := login(t, handler, "admin", "admin-pw")
	key := createKey(t, handler, admin, `{"name":"uncertain","user":"bob"}`)
	awaitKeyResponse(t, handler, key.Value, "qwen", http.StatusBadGateway)
	if count.Load() != 1 {
		t.Fatalf("uncertain consumption retried %d times", count.Load())
	}
}

func TestRepeatedSSEProtectionCancelsUpstreamAndKeepsOneTerminal(t *testing.T) {
	upstreamCancelled := make(chan struct{})
	upstream := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path == "/llm/v1/models" {
			_, _ = writer.Write([]byte(`{"data":[{"id":"qwen"}]}`))
			return
		}
		writer.Header().Set("Content-Type", "text/event-stream")
		for range 3 {
			_, _ = writer.Write([]byte("data: {\"choices\":[{\"delta\":{\"content\":\"private-repeat-marker\"}}]}\n\n"))
			writer.(http.Flusher).Flush()
		}
		<-request.Context().Done()
		close(upstreamCancelled)
	}))
	defer upstream.Close()
	server := crdInferenceServerAt(t, upstream.URL)
	journal := attachDurableMeter(t, server)
	if err := server.router.ConfigurePipeline(router.PipelineOptions{MaxAttempts: 3, MaxSSEFrameBytes: 1 << 20, RepeatDeltaLimit: 3}); err != nil {
		t.Fatal(err)
	}
	handler := server.Handler()
	admin := login(t, handler, "admin", "admin-pw")
	ctx, cancel := context.WithTimeout(t.Context(), 3*time.Second)
	defer cancel()
	request := httptest.NewRequest(http.MethodPost, "/api/llm/v1/chat/completions", strings.NewReader(`{"model":"qwen","stream":true}`)).WithContext(ctx)
	request.Header.Set("Authorization", "Bearer "+admin)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if !strings.Contains(response.Body.String(), "generation_protection") {
		t.Fatalf("no explicit protection reason: %s", response.Body.String())
	}
	select {
	case <-upstreamCancelled:
	case <-ctx.Done():
		t.Fatal("protection did not cancel upstream")
	}
	events := []billing.Event{}
	if err := journal.Replay(t.Context(), func(event billing.Event) error { events = append(events, event); return nil }); err != nil {
		t.Fatal(err)
	}
	if len(events) != 2 || events[1].Reason != "generation_repetition_limit" || events[1].Usage.Complete || len(events[1].Attempts) != 1 {
		t.Fatalf("protection terminal: %+v", events)
	}
	assertJournalOmitsGeneratedContent(t, events)

}

func TestCircuitRejectsNewRequestsAfterConfiguredUpstreamFailures(t *testing.T) {
	server, journal := pipelineServer(t)
	var calls atomic.Int64
	transport := inferenceTransport(func(request *http.Request) (*http.Response, error) {
		calls.Add(1)
		return &http.Response{StatusCode: http.StatusInternalServerError, Header: http.Header{"Content-Type": []string{"application/json"}}, Body: io.NopCloser(strings.NewReader(`{"error":{"message":"unavailable"}}`)), Request: request}, nil
	})
	if err := server.router.ConfigurePipeline(router.PipelineOptions{MaxAttempts: 3, MaxSSEFrameBytes: 1 << 20, CircuitFailureThreshold: 2, CircuitResetAfter: time.Hour, Transport: transport}); err != nil {
		t.Fatal(err)
	}
	handler := server.Handler()
	admin := login(t, handler, "admin", "admin-pw")
	key := createKey(t, handler, admin, `{"name":"circuit","user":"bob"}`)
	awaitKeyResponse(t, handler, key.Value, "qwen", http.StatusInternalServerError)
	if response := do(handler, http.MethodPost, "/v1/chat/completions", key.Value, `{"model":"qwen"}`); response.Code != http.StatusInternalServerError {
		t.Fatalf("second call: %d", response.Code)
	}
	if response := do(handler, http.MethodPost, "/v1/chat/completions", key.Value, `{"model":"qwen"}`); response.Code != http.StatusServiceUnavailable {
		t.Fatalf("circuit: %d", response.Code)
	}
	if calls.Load() != 2 {
		t.Fatalf("failed or rejected generations were retried: %d", calls.Load())
	}
	count := 0
	if err := journal.Replay(t.Context(), func(billing.Event) error { count++; return nil }); err != nil {
		t.Fatal(err)
	}
	if count != 4 {
		t.Fatalf("circuit rejection was treated as an admitted generation: %d events", count)
	}
}

func assertJournalOmitsGeneratedContent(t *testing.T, events []billing.Event) {
	t.Helper()
	encoded, err := json.Marshal(events)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(encoded), "private-repeat-marker") {
		t.Fatal("generated text leaked into journal events")
	}
}
