// Command consoled serves the ModelSphere community portal.
//
// It owns identity -- users, roles and login, stored as iam.theriseunion.io
// CRDs and kept wire-compatible with Rise Global so a later cutover to Global's
// apiserver is a config change, not a migration. Everything else (deploy, model
// catalog, nodes) is federated to backends like swissd.
package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/modelsphere/console/internal/cluster"
	"github.com/modelsphere/console/internal/config"
	"github.com/modelsphere/console/internal/server"
	"github.com/modelsphere/console/internal/version"
	"github.com/modelsphere/console/web"
)

func main() {
	var (
		configPath = flag.String("config", "", "config file (default: $CONSOLE_CONFIG, ./console.yaml, ~/.config/console/console.yaml)")
		addr       = flag.String("addr", os.Getenv("CONSOLED_ADDR"), "listen address (overrides config)")
		logLevel   = flag.String("log-level", envOr("CONSOLED_LOG_LEVEL", "info"), "debug|info|warn|error")
		webDir     = flag.String("web-dir", os.Getenv("CONSOLED_WEB_DIR"), "serve the UI from this directory instead of the embedded build")
		showVer    = flag.Bool("version", false, "print version and exit")
	)
	flag.Parse()

	if *showVer {
		fmt.Println(version.Version)
		return
	}
	if err := run(*configPath, *addr, *logLevel, *webDir); err != nil {
		fmt.Fprintln(os.Stderr, "consoled: "+err.Error())
		os.Exit(1)
	}
}

func run(configPath, addr, logLevel, webDir string) error {
	log := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: parseLevel(logLevel)}))

	path := config.Find(configPath)
	if path == "" {
		return fmt.Errorf("no config file: pass --config, or set CONSOLE_CONFIG")
	}
	cfg, err := config.Load(path)
	if err != nil {
		return err
	}
	if addr != "" {
		cfg.Server.Addr = addr
	}
	// The signing key comes from a Secret via env in a cluster, keeping it out
	// of the ConfigMap-rendered config.
	if v := os.Getenv("CONSOLED_JWT_SECRET"); v != "" {
		cfg.Server.Auth.JWTSecret = v
	}
	if err := cfg.Validate(); err != nil {
		return err
	}

	kube, err := cluster.NewKube(cfg.Cluster.Kubeconfig, cfg.Cluster.Context)
	if err != nil {
		return fmt.Errorf("cluster access: %w", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	srv := server.New(cfg, kube, log, version.Version)

	if webDir != "" {
		f, err := server.WebFromDir(webDir)
		if err != nil {
			return fmt.Errorf("-web-dir %s: %w", webDir, err)
		}
		srv.SetWeb(f)
		log.Info("serving UI from disk", "dir", webDir)
	} else if f := web.FS(); f != nil {
		srv.SetWeb(f)
	}

	return srv.Run(ctx)
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
