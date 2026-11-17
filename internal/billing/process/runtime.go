// Package process wires billing's components into the processes that run them:
// the gateway's meter, and the usage, settlement and replay workers.
package process

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/prometheus/client_golang/prometheus"

	"github.com/modelsphere/console/internal/billing"
	"github.com/modelsphere/console/internal/cluster"
	"github.com/modelsphere/console/internal/config"
)

type Runtime struct {
	journalMu sync.RWMutex
	Metrics   *billing.Telemetry
	Registry  *prometheus.Registry
	ctx       context.Context
	cancel    context.CancelFunc
	group     sync.WaitGroup
	Store     *billing.Store
	Queue     *billing.RedisQueue
	Meter     *billing.Meter
	journal   *billing.Journal
	ready     chan struct{}
	Log       *slog.Logger
}

func NewRuntime(ctx context.Context, configuration config.Billing, log *slog.Logger) (*Runtime, error) {
	registry := prometheus.NewRegistry()
	metrics, err := billing.NewTelemetry(registry)
	if err != nil {
		return nil, err
	}
	queue, err := billing.NewRedisQueue(billing.RedisOptions{Metrics: metrics, URL: os.Getenv(configuration.Queue.URLEnv), Prefix: configuration.Queue.Prefix, Partitions: configuration.Queue.Partitions, Group: "usage-charge", LeaseDuration: configuration.Queue.LeaseDuration})
	if err != nil {
		return nil, err
	}
	runContext, cancel := context.WithCancel(ctx)
	runtime := &Runtime{Metrics: metrics, Registry: registry, ctx: runContext, cancel: cancel, Queue: queue, ready: make(chan struct{}), Log: log}
	if configuration.Role != "replay" {
		dsn := os.Getenv(configuration.Store.DSNEnv)
		if configuration.Store.Driver == "sqlite" {
			dsn = configuration.Store.SQLitePath
		}
		if dsn == "" {
			cancel()
			_ = queue.Close()
			return nil, fmt.Errorf("billing database environment %s is empty", configuration.Store.DSNEnv)
		}
		runtime.Store, err = billing.OpenLazy(configuration.Store.Driver, dsn, billing.StoreOptions{Currency: configuration.Currency, AdmissionThreshold: configuration.AdmissionThreshold, MaxConnections: configuration.Store.MaxConnections})
		if err != nil {
			cancel()
			_ = queue.Close()
			return nil, err
		}
		runtime.Store.Metrics = metrics
		runtime.group.Add(1)
		go runtime.initializeStore()
	}
	runtime.group.Add(1)
	go runtime.probe()
	return runtime, nil
}

func (runtime *Runtime) initializeStore() {
	defer runtime.group.Done()
	for runtime.ctx.Err() == nil {
		attemptContext, cancel := context.WithTimeout(runtime.ctx, 10*time.Second)
		err := runtime.Store.Initialize(attemptContext)
		cancel()
		if err == nil {
			close(runtime.ready)
			runtime.Log.Info("billing store ready")
			return
		}
		runtime.Log.Warn("billing store initialization deferred", "err", err)
		if wait(runtime.ctx, 5*time.Second) != nil {
			return
		}
	}
}

// StartMeter reads the gateway's journal shard and republishes whatever the
// queue could not take.
func (runtime *Runtime) StartMeter(configuration config.Billing) error {
	journal := configuration.Journal
	shard := os.Getenv(journal.ShardIDEnv)
	if shard == "" || filepath.Base(shard) != shard || shard == "." || shard == ".." {
		return fmt.Errorf("billing journal needs a stable shard identity in %s", journal.ShardIDEnv)
	}
	runtime.Meter = &billing.Meter{Metrics: runtime.Metrics, Queue: runtime.Queue, FailurePolicy: journal.FailurePolicy, PublishTimeout: 2 * time.Second, ReplayInterval: journal.ReplayInterval, ReplayRate: journal.ReplayRate, Log: runtime.Log}
	options := billing.JournalOptions{Metrics: runtime.Metrics, Directory: filepath.Join(journal.Directory, shard), SegmentBytes: journal.SegmentBytes, MaxBytes: journal.MaxBytes, MinFreeBytes: journal.MinFreeBytes, Retention: journal.Retention, SyncMode: journal.SyncMode, SyncInterval: journal.SyncInterval}
	opened, initialError := runtime.openJournal(options, journal.ReplayRetained)
	if initialError == nil {
		runtime.setJournal(opened)
		runtime.Meter.SetJournal(opened)
	} else {
		runtime.Log.Error("persistent metering journal unavailable", "err", initialError)
	}
	runtime.group.Add(1)
	go func() {
		defer runtime.group.Done()
		if initialError == nil {
			if err := runtime.Meter.RunReplay(runtime.ctx); err != nil && runtime.ctx.Err() == nil {
				runtime.Log.Error("journal replay stopped", "err", err)
			}
			return
		}
		for runtime.ctx.Err() == nil {
			opened, err := runtime.openJournal(options, journal.ReplayRetained)
			if err == nil {
				runtime.setJournal(opened)
				runtime.Meter.SetJournal(opened)
				if err := runtime.Meter.RunReplay(runtime.ctx); err != nil && runtime.ctx.Err() == nil {
					runtime.Log.Error("journal replay stopped", "err", err)
				}
				return
			}
			runtime.Log.Error("persistent metering journal unavailable", "err", err)
			if wait(runtime.ctx, journal.ReplayInterval) != nil {
				return
			}
		}
	}()
	return nil
}

