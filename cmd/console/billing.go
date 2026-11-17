package main

import (
	"context"
	"log/slog"
	"os"

	"github.com/modelsphere/console/internal/billing"
	"github.com/modelsphere/console/internal/billing/process"
	"github.com/modelsphere/console/internal/cluster"
	"github.com/modelsphere/console/internal/config"
	"github.com/modelsphere/console/internal/server"
)

func enableGatewayBilling(ctx context.Context, cfg *config.Config, kube *cluster.Kube, srv *server.Server, log *slog.Logger) (*process.Runtime, error) {
	runtime, err := process.NewRuntime(ctx, cfg.Billing, log)
	if err != nil {
		return nil, err
	}
	if err := runtime.StartMeter(cfg.Billing); err != nil {
		_ = runtime.Close()
		return nil, err
	}
	service := &billing.Service{Metrics: runtime.Metrics, Registry: runtime.Registry, Store: runtime.Store, Meter: runtime.Meter, Queue: runtime.Queue, Client: kube.Dynamic(), Namespace: cfg.Router.Namespace, Currency: cfg.Billing.Currency}
	if settings := cfg.Billing.Reconciliation; settings.URL != "" {
		service.Verifier = &billing.HTTPUsageVerifier{URLTemplate: settings.URL, Upstream: settings.Upstream, Token: os.Getenv(settings.TokenEnv)}
	}
	if err := srv.EnableBilling(service); err != nil {
		_ = runtime.Close()
		return nil, err
	}
	return runtime, nil
}
