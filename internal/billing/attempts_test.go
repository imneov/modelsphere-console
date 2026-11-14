package billing_test

import (
	"errors"
	"path/filepath"
	"testing"
	"time"

	"github.com/modelsphere/console/internal/billing"
)

func TestLateStartPreservesTheTerminalAttemptAndItsPricing(t *testing.T) {
	store, err := billing.Open(t.Context(), "sqlite", filepath.Join(t.TempDir(), "attempts.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := store.Close(); err != nil {
			t.Error(err)
		}
	})
	price := billing.Price{RuleID: "rule", Version: "v1", Model: "qwen", Currency: "USD", UnitTokens: 1, InputRate: 1, OutputRate: 2}
	event := billing.Event{SchemaVersion: 1, EventID: "terminal", Type: "request_terminal", RequestID: "request", OwnerUID: "alice", WalletID: "alice", IdentitySource: "session", Model: "qwen", AttemptID: "attempt-2", Attempts: []billing.Attempt{{ID: "attempt-1", Reason: "connection_failed"}, {ID: "attempt-2", Reason: "completed"}}, OccurredAt: time.Now().UTC(), Reason: "completed", Usage: billing.Usage{InputTokens: 100, OutputTokens: 20, Complete: true, Source: "upstream_json"}}
	prices := func(string) (billing.Price, bool) { return price, true }
	if err := store.Ingest(t.Context(), []billing.Event{event}, prices); err != nil {
		t.Fatal(err)
	}
	event.EventID, event.Type, event.AttemptID, event.Reason = "start", "request_started", "attempt-1", ""
	event.Attempts, event.Usage = nil, billing.Usage{}
	if err := store.Ingest(t.Context(), []billing.Event{event}, prices); err != nil {
		t.Fatal(err)
	}
	page, err := store.Requests(t.Context(), billing.Filter{OwnerUID: "alice", Page: 1, Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	request := page.Items[0]
	if request.AttemptID != "attempt-2" || len(request.Attempts) != 2 || request.Charge == nil || request.Charge.Amount != 140 || request.Charge.Revision != 1 {
		t.Fatalf("late start changed terminal facts: %+v", request)
	}
	conflict := billing.Event{SchemaVersion: 1, EventID: "another-terminal", Type: "request_terminal", RequestID: request.RequestID, OwnerUID: request.OwnerUID, WalletID: request.WalletID, IdentitySource: request.IdentitySource, Model: request.Model, AttemptID: "different-attempt", OccurredAt: time.Now().UTC(), Reason: request.Reason, Usage: request.Usage}
	if err := store.Ingest(t.Context(), []billing.Event{conflict}, prices); !errors.Is(err, billing.ErrConflict) {
		t.Fatalf("a second terminal changed immutable attempt facts: %v", err)
	}
}
