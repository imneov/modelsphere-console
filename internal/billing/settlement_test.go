package billing_test

import (
	"errors"
	"path/filepath"
	"testing"
	"time"

	"github.com/modelsphere/console/internal/billing"
)

func TestSettlementFencesOldLeadersAndAllowsNegativeBalances(t *testing.T) {
	store, err := billing.Open(t.Context(), "sqlite", filepath.Join(t.TempDir(), "settlement.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := store.Close(); err != nil {
			t.Error(err)
		}
	})
	if _, err := store.Credit(t.Context(), billing.Credit{OperationID: "credit", OwnerUID: "alice", Currency: "USD", Amount: 1000000000, Kind: "topup", Actor: "admin"}); err != nil {
		t.Fatal(err)
	}
	price := billing.Price{RuleID: "rule", Version: "1", Model: "qwen", Currency: "USD", UnitTokens: 1, InputRate: 2000000000}
	event := billing.Event{SchemaVersion: 1, EventID: "terminal", Type: "request_terminal", RequestID: "request", OwnerUID: "alice", WalletID: "alice", IdentitySource: "session", Model: "qwen", AttemptID: "attempt", OccurredAt: time.Now().UTC(), Reason: "completed", Usage: billing.Usage{InputTokens: 1, Complete: true, Source: "upstream_json"}}
	if err := store.Ingest(t.Context(), []billing.Event{event}, func(string) (billing.Price, bool) { return price, true }); err != nil {
		t.Fatal(err)
	}
	old, err := store.AcquireFence(t.Context(), "old")
	if err != nil {
		t.Fatal(err)
	}
	current, err := store.AcquireFence(t.Context(), "new")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.Settle(t.Context(), old, 10, 100); !errors.Is(err, billing.ErrFenced) {
		t.Fatalf("old leader accepted: %v", err)
	}
	for range 2 {
		if _, err := store.Settle(t.Context(), current, 10, 100); err != nil {
			t.Fatal(err)
		}
	}
	wallet, err := store.Reconcile(t.Context(), "alice")
	if err != nil {
		t.Fatal(err)
	}
	if wallet.Balance != -1000000000 || wallet.Balance != wallet.LedgerBalance || wallet.Revision != 2 || wallet.BillingState != "blocked" {
		t.Fatalf("settlement: %+v", wallet)
	}
}
