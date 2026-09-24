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
	"time"

	"github.com/modelsphere/console/internal/cluster"
	"github.com/modelsphere/console/internal/config"
	"github.com/modelsphere/console/internal/iam"
)

type Server struct {
	cfg     *config.Config
	kube    *cluster.Kube
	log     *slog.Logger
	version string
	web     fs.FS

	authn  *iam.Authenticator
	signer *iam.Signer
	store  *iam.Store
	authz  *iam.Authorizer
}

func New(cfg *config.Config, kube *cluster.Kube, log *slog.Logger, version string) *Server {
	return &Server{cfg: cfg, kube: kube, log: log, version: version}
}

// SetWeb installs the SPA filesystem. Without one, consoled is API only.
func (s *Server) SetWeb(f fs.FS) { s.web = f }

// SetIAM installs the identity kernel: the user store, the token signer, and
// the login authenticator. Without it, /oauth and /api/iam are unavailable and
// every /api/* request is rejected.
func (s *Server) SetIAM(store *iam.Store, signer *iam.Signer, authn *iam.Authenticator, authz *iam.Authorizer) {
	s.store, s.signer, s.authn, s.authz = store, signer, authn, authz
}

// Handler builds the mux and wraps it in the middleware chain. Auth runs inside
// logging and recovery, so an auth rejection is still logged and a panic in it
// cannot take the process down.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.handleHealthz)
	mux.HandleFunc("GET /readyz", s.handleHealthz)

	if s.authn != nil {
		mux.HandleFunc("POST /oauth/token", s.handleToken)
		mux.HandleFunc("GET /api/me", s.handleMe)
		mux.HandleFunc("POST /api/me/password", s.handleChangeOwnPassword)
		mux.HandleFunc("GET /api/iam/users", s.handleListUsers)
		mux.HandleFunc("POST /api/iam/users", s.handleCreateUser)
		mux.HandleFunc("GET /api/iam/users/{name}", s.handleGetUser)
		mux.HandleFunc("PUT /api/iam/users/{name}", s.handleUpdateUser)
		mux.HandleFunc("DELETE /api/iam/users/{name}", s.handleDeleteUser)

		mux.HandleFunc("GET /api/iam/roles", s.handleListRoles)
		mux.HandleFunc("POST /api/iam/roles", s.handleCreateRole)
		mux.HandleFunc("GET /api/iam/roles/{name}", s.handleGetRole)
		mux.HandleFunc("PUT /api/iam/roles/{name}", s.handleUpdateRole)
		mux.HandleFunc("DELETE /api/iam/roles/{name}", s.handleDeleteRole)

		mux.HandleFunc("GET /api/iam/rolebindings", s.handleListRoleBindings)
		mux.HandleFunc("POST /api/iam/rolebindings", s.handleCreateRoleBinding)
		mux.HandleFunc("DELETE /api/iam/rolebindings/{name}", s.handleDeleteRoleBinding)

		mux.HandleFunc("GET /api/iam/loginrecords", s.handleListLoginRecords)
	}
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
