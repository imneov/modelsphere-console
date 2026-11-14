package billing_test

import (
	"path/filepath"
	"testing"
	"time"

	"github.com/modelsphere/console/internal/billing"
)

func TestUsageUsesFirstCommittedPriceAndNeverChargesStarts(t *testing.T) {
	store, err := billing.Open(t.Context(), "sqlite", filepath.Join(t.TempDir(), "usage.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := store.Close(); err != nil {
			t.Error(err)
		}
	})
	price := billing.Price{RuleID: "model-price", Version: "v1", Model: "qwen", Currency: "USD", UnitTokens: 1000000, InputRate: 1000000000, CacheRate: 250000000, OutputRate: 2000000000}
	event := billing.Event{SchemaVersion: 1, EventID: "start-1", Type: "request_started", RequestID: "request-1", OwnerUID: "alice-uid", WalletID: "alice-uid", APIKeyID: "key-1", IdentitySource: "sdk", Model: "qwen", Upstream: "backend", AttemptID: "attempt-1", OccurredAt: time.Now().UTC()}
	if err := store.Ingest(t.Context(), []billing.Event{event}, func(string) (billing.Price, bool) { return price, true }); err != nil {
		t.Fatal(err)
	}
	page, err := store.Requests(t.Context(), billing.Filter{OwnerUID: "alice-uid", Page: 1, Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if page.TotalItems != 1 || page.Items[0].Charge != nil {
		t.Fatalf("start charged: %+v", page)
	}
	event.EventID, event.Type, event.Reason = "terminal-1", "request_terminal", "completed"
	event.Usage = billing.Usage{InputTokens: 1000, CacheTokens: 200, OutputTokens: 500, Complete: true, Source: "upstream_json"}
	for range 2 {
		if err := store.Ingest(t.Context(), []billing.Event{event}, func(string) (billing.Price, bool) { return price, true }); err != nil {
			t.Fatal(err)
		}
		price.Version, price.InputRate = "v2", 9000000000
	}
	page, err = store.Requests(t.Context(), billing.Filter{OwnerUID: "alice-uid", Page: 1, Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	charge := page.Items[0].Charge
	if charge == nil || charge.Amount != 1850000 || charge.Price.Version != "v1" || charge.State != "pending" {
		t.Fatalf("first price and cache accounting: %+v", charge)
	}
}
