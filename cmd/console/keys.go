package main

import (
	"context"
	"fmt"
	"log/slog"
	"strings"

	"github.com/modelsphere/console/internal/cluster"
	"github.com/modelsphere/console/internal/config"
	"github.com/modelsphere/console/internal/router"
	"github.com/modelsphere/console/internal/server"
)

func enableGatewayKeys(ctx context.Context, cfg *config.Config, kube *cluster.Kube, srv *server.Server, log *slog.Logger) error {
	namespace, name, _ := strings.Cut(cfg.Router.Secret, "/")
	legacy := router.NewStore(kube, namespace, name, log)
	var active router.KeyStore = legacy
	var target *router.CRDStore
	if cfg.Router.KeySource == "crd" || cfg.Router.Migration {
		var err error
		target, err = router.NewCRDStore(ctx, kube.Dynamic(), cfg.Router.Namespace, log)
		if err != nil {
			return fmt.Errorf("initialize CRD key store: %w", err)
		}
	}
	if cfg.Router.KeySource == "crd" {
		if cfg.Router.Secret != "" {
			if err := target.PrepareAuthority(ctx, legacy); err != nil {
				return fmt.Errorf("activate CRD authority: %w", err)
			}
		}
		active = target
	} else if err := legacy.CheckAuthority(ctx); err != nil {
		return err
	}
	if err := srv.EnableRouter(active); err != nil {
		return fmt.Errorf("initialize inference pipeline: %w", err)
	}
	if cfg.Router.Migration {
		if err := srv.EnableKeyMigration(target); err != nil {
			return err
		}
	}
	log.Info("router enabled", "key_source", cfg.Router.KeySource, "backend", cfg.Router.Backend)
	return nil
}
