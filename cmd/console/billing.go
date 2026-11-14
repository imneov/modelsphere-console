package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/prometheus/client_golang/prometheus"

	"github.com/google/uuid"
	"github.com/modelsphere/console/internal/billing"
	"github.com/modelsphere/console/internal/cluster"
	"github.com/modelsphere/console/internal/config"
	"github.com/modelsphere/console/internal/server"
)

type billingRuntime struct {
	journalMu sync.RWMutex
	metrics   *billing.Telemetry
	registry  *prometheus.Registry
	ctx       context.Context
	cancel    context.CancelFunc
	group     sync.WaitGroup
	store     *billing.Store
	queue     *billing.RedisQueue
	meter     *billing.Meter
	journal   *billing.Journal
	ready     chan struct{}
	log       *slog.Logger
}

func newBillingRuntime(ctx context.Context, configuration config.Billing, log *slog.Logger) (*billingRuntime, error) {
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
	runtime := &billingRuntime{metrics: metrics, registry: registry, ctx: runContext, cancel: cancel, queue: queue, ready: make(chan struct{}), log: log}
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
		runtime.store, err = billing.OpenLazy(configuration.Store.Driver, dsn, billing.StoreOptions{Currency: configuration.Currency, AdmissionThreshold: configuration.AdmissionThreshold, MaxConnections: configuration.Store.MaxConnections})
		if err != nil {
			cancel()
			_ = queue.Close()
			return nil, err
		}
		runtime.store.Metrics = metrics
		runtime.group.Add(1)
		go runtime.initializeStore()
	}
	runtime.group.Add(1)
	go runtime.probe()
	return runtime, nil
}

func (runtime *billingRuntime) initializeStore() {
	defer runtime.group.Done()
	for runtime.ctx.Err() == nil {
		attemptContext, cancel := context.WithTimeout(runtime.ctx, 10*time.Second)
		err := runtime.store.Initialize(attemptContext)
		cancel()
		if err == nil {
			close(runtime.ready)
			runtime.log.Info("billing store ready")
			return
		}
		runtime.log.Warn("billing store initialization deferred", "err", err)
		if waitBilling(runtime.ctx, 5*time.Second) != nil {
			return
		}
	}
}

func (runtime *billingRuntime) startMeter(configuration config.Billing) error {
	journal := configuration.Journal
	shard := os.Getenv(journal.ShardIDEnv)
	if shard == "" || filepath.Base(shard) != shard || shard == "." || shard == ".." {
		return fmt.Errorf("billing journal needs a stable shard identity in %s", journal.ShardIDEnv)
	}
	runtime.meter = &billing.Meter{Metrics: runtime.metrics, Queue: runtime.queue, FailurePolicy: journal.FailurePolicy, PublishTimeout: 2 * time.Second, ReplayInterval: journal.ReplayInterval, ReplayRate: journal.ReplayRate, Log: runtime.log}
	options := billing.JournalOptions{Metrics: runtime.metrics, Directory: filepath.Join(journal.Directory, shard), SegmentBytes: journal.SegmentBytes, MaxBytes: journal.MaxBytes, MinFreeBytes: journal.MinFreeBytes, Retention: journal.Retention, SyncMode: journal.SyncMode, SyncInterval: journal.SyncInterval}
	opened, initialError := runtime.openJournal(options, journal.ReplayRetained)
	if initialError == nil {
		runtime.setJournal(opened)
		runtime.meter.SetJournal(opened)
	} else {
		runtime.log.Error("persistent metering journal unavailable", "err", initialError)
	}
	runtime.group.Add(1)
	go func() {
		defer runtime.group.Done()
		if initialError == nil {
			if err := runtime.meter.RunReplay(runtime.ctx); err != nil && runtime.ctx.Err() == nil {
				runtime.log.Error("journal replay stopped", "err", err)
			}
			return
		}
		for runtime.ctx.Err() == nil {
			opened, err := runtime.openJournal(options, journal.ReplayRetained)
			if err == nil {
				runtime.setJournal(opened)
				runtime.meter.SetJournal(opened)
				if err := runtime.meter.RunReplay(runtime.ctx); err != nil && runtime.ctx.Err() == nil {
					runtime.log.Error("journal replay stopped", "err", err)
				}
				return
			}
			runtime.log.Error("persistent metering journal unavailable", "err", err)
			if waitBilling(runtime.ctx, journal.ReplayInterval) != nil {
				return
			}
		}
	}()
	return nil
}

func (runtime *billingRuntime) close() error {
	runtime.cancel()
	runtime.group.Wait()
	var journalError, storeError error
	if runtime.journal != nil {
		journalError = runtime.journal.Close()
	}
	if runtime.store != nil {
		storeError = runtime.store.Close()
	}
	return errors.Join(journalError, storeError, runtime.queue.Close())
}

