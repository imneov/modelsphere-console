package server

import (
	"bufio"
	"context"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/modelsphere/console/internal/billing"
)

func TestBothEntrypointsCancelUpstreamAndRetainConfirmedUsage(t *testing.T) {
	for _, source := range []string{"sdk", "session"} {
		t.Run(source, func(t *testing.T) { testCancelledMeteredStream(t, source) })
	}
}

func testCancelledMeteredStream(t *testing.T, source string) {
	upstreamCancelled := make(chan struct{}, 1)
	upstream := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if strings.HasSuffix(request.URL.Path, "/models") {
			_, _ = writer.Write([]byte(`{"data":[{"id":"qwen"}]}`))
			return
		}
		writer.Header().Set("Content-Type", "text/event-stream")
		_, _ = writer.Write([]byte("data: {\"usage\":{\"prompt_tokens\":10,\"completion_tokens\":5}}\n\n"))
		writer.(http.Flusher).Flush()
		<-request.Context().Done()
		upstreamCancelled <- struct{}{}
	}))
	defer upstream.Close()
	server := crdInferenceServerAt(t, upstream.URL)
	journal, err := billing.OpenJournal(t.Context(), billing.JournalOptions{Directory: t.TempDir(), SegmentBytes: 4096, MaxBytes: 65536, SyncMode: "record"})
	if err != nil {
		t.Fatal(err)
	}
	defer journal.Close()
	server.SetMetering(&billing.Meter{Journal: journal, FailurePolicy: "continue", PublishTimeout: time.Second, Log: slog.New(slog.DiscardHandler)})
	handler := server.Handler()
	admin := login(t, handler, "admin", "admin-pw")
	token, path := admin, "/api/llm/v1/chat/completions"
	if source == "sdk" {
		key := createKey(t, handler, admin, `{"name":"cancel","user":"bob"}`)
		token, path = key.Value, "/v1/chat/completions"
		awaitKeyModels(t, handler, key.Value)
	}
	console := httptest.NewServer(handler)
	defer console.Close()
	ctx, cancel := context.WithTimeout(t.Context(), 3*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, "POST", console.URL+path, strings.NewReader(`{"model":"qwen","stream":true}`))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Authorization", "Bearer "+token)
	response, err := console.Client().Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if _, err := bufio.NewReader(response.Body).ReadString('\n'); err != nil {
		t.Fatal(err)
	}
	cancel()
	select {
	case <-upstreamCancelled:
	case <-time.After(3 * time.Second):
		t.Fatal("cancellation did not reach upstream")
	}
	assertCancelledTerminal(t, journal)
}

func assertCancelledTerminal(t *testing.T, journal *billing.Journal) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	var terminal []billing.Event
	for len(terminal) == 0 {
		if err := journal.Replay(t.Context(), func(event billing.Event) error {
			if event.Type == "request_terminal" {
				terminal = append(terminal, event)
			}
			return nil
		}); err != nil {
			t.Fatal(err)
		}
		if time.Now().After(deadline) {
			t.Fatal("cancelled request has no terminal")
		}
		if len(terminal) == 0 {
			time.Sleep(time.Millisecond)
		}
	}
	if len(terminal) != 1 || terminal[0].Reason != "cancelled" || !terminal[0].Usage.Complete || terminal[0].Usage.InputTokens != 10 || terminal[0].Usage.OutputTokens != 5 {
		t.Fatalf("cancelled request lost confirmed usage: %+v", terminal)
	}
}

func awaitKeyModels(t *testing.T, handler http.Handler, credential string) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for {
		response := do(handler, "GET", "/v1/models", credential, "")
		if response.Code == http.StatusOK {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("key cache did not converge: %d %s", response.Code, response.Body.String())
		}
		time.Sleep(time.Millisecond)
	}
}
