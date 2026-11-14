package server

import (
	"bufio"
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/modelsphere/console/internal/billing"
)

func TestBothEntrypointsDeliverSSEBeforeFinalUsage(t *testing.T) {
	for _, source := range []string{"sdk", "session"} {
		t.Run(source, func(t *testing.T) { testMeteredStream(t, source) })
	}
}

func testMeteredStream(t *testing.T, source string) {
	t.Helper()
	release := make(chan struct{})
	defer close(release)
	upstream := streamingUsageServer(t, release)
	defer upstream.Close()
	server := crdInferenceServerAt(t, upstream.URL)
	journal := attachDurableMeter(t, server)
	handler := server.Handler()
	admin := login(t, handler, "admin", "admin-pw")
	token, path := admin, "/api/llm/v1/chat/completions"
	if source == "sdk" {
		key := createKey(t, handler, admin, `{"name":"stream","user":"bob"}`)
		token, path = key.Value, "/v1/chat/completions"
	}
	console := httptest.NewServer(handler)
	defer console.Close()
	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, console.URL+path, strings.NewReader(`{"model":"qwen","stream":true}`))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Authorization", "Bearer "+token)
	response, err := console.Client().Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	reader := bufio.NewReader(response.Body)
	first, err := reader.ReadString('\n')
	if err != nil || !strings.Contains(first, "first") {
		t.Fatalf("first frame: %q %v", first, err)
	}
	release <- struct{}{}
	if _, err := io.ReadAll(reader); err != nil {
		t.Fatal(err)
	}
	assertCompleteStreamUsage(t, journal)

}

func streamingUsageServer(t *testing.T, release <-chan struct{}) *httptest.Server {
	t.Helper()
	upstream := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path == "/llm/v1/models" {
			_, _ = writer.Write([]byte(`{"data":[{"id":"qwen"}]}`))
			return
		}
		writer.Header().Set("Content-Type", "text/event-stream")
		_, _ = writer.Write([]byte("data: {\"choices\":[{\"delta\":{\"content\":\"first\"}}]}\n\n"))
		writer.(http.Flusher).Flush()
		select {
		case <-release:
		case <-request.Context().Done():
			return
		}
		_, _ = writer.Write([]byte("data: {\"usage\":{\"prompt_tokens\":100,\"completion_tokens\":20,\"prompt_tokens_details\":{\"cached_tokens\":30}}}\n\ndata: [DONE]\n\n"))
	}))
	return upstream
}

func assertCompleteStreamUsage(t *testing.T, journal *billing.Journal) {
	t.Helper()
	var terminal *billing.Event
	if err := journal.Replay(t.Context(), func(event billing.Event) error {
		if event.Type == "request_terminal" {
			copy := event
			terminal = &copy
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	if terminal == nil || !terminal.Usage.Complete || terminal.Usage.Source != "upstream_sse" || terminal.Usage.CacheTokens != 30 {
		t.Fatalf("terminal usage: %+v", terminal)
	}
}

func attachDurableMeter(t *testing.T, server *Server) *billing.Journal {
	t.Helper()
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
	return journal
}