func enableGatewayBilling(ctx context.Context, cfg *config.Config, kube *cluster.Kube, srv *server.Server, log *slog.Logger) (*billingRuntime, error) {
	runtime, err := newBillingRuntime(ctx, cfg.Billing, log)
	if err != nil {
		return nil, err
	}
	if err := runtime.startMeter(cfg.Billing); err != nil {
		_ = runtime.close()
		return nil, err
	}
	service := &billing.Service{Metrics: runtime.metrics, Registry: runtime.registry, Store: runtime.store, Meter: runtime.meter, Queue: runtime.queue, Client: kube.Dynamic(), Namespace: cfg.Router.Namespace, Currency: cfg.Billing.Currency}
	if settings := cfg.Billing.Reconciliation; settings.URL != "" {
		service.Verifier = &billing.HTTPUsageVerifier{URLTemplate: settings.URL, Upstream: settings.Upstream, Token: os.Getenv(settings.TokenEnv)}
	}
	if err := srv.EnableBilling(service); err != nil {
		_ = runtime.close()
		return nil, err
	}
	return runtime, nil
}

func runBillingWorker(ctx context.Context, cfg *config.Config, kube *cluster.Kube, log *slog.Logger) error {
	runtime, err := newBillingRuntime(ctx, cfg.Billing, log)
	if err != nil {
		return err
	}
	monitor, err := runtime.serveWorkerHealth(cfg.Server.MetricsAddr)
	if err != nil {
		return errors.Join(err, runtime.close())
	}
	defer monitor.Close()
	var result error
	switch cfg.Billing.Role {
	case "usage":
		result = runtime.runUsage(cfg, kube)
	case "settlement":
		result = runtime.runSettlement(cfg, kube)
	case "replay":
		if err := runtime.startMeter(cfg.Billing); err != nil {
			result = err
		} else {
			<-runtime.ctx.Done()
			result = runtime.ctx.Err()
		}
	default:
		result = fmt.Errorf("unknown billing worker role %q", cfg.Billing.Role)
	}
	closeError := runtime.close()
	if errors.Is(result, context.Canceled) && ctx.Err() != nil {
		return closeError
	}
	return errors.Join(result, closeError)
}

func (runtime *billingRuntime) runUsage(cfg *config.Config, kube *cluster.Kube) error {
	cache, err := billing.NewPriceCache(runtime.ctx, kube.Dynamic(), cfg.Router.Namespace, runtime.store, runtime.log)
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
	worker := &billing.UsageWorker{Metrics: runtime.metrics, Queue: runtime.queue, Store: runtime.store, Prices: cache.Get, Log: runtime.log, Options: billing.WorkerOptions{Consumer: hostname + "-" + identity.String(), FlushInterval: options.FlushInterval, PollInterval: options.PollInterval, MaxEvents: options.MaxEvents, MaxBytes: options.MaxBytes, Concurrency: options.Concurrency}}
	return worker.Run(runtime.ctx)
}

func (runtime *billingRuntime) runSettlement(cfg *config.Config, kube *cluster.Kube) error {
	select {
	case <-runtime.ctx.Done():
		return runtime.ctx.Err()
	case <-runtime.ready:
	}
	projector, err := billing.NewAdmissionProjector(runtime.ctx, kube.Dynamic(), cfg.Router.Namespace, runtime.store, runtime.log)
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
	return billing.RunSettlementLeader(runtime.ctx, kube.Typed().CoordinationV1(), runtime.store, projector, billing.LeaderOptions{Namespace: cfg.Router.Namespace, Name: settings.LeaseName, Identity: hostname + "-" + identity.String(), LeaseDuration: settings.LeaseDuration, RenewDeadline: settings.RenewDeadline, RetryPeriod: settings.RetryPeriod, Interval: settings.Interval, MaxWallets: settings.MaxWallets, MaxCharges: settings.MaxCharges}, runtime.log)
}

func waitBilling(ctx context.Context, duration time.Duration) error {
	timer := time.NewTimer(duration)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func (runtime *billingRuntime) openJournal(options billing.JournalOptions, rewind bool) (*billing.Journal, error) {
	journal, err := billing.OpenJournal(runtime.ctx, options)
	if err != nil {
		return nil, err
	}
	if rewind {
		if err := journal.Rewind(runtime.ctx); err != nil {
			return nil, errors.Join(err, journal.Close())
		}
		runtime.log.Warn("retained journal delivery rewound", "directory", options.Directory)
	}
	return journal, nil
}
