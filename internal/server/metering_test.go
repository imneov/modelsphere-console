package server

import (
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/modelsphere/console/internal/billing"
)

func TestSDKAndPlaygroundRecordTrustedOwnershipThroughOneMeter(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		if request.URL.Path == "/llm/v1/models" {
			_, _ = writer.Write([]byte(`{"data":[{"id":"qwen"}]}`))
			return
		}
		_, _ = writer.Write([]byte(`{"id":"upstream-1","choices":[],"usage":{"prompt_tokens":100,"completion_tokens":20,"prompt_tokens_details":{"cached_tokens":30}}}`))
	}))
	t.Cleanup(upstream.Close)
	journal, err := billing.OpenJournal(t.Context(), billing.JournalOptions{Directory: t.TempDir(), SegmentBytes: 4096, MaxBytes: 65536, SyncMode: "record"})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := journal.Close(); err != nil {
			t.Error(err)
		}
	})
	server := crdInferenceServerAt(t, upstream.URL)
	server.SetMetering(&billing.Meter{Journal: journal, FailurePolicy: "continue", PublishTimeout: time.Second, Log: slog.New(slog.DiscardHandler)})
	handler := server.Handler()
	admin := login(t, handler, "admin", "admin-pw")
	key := createKey(t, handler, admin, `{"name":"bob-key","user":"bob"}`)
	awaitKeyResponse(t, handler, key.Value, "qwen", http.StatusOK)
	response := do(handler, "POST", "/api/llm/v1/chat/completions", admin, `{"model":"qwen","ownerUserID":"bob-uid","walletID":"bob-uid"}`)
	if response.Code != http.StatusOK {
		t.Fatalf("session: %d %s", response.Code, response.Body.String())
	}
	events := []billing.Event{}
	if err := journal.Replay(t.Context(), func(event billing.Event) error { events = append(events, event); return nil }); err != nil {
		t.Fatal(err)
	}
	if len(events) != 4 {
		t.Fatalf("logical request lifecycle events: %d", len(events))
	}
	if events[0].OwnerUID != "bob-uid" || events[0].APIKeyID != key.ID || events[0].IdentitySource != "sdk" {
		t.Fatalf("SDK ownership: %+v", events[0])
	}
	if events[2].OwnerUID != "admin-uid" || events[2].WalletID != "admin-uid" || events[2].APIKeyID != "" || events[2].IdentitySource != "session" {
		t.Fatalf("session ownership spoofed: %+v", events[2])
	}
	for _, index := range []int{1, 3} {
		if !events[index].Usage.Complete || events[index].Usage.InputTokens != 100 || events[index].Usage.CacheTokens != 30 || events[index].Usage.OutputTokens != 20 {
			t.Fatalf("usage: %+v", events[index])
		}
	}
}
