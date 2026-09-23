// Package server is consoled's HTTP surface: the identity endpoints it owns
// (/oauth, /api/iam, /api/me), the auth middleware that guards them, and the
// reverse proxy that federates everything else to backends like swissd.
package server

import (
	"context"
	"encoding/json"
	"io/fs"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/modelsphere/console/internal/cluster"
	"github.com/modelsphere/console/internal/config"
)

type Server struct {
	cfg     *config.Config
	kube    *cluster.Kube
	log     *slog.Logger
	version string
	web     fs.FS
}

func New(cfg *config.Config, kube *cluster.Kube, log *slog.Logger, version string) *Server {
	return &Server{cfg: cfg, kube: kube, log: log, version: version}
}

// SetWeb installs the SPA filesystem. Without one, consoled is API only.
func (s *Server) SetWeb(f fs.FS) { s.web = f }

// Handler builds the mux and wraps it in the middleware chain. Auth runs inside
// logging and recovery, so an auth rejection is still logged and a panic in it
// cannot take the process down.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.handleHealthz)
	mux.HandleFunc("GET /readyz", s.handleHealthz)

	// Identity endpoints (wired in P1): /oauth/token, /api/iam/*, /api/me.
	// Federation to backends (wired in P4): everything under a backend prefix.

	if s.web != nil {
		mux.HandleFunc("GET /", s.spa)
	}
	return s.recover(s.logRequests(s.authenticate(mux)))
}

func (s *Server) Run(ctx context.Context) error {
	srv := &http.Server{
		Addr:              s.cfg.Server.Addr,
		Handler:           s.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	errc := make(chan error, 1)
	go func() {
		s.log.Info("consoled listening", "addr", s.cfg.Server.Addr, "version", s.version)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errc <- err
		}
	}()
	select {
	case err := <-errc:
		return err
	case <-ctx.Done():
		s.log.Info("shutting down")
		down, cancel := context.WithTimeout(context.WithoutCancel(ctx), 20*time.Second)
		defer cancel()
		return srv.Shutdown(down)
	}
}

// authenticate guards /api/* and passes public paths through. Token
// verification is wired in P1; until then it is a pass-through so the scaffold
// serves health and static assets.
func (s *Server) authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if isPublic(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}
		// TODO(P1): verify Bearer/cookie token; 401 JSON on failure for /api/*.
		next.ServeHTTP(w, r)
	})
}

func isPublic(path string) bool {
	switch {
	case path == "/healthz", path == "/readyz", path == "/login":
		return true
	case path == "/oauth/token", strings.HasPrefix(path, "/.well-known/"):
		return true
	case !strings.HasPrefix(path, "/api/"):
		// SPA routes and static assets.
		return true
	}
	return false
}

func (s *Server) handleHealthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "version": s.version})
}

func (s *Server) logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		s.log.Info("request", "method", r.Method, "path", r.URL.Path,
			"status", rec.status, "ms", time.Since(start).Milliseconds())
	})
}

func (s *Server) recover(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if v := recover(); v != nil {
				s.log.Error("panic", "path", r.URL.Path, "value", v)
				writeError(w, http.StatusInternalServerError, "internal error")
			}
		}()
		next.ServeHTTP(w, r)
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(v)
}

func writeError(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}
