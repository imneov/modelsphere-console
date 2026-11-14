package billing_test

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/modelsphere/console/internal/billing"
)

func TestTrustedRecoveryCompletesStartOnlyRequestWithoutRegeneration(t *testing.T) {
	store, err := billing.Open(t.Context(), "sqlite", filepath.Join(t.TempDir(), "recovery.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := store.Close(); err != nil {
			t.Error(err)
		}
	})
	started := time.Now().UTC().Add(-time.Minute)
	terminal := started.Add(time.Second)
	start := billing.Event{SchemaVersion: 1, EventID: "start", Type: "request_started", RequestID: "request", OwnerUID: "user", WalletID: "user", IdentitySource: "session", Model: "qwen", Upstream: "trusted", AttemptID: "attempt", OccurredAt: started}
	if err := store.Ingest(t.Context(), []billing.Event{start}, nil); err != nil {
		t.Fatal(err)
	}
	upstream := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != "GET" || request.URL.Path != "/usage/request" || request.Header.Get("Authorization") != "Bearer trusted-token" {
			t.Errorf("unexpected reconciliation request: %s %s", request.Method, request.URL.Path)
			writer.WriteHeader(400)
			return
		}
		if err := json.NewEncoder(writer).Encode(map[string]any{"request_id": "request", "model": "qwen", "terminal_at": terminal, "usage": billing.Usage{InputTokens: 10, OutputTokens: 5, Complete: true}}); err != nil {
			t.Error(err)
		}
	}))
	t.Cleanup(upstream.Close)
	journal, err := billing.OpenJournal(t.Context(), billing.JournalOptions{Directory: t.TempDir(), SegmentBytes: 4096, MaxBytes: 16384, SyncMode: "record"})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := journal.Close(); err != nil {
			t.Error(err)
		}
	})
	service := billing.Service{Store: store, Meter: &billing.Meter{Journal: journal, Log: slog.New(slog.DiscardHandler)}, Verifier: &billing.HTTPUsageVerifier{URLTemplate: upstream.URL + "/usage/{request_id}", Upstream: "trusted", Token: "trusted-token"}}
	page, err := store.Requests(t.Context(), billing.Filter{OwnerUID: "user", Page: 1, Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	for range 2 {
		if err := service.Supplement(t.Context(), page.Items[0]); err != nil {
			t.Fatal(err)
		}
	}
	price := billing.Price{RuleID: "rule", Version: "v1", Model: "qwen", Currency: "USD", UnitTokens: 1, InputRate: 1, OutputRate: 2}
	if err := journal.Replay(t.Context(), func(event billing.Event) error {
		return store.Ingest(t.Context(), []billing.Event{event}, func(string) (billing.Price, bool) { return price, true })
	}); err != nil {
		t.Fatal(err)
	}
	page, err = store.Requests(t.Context(), billing.Filter{OwnerUID: "user", Page: 1, Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	request := page.Items[0]
	if request.TerminalAt == nil || !request.TerminalAt.Equal(terminal) || request.Charge == nil || request.Charge.Amount != 20 || request.Reason != "upstream_reconciled" {
		t.Fatalf("incomplete trusted recovery: %+v", request)
	}
}
