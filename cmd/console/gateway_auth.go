package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/modelsphere/console/internal/cluster"
	"github.com/modelsphere/console/internal/config"
	"github.com/modelsphere/console/internal/iam"
	"github.com/modelsphere/console/internal/inferenceauth"
	"github.com/modelsphere/console/internal/router"
)

func serveGatewayAuth(ctx context.Context, cfg *config.Config, kube *cluster.Kube, log *slog.Logger) error {
	if !cfg.Higress.Enabled {
		return fmt.Errorf("gateway-auth role requires higress.enabled")
	}
	if cfg.Router.Secret != "" {
		namespace, name, _ := strings.Cut(cfg.Router.Secret, "/")
		legacy := router.NewStore(kube, namespace, name, log)
		if err := legacy.RequireCRDAuthority(ctx); err != nil {
			return fmt.Errorf("gateway authorization requires completed key authority activation: %w", err)
		}
	}
	store, err := router.NewCRDStore(ctx, kube.Dynamic(), cfg.Router.Namespace, log)
	if err != nil {
		return fmt.Errorf("initialize gateway authorization caches: %w", err)
	}
	store.EnforceBilling(cfg.Billing.Enabled)
	signer := iam.NewSigner(cfg.Server.Auth.Issuer, cfg.Server.Auth.JWTSecret, cfg.Server.Auth.TokenTTL)
	handler, err := inferenceauth.New(store, signer, store.Authorizer(), cfg, log)
	if err != nil {
		return err
	}
	server := &http.Server{Addr: cfg.Server.Addr, Handler: handler, ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout: 15 * time.Second, WriteTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second}
	return runAuthHTTP(ctx, server, log)
}

func runAuthHTTP(ctx context.Context, server *http.Server, log *slog.Logger) error {
	failures := make(chan error, 1)
	go func() {
		log.Info("Higress authorization service listening", "addr", server.Addr)
		failures <- server.ListenAndServe()
	}()
	select {
	case err := <-failures:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-ctx.Done():
		shutdown, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdown); err != nil {
			return errors.Join(err, server.Close())
		}
		return nil
	}
}
