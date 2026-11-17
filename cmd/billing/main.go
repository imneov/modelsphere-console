// Command billing runs one billing worker role: usage, settlement or replay.
//
// It reads the same configuration document and Kubernetes access as the gateway,
// but runs no HTTP surface beyond health and metrics, so the billing image
// carries no management API and no SPA. One process runs one role; replicas and
// leader election are the cluster's business, not this binary's.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/modelsphere/console/internal/billing/process"
	"github.com/modelsphere/console/internal/cluster"
	"github.com/modelsphere/console/internal/config"
	"github.com/modelsphere/console/internal/version"
)

func main() {
	var (
		configPath = flag.String("config", "", "config file (default: $CONSOLE_CONFIG, ./console.yaml, ~/.config/console/console.yaml)")
		role       = flag.String("role", os.Getenv("CONSOLE_BILLING_ROLE"), "usage|settlement|replay (required)")
		logLevel   = flag.String("log-level", envOr("CONSOLE_LOG_LEVEL", "info"), "debug|info|warn|error")
		showVer    = flag.Bool("version", false, "print version and exit")
	)
	flag.Parse()

	if *showVer {
		fmt.Println(version.Version)
		return
	}
	if err := run(*configPath, *role, *logLevel); err != nil {
		fmt.Fprintln(os.Stderr, "billing: "+err.Error())
		os.Exit(1)
	}
}

func run(configPath, role, logLevel string) error {
	log := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: parseLevel(logLevel)}))

	cfg, err := loadRuntimeConfig(configPath, role)
	if err != nil {
		return err
	}

	kube, err := cluster.NewKube(cfg.Cluster.Kubeconfig, cfg.Cluster.Context, cluster.ClientLimits{QPS: cfg.Cluster.ClientQPS, Burst: cfg.Cluster.ClientBurst})
	if err != nil {
		return fmt.Errorf("cluster access: %w", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	return runWorker(ctx, cfg, kube, log)
}

// runWorker starts the runtime for the configured role and blocks until the
// role returns or the process is signalled.
func runWorker(ctx context.Context, cfg *config.Config, kube *cluster.Kube, log *slog.Logger) error {
	runtime, err := process.NewRuntime(ctx, cfg.Billing, log)
	if err != nil {
		return err
	}
	monitor, err := runtime.ServeWorkerHealth(cfg.Server.MetricsAddr)
	if err != nil {
		return errors.Join(err, runtime.Close())
	}
	defer monitor.Close()
	var result error
	switch cfg.Billing.Role {
	case "usage":
		result = runtime.RunUsage(cfg, kube)
	case "settlement":
		result = runtime.RunSettlement(cfg, kube)
	case "replay":
		if err := runtime.StartMeter(cfg.Billing); err != nil {
			result = err
		} else {
			<-runtime.Done()
			result = context.Canceled
		}
	default:
		result = fmt.Errorf("unknown billing worker role %q", cfg.Billing.Role)
	}
	closeError := runtime.Close()
	if errors.Is(result, context.Canceled) && ctx.Err() != nil {
		return closeError
	}
	return errors.Join(result, closeError)
}

func loadRuntimeConfig(configPath, role string) (*config.Config, error) {
	path := config.Find(configPath)
	if path == "" {
		return nil, fmt.Errorf("no config file: pass --config, or set CONSOLE_CONFIG")
	}
	cfg, err := config.Load(path)
	if err != nil {
		return nil, err
	}
	switch role {
	case "usage", "settlement", "replay":
		cfg.Billing.Role = role
	default:
		return nil, fmt.Errorf("billing role must be usage, settlement or replay, got %q", role)
	}
	if !cfg.Billing.Enabled {
		return nil, fmt.Errorf("billing must be enabled for a worker role")
	}
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	return cfg, nil
}

func parseLevel(s string) slog.Level {
	var l slog.Level
	if err := l.UnmarshalText([]byte(s)); err != nil {
		return slog.LevelInfo
	}
	return l
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
