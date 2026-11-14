package billing_test

import (
	"context"
	"log/slog"
	"testing"
	"time"

	"github.com/modelsphere/console/internal/billing"
	"k8s.io/client-go/kubernetes/fake"
)

type observingSettlement struct{ calls chan struct{} }

func (store observingSettlement) AcquireFence(context.Context, string) (int64, error) { return 1, nil }
func (store observingSettlement) Settle(ctx context.Context, _ int64, _, _ int) (int, error) {
	select {
	case store.calls <- struct{}{}:
	case <-ctx.Done():
	}
	return 0, ctx.Err()
}

type blockedProjection struct{ started chan struct{} }

func (projection blockedProjection) ProjectPending(ctx context.Context, _ int) error {
	select {
	case projection.started <- struct{}{}:
	default:
	}
	<-ctx.Done()
	return ctx.Err()
}

func TestSlowAdmissionProjectionDoesNotStopFinancialSettlement(t *testing.T) {
	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()
	store := observingSettlement{calls: make(chan struct{}, 10)}
	projection := blockedProjection{started: make(chan struct{}, 1)}
	result := make(chan error, 1)
	client := fake.NewClientset().CoordinationV1()
	options := billing.LeaderOptions{Namespace: "test", Name: "billing", Identity: "worker", LeaseDuration: 3 * time.Second, RenewDeadline: 2 * time.Second, RetryPeriod: 250 * time.Millisecond, Interval: 10 * time.Millisecond, MaxWallets: 100, MaxCharges: 100}
	go func() {
		result <- billing.RunSettlementLeader(ctx, client, store, projection, options, slog.New(slog.DiscardHandler))
	}()
	defer func() {
		cancel()
		select {
		case <-result:
		case <-time.After(time.Second):
			t.Error("leader did not stop")
		}
	}()
	select {
	case <-projection.started:
	case <-ctx.Done():
		t.Fatal("projection never started")
	}
	for range 2 {
		select {
		case <-store.calls:
		case <-ctx.Done():
			t.Fatal("slow API projection stopped financial settlement")
		}
	}
}
