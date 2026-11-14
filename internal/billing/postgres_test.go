package billing_test

import (
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/modelsphere/console/internal/billing"
	"github.com/modelsphere/console/internal/testservices"
)

func postgresStore(t *testing.T) *billing.Store {
	t.Helper()
	store, err := billing.Open(t.Context(), "postgres", testservices.PostgresDSN(t))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := store.Close(); err != nil {
			t.Error(err)
		}
	})
	return store
}

func TestPostgresConcurrentDuplicateCreditsHaveOneFinancialEffect(t *testing.T) {
	store := postgresStore(t)
	credit := billing.Credit{OperationID: "topup", OwnerUID: "alice", Currency: "USD", Amount: 2000000000, Actor: "admin", Kind: "topup"}
	ready := make(chan struct{})
	results := make(chan error, 16)
	var group sync.WaitGroup
	for range 16 {
		group.Add(1)
		go func() { defer group.Done(); <-ready; _, err := store.Credit(t.Context(), credit); results <- err }()
	}
	close(ready)
	group.Wait()
	close(results)
	for err := range results {
		if err != nil {
			t.Fatal(err)
		}
	}
	wallet, err := store.Reconcile(t.Context(), "alice")
	if err != nil {
		t.Fatal(err)
	}
	if wallet.Balance != 2000000000 || wallet.LedgerBalance != wallet.Balance || wallet.Revision != 1 {
		t.Fatalf("concurrent credit: %+v", wallet)
	}
}

func TestPostgresPriceConflictRollsBackUsageAndNewLeaderFencesOld(t *testing.T) {
	store := postgresStore(t)
	price := billing.Price{RuleID: "rule", Version: "v1", Model: "qwen", Currency: "USD", UnitTokens: 1, InputRate: 1000000000}
	if err := store.SavePrice(t.Context(), price); err != nil {
		t.Fatal(err)
	}
	event := billing.Event{SchemaVersion: 1, EventID: "event", Type: "request_terminal", RequestID: "request", OwnerUID: "alice", WalletID: "alice", IdentitySource: "session", Model: "qwen", AttemptID: "attempt", OccurredAt: time.Now().UTC(), Reason: "completed", Usage: billing.Usage{InputTokens: 2, Complete: true, Source: "upstream_json"}}
	conflicting := price
	conflicting.InputRate = 2000000000
	if err := store.Ingest(t.Context(), []billing.Event{event}, func(string) (billing.Price, bool) { return conflicting, true }); !errors.Is(err, billing.ErrConflict) {
		t.Fatalf("price conflict: %v", err)
	}
	page, err := store.Requests(t.Context(), billing.Filter{OwnerUID: "alice", Page: 1, Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if page.TotalItems != 0 {
		t.Fatal("transaction left partially persisted usage")
	}
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
		t.Fatalf("old writer: %v", err)
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
	if wallet.Balance != -2000000000 || wallet.Balance != wallet.LedgerBalance || wallet.Revision != 1 {
		t.Fatalf("single negative debit: %+v", wallet)
	}
}
