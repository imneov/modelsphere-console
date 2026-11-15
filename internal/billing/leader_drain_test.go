package billing_test

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"path/filepath"
	"testing"
	"time"

	"github.com/modelsphere/console/internal/billing"
	"k8s.io/client-go/kubernetes/fake"
)

func TestSettlementLeaderDrainsMultipleBatchesWithoutWaitingForIdleInterval(t *testing.T) {
	store := backloggedSettlementStore(t)
	ctx, cancel := context.WithTimeout(t.Context(), 2*time.Second)
	defer cancel()
	startDrainingLeader(t, ctx, store)
	ticker := time.NewTicker(5 * time.Millisecond)
	defer ticker.Stop()
	for {
		wallet, err := store.Reconcile(t.Context(), "alice")
		if err != nil {
			t.Fatal(err)
		}
		if wallet.Balance == 997000 && wallet.LedgerBalance == 997000 && wallet.Revision == 4 {
			return
		}
		select {
		case <-ctx.Done():
			t.Fatalf("pending charges were left behind the idle interval: %+v", wallet)
		case <-ticker.C:
		}
	}
}

func backloggedSettlementStore(t *testing.T) *billing.Store {
	t.Helper()
	store, err := billing.Open(t.Context(), "sqlite", filepath.Join(t.TempDir(), "drain.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := store.Close(); err != nil {
			t.Error(err)
		}
	})
	if _, err := store.Credit(t.Context(), billing.Credit{OperationID: "fund", OwnerUID: "alice", Currency: "USD", Amount: 1000000, Kind: "topup", Actor: "admin"}); err != nil {
		t.Fatal(err)
	}
	price := billing.Price{RuleID: "rule", Version: "1", Model: "qwen", Currency: "USD", UnitTokens: 1, InputRate: 1000}
	for index := range 3 {
		identifier := fmt.Sprintf("request-%d", index)
		event := billing.Event{SchemaVersion: 1, EventID: identifier, Type: "request_terminal", RequestID: identifier, OwnerUID: "alice", WalletID: "alice", IdentitySource: "session", Model: "qwen", AttemptID: "attempt", OccurredAt: time.Now().UTC(), Reason: "completed", Usage: billing.Usage{InputTokens: 1, Complete: true, Source: "upstream_json"}}
		if err := store.Ingest(t.Context(), []billing.Event{event}, func(string) (billing.Price, bool) { return price, true }); err != nil {
			t.Fatal(err)
		}
	}
	return store
}

func startDrainingLeader(t *testing.T, parent context.Context, store billing.SettlementStore) {
	t.Helper()
	ctx, cancel := context.WithCancel(parent)
	options := billing.LeaderOptions{Namespace: "test", Name: "billing", Identity: "worker", LeaseDuration: 3 * time.Second, RenewDeadline: 2 * time.Second, RetryPeriod: 250 * time.Millisecond, Interval: time.Hour, MaxWallets: 1, MaxCharges: 1}
	projection := blockedProjection{started: make(chan struct{}, 1)}
	result := make(chan error, 1)
	go func() {
		result <- billing.RunSettlementLeader(ctx, fake.NewClientset().CoordinationV1(), store, projection, options, slog.New(slog.DiscardHandler))
	}()
	t.Cleanup(func() {
		cancel()
		select {
		case err := <-result:
			if !errors.Is(err, context.Canceled) && !errors.Is(err, context.DeadlineExceeded) {
				t.Errorf("settlement leader stopped unexpectedly: %v", err)
			}
		case <-time.After(time.Second):
			t.Error("settlement leader did not stop")
		}
	})
}

type waitingSettlementStore struct {
	calls chan struct{}
	err   error
}

func (store waitingSettlementStore) AcquireFence(context.Context, string) (int64, error) {
	return 1, nil
}

func (store waitingSettlementStore) Settle(context.Context, int64, int, int) (int, error) {
	select {
	case store.calls <- struct{}{}:
	default:
	}
	return 0, store.err
}

func TestSettlementLeaderWaitsWhenEmptyOrDatabaseFails(t *testing.T) {
	for _, scenario := range []struct {
		name string
		err  error
	}{{name: "empty"}, {name: "database_failure", err: errors.New("database unavailable")}} {
		t.Run(scenario.name, func(t *testing.T) {
			store := waitingSettlementStore{calls: make(chan struct{}, 2), err: scenario.err}
			startDrainingLeader(t, t.Context(), store)
			select {
			case <-store.calls:
			case <-time.After(2 * time.Second):
				t.Fatal("leader never attempted settlement")
			}
			select {
			case <-store.calls:
				t.Fatal("leader retried without idle/error backoff")
			case <-time.After(100 * time.Millisecond):
			}
		})
	}
}