func (runtime *Runtime) Close() error {
	runtime.cancel()
	runtime.group.Wait()
	var journalError, storeError error
	if runtime.journal != nil {
		journalError = runtime.journal.Close()
	}
	if runtime.Store != nil {
		storeError = runtime.Store.Close()
	}
	return errors.Join(journalError, storeError, runtime.Queue.Close())
}

// Done closes when the process is signalled or the runtime stops itself.
func (runtime *Runtime) Done() <-chan struct{} { return runtime.ctx.Done() }

func (runtime *Runtime) RunUsage(cfg *config.Config, kube *cluster.Kube) error {
	cache, err := billing.NewPriceCache(runtime.ctx, kube.Dynamic(), cfg.Router.Namespace, runtime.Store, runtime.Log)
	if err != nil {
		return err
	}
	hostname, err := os.Hostname()
	if err != nil {
		return err
	}
	identity, err := uuid.NewRandom()
	if err != nil {
		return err
	}
	options := cfg.Billing.Usage
	worker := &billing.UsageWorker{Metrics: runtime.Metrics, Queue: runtime.Queue, Store: runtime.Store, Prices: cache.Get, Log: runtime.Log, Options: billing.WorkerOptions{Consumer: hostname + "-" + identity.String(), FlushInterval: options.FlushInterval, PollInterval: options.PollInterval, MaxEvents: options.MaxEvents, MaxBytes: options.MaxBytes, Concurrency: options.Concurrency}}
	return worker.Run(runtime.ctx)
}

func (runtime *Runtime) RunSettlement(cfg *config.Config, kube *cluster.Kube) error {
	select {
	case <-runtime.ctx.Done():
		return runtime.ctx.Err()
	case <-runtime.ready:
	}
	projector, err := billing.NewAdmissionProjector(runtime.ctx, kube.Dynamic(), cfg.Router.Namespace, runtime.Store, runtime.Log)
	if err != nil {
		return err
	}
	hostname, err := os.Hostname()
	if err != nil {
		return err
	}
	identity, err := uuid.NewRandom()
	if err != nil {
		return err
	}
	settings := cfg.Billing.Settlement
	return billing.RunSettlementLeader(runtime.ctx, kube.Typed().CoordinationV1(), runtime.Store, projector, billing.LeaderOptions{Namespace: cfg.Router.Namespace, Name: settings.LeaseName, Identity: hostname + "-" + identity.String(), LeaseDuration: settings.LeaseDuration, RenewDeadline: settings.RenewDeadline, RetryPeriod: settings.RetryPeriod, Interval: settings.Interval, MaxWallets: settings.MaxWallets, MaxCharges: settings.MaxCharges}, runtime.Log)
}

func wait(ctx context.Context, duration time.Duration) error {
	timer := time.NewTimer(duration)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func (runtime *Runtime) openJournal(options billing.JournalOptions, rewind bool) (*billing.Journal, error) {
	journal, err := billing.OpenJournal(runtime.ctx, options)
	if err != nil {
		return nil, err
	}
	if rewind {
		if err := journal.Rewind(runtime.ctx); err != nil {
			return nil, errors.Join(err, journal.Close())
		}
		runtime.Log.Warn("retained journal delivery rewound", "directory", options.Directory)
	}
	return journal, nil
}
