package billing_test

import (
	"errors"
	"path/filepath"
	"testing"
	"time"

	"github.com/modelsphere/console/internal/billing"
)

// summaryFixture builds four requests that cover every settlement state plus a
// top-up and one charge, which is the same spread the summary cards summarize.
func summaryFixture(t *testing.T) *billing.Store {
	t.Helper()
	store, err := billing.Open(t.Context(), "sqlite", filepath.Join(t.TempDir(), "summary.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := store.Close(); err != nil {
			t.Error(err)
		}
	})
	if _, err := store.Credit(t.Context(), billing.Credit{OperationID: "topup", OwnerUID: "alice", Currency: "USD", Amount: 1000000000, Kind: "topup", Actor: "admin"}); err != nil {
		t.Fatal(err)
	}
	price := billing.Price{RuleID: "rule", Version: "1", Model: "qwen", Currency: "USD", UnitTokens: 1000000, InputRate: 1000000000}
	lookup := func(string) (billing.Price, bool) { return price, true }
	startedAt := time.Now().UTC().Add(-time.Minute)
	terminal := func(requestID string, occurredAt time.Time, usage billing.Usage, lookup billing.PriceLookup) error {
		start := billing.Event{SchemaVersion: 1, EventID: "start/" + requestID, Type: "request_started", RequestID: requestID, OwnerUID: "alice", WalletID: "alice", IdentitySource: "session", Model: "qwen", Upstream: "backend", AttemptID: "attempt", OccurredAt: startedAt}
		if err := store.Ingest(t.Context(), []billing.Event{start}, lookup); err != nil {
			return err
		}
		done := start
		done.EventID, done.Type, done.Reason, done.OccurredAt, done.Usage = "terminal/"+requestID, "request_terminal", "completed", occurredAt, usage
		return store.Ingest(t.Context(), []billing.Event{done}, lookup)
	}
	if err := terminal("settled-request", startedAt.Add(time.Second), billing.Usage{InputTokens: 1000, CacheTokens: 200, OutputTokens: 500, Complete: true, Source: "upstream_json"}, lookup); err != nil {
		t.Fatal(err)
	}
	fence, err := store.AcquireFence(t.Context(), "test")
	if err != nil {
		t.Fatal(err)
	}
	if settled, err := store.Settle(t.Context(), fence, 10, 100); err != nil || settled != 1 {
		t.Fatalf("settle first charge: %d %v", settled, err)
	}
	if err := terminal("pending-request", startedAt.Add(2*time.Second), billing.Usage{InputTokens: 2000, OutputTokens: 1000, Complete: true, Source: "upstream_json"}, lookup); err != nil {
		t.Fatal(err)
	}
	started := billing.Event{SchemaVersion: 1, EventID: "start/running-request", Type: "request_started", RequestID: "running-request", OwnerUID: "alice", WalletID: "alice", IdentitySource: "session", Model: "qwen", Upstream: "backend", AttemptID: "attempt", OccurredAt: startedAt.Add(3 * time.Second)}
	if err := store.Ingest(t.Context(), []billing.Event{started}, lookup); err != nil {
		t.Fatal(err)
	}
	if err := terminal("failed-request", startedAt.Add(4*time.Second), billing.Usage{InputTokens: 4000, Complete: true, Source: "upstream_json"}, func(string) (billing.Price, bool) { return billing.Price{}, false }); !errors.Is(err, billing.ErrPriceMissing) {
		t.Fatalf("unpriced terminal: %v", err)
	}
	return store
}

func TestUsageSummaryCountsEveryStateAndTheSelectedScopeOnly(t *testing.T) {
	store := summaryFixture(t)
	base := billing.Filter{OwnerUID: "alice", Page: 1, Limit: 20}
	all, err := store.SummarizeUsage(t.Context(), base)
	if err != nil {
		t.Fatal(err)
	}
	want := billing.UsageSummary{
		Requests: 4, InputTokens: 7000, CacheTokens: 200, OutputTokens: 1500,
		States: billing.UsageStates{Settled: 1, Pending: 1, Started: 1, Failed: 1},
	}
	if all != want {
		t.Fatalf("all states: %+v", all)
	}
	settled := base
	settled.State = "settled"
	scoped, err := store.SummarizeUsage(t.Context(), settled)
	if err != nil {
		t.Fatal(err)
	}
	if scoped.Requests != 1 || scoped.InputTokens != 1000 || scoped.States != want.States {
		t.Fatalf("settled scope: %+v", scoped)
	}
	running := base
	running.State = "started"
	startedOnly, err := store.SummarizeUsage(t.Context(), running)
	if err != nil {
		t.Fatal(err)
	}
	if startedOnly.Requests != 1 || startedOnly.InputTokens != 0 {
		t.Fatalf("started scope: %+v", startedOnly)
	}
	invalid := base
	invalid.State = "bogus"
	if _, err := store.SummarizeUsage(t.Context(), invalid); err == nil {
		t.Fatal("invalid state accepted")
	}
}

func TestLedgerSummarySplitsTopupsChargesAndNet(t *testing.T) {
	store := summaryFixture(t)
	summary, err := store.SummarizeLedger(t.Context(), billing.Filter{OwnerUID: "alice", Page: 1, Limit: 20})
	if err != nil {
		t.Fatal(err)
	}
	// The pending charge is not in the ledger until settlement, so the only
	// charge is the settled one: 800 billable input tokens at 1e-3 each (the
	// 200 cached tokens are billed at the zero cache rate).
	if summary.Topups != 1000000000 || summary.Charges != -800000 || summary.Adjustments != 0 || summary.Net != 999200000 {
		t.Fatalf("ledger summary: %+v", summary)
	}
	wallet, err := store.Reconcile(t.Context(), "alice")
	if err != nil {
		t.Fatal(err)
	}
	if summary.Net != wallet.LedgerBalance {
		t.Fatalf("summary net %d differs from ledger balance %d", summary.Net, wallet.LedgerBalance)
	}
}

func TestCustomerWalletsAggregatesCurrentBalancesAndWindowedMovements(t *testing.T) {
	store := summaryFixture(t)
	now := time.Now().UTC()
	customers, err := store.CustomerWallets(t.Context(), now.Add(-time.Hour), now.Add(time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	if len(customers) != 1 {
		t.Fatalf("customers = %+v", customers)
	}
	alice := customers[0]
	if alice.OwnerUID != "alice" || alice.Balance != 999200000 || alice.Topups != 1000000000 || alice.Charges != -800000 || alice.Net != 999200000 {
		t.Fatalf("customer wallet = %+v", alice)
	}
	if alice.BillingState != "allowed" {
		t.Fatalf("billing state = %q", alice.BillingState)
	}
	empty, err := store.CustomerWallets(t.Context(), now.Add(time.Hour), now.Add(2*time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	if len(empty) != 1 || empty[0].Topups != 0 || empty[0].Charges != 0 || empty[0].Net != 0 {
		t.Fatalf("empty movement window = %+v", empty)
	}
}
