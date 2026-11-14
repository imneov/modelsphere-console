package billing

import (
	"context"
	"errors"
	"log/slog"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	coordination "k8s.io/client-go/kubernetes/typed/coordination/v1"
	"k8s.io/client-go/tools/leaderelection"
	"k8s.io/client-go/tools/leaderelection/resourcelock"
)

type SettlementStore interface {
	AcquireFence(context.Context, string) (int64, error)
	Settle(context.Context, int64, int, int) (int, error)
}
type ProjectionRunner interface {
	ProjectPending(context.Context, int) error
}

type LeaderOptions struct {
	Namespace     string
	Name          string
	Identity      string
	LeaseDuration time.Duration
	RenewDeadline time.Duration
	RetryPeriod   time.Duration
	Interval      time.Duration
	MaxWallets    int
	MaxCharges    int
}

func RunSettlementLeader(ctx context.Context, client coordination.CoordinationV1Interface, store SettlementStore, projector ProjectionRunner, options LeaderOptions, log *slog.Logger) error {
	if client == nil || store == nil || projector == nil || log == nil || options.Identity == "" || options.Namespace == "" || options.Interval <= 0 || options.MaxWallets < 1 || options.MaxCharges < 1 {
		return errors.New("invalid settlement leadership dependencies or batch policy")
	}
	electionContext, cancel := context.WithCancel(ctx)
	defer cancel()
	leading := make(chan context.Context, 1)
	done := make(chan error, 1)
	go func() {
		select {
		case <-electionContext.Done():
			done <- electionContext.Err()
		case leaderContext := <-leading:
			done <- runActiveSettlement(leaderContext, store, projector, options, log)
			cancel()
		}
	}()
	elector, err := leaderelection.NewLeaderElector(leaderelection.LeaderElectionConfig{
		Lock:          &resourcelock.LeaseLock{LeaseMeta: metav1.ObjectMeta{Name: options.Name, Namespace: options.Namespace}, Client: client, LockConfig: resourcelock.ResourceLockConfig{Identity: options.Identity}},
		LeaseDuration: options.LeaseDuration, RenewDeadline: options.RenewDeadline, RetryPeriod: options.RetryPeriod, ReleaseOnCancel: true, Name: options.Name,
		Callbacks: leaderelection.LeaderCallbacks{OnStartedLeading: func(leaderContext context.Context) {
			select {
			case leading <- leaderContext:
			case <-electionContext.Done():
			}
		}, OnStoppedLeading: func() { cancel() }},
	})
	if err != nil {
		cancel()
		<-done
		return err
	}
	elector.Run(electionContext)
	cancel()
	result := <-done
	if ctx.Err() != nil {
		return ctx.Err()
	}
	if result != nil && !errors.Is(result, context.Canceled) {
		return result
	}
	return errors.New("settlement leadership lost")
}

func runActiveSettlement(ctx context.Context, store SettlementStore, projector ProjectionRunner, options LeaderOptions, log *slog.Logger) error {
	generation, err := store.AcquireFence(ctx, options.Identity)
	if err != nil {
		return err
	}
	log.Info("billing settlement leadership acquired", "generation", generation, "holder", options.Identity)
	projectionContext, cancelProjection := context.WithCancel(ctx)
	projected := make(chan struct{})
	go func() { defer close(projected); runProjectionLoop(projectionContext, projector, options, log) }()
	defer func() { cancelProjection(); <-projected }()
	ticker := time.NewTicker(options.Interval)
	defer ticker.Stop()
	for {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		count, err := store.Settle(ctx, generation, options.MaxWallets, options.MaxCharges)
		if errors.Is(err, ErrFenced) {
			return err
		}
		if err != nil && ctx.Err() == nil {
			log.Error("settlement batch deferred", "err", err)
		} else if count > 0 {
			log.Info("charges settled", "charges", count)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
		}
	}
}

func runProjectionLoop(ctx context.Context, projector ProjectionRunner, options LeaderOptions, log *slog.Logger) {
	for ctx.Err() == nil {
		if err := projector.ProjectPending(ctx, options.MaxWallets); err != nil && ctx.Err() == nil {
			log.Warn("billing admission projection deferred", "err", err)
		}
		if waitContext(ctx, options.Interval) != nil {
			return
		}
	}
}
