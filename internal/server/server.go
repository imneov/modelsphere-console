// Package server is console's HTTP surface: the identity endpoints it owns
// (/oauth, /api/iam, /api/me), the auth middleware that guards them, and the
// reverse proxy that federates everything else to backends like swissd.
package server

import (
	"context"
	"encoding/json"
	"io/fs"
	"log/slog"
	"net/http"
	"sync/atomic"
	"time"

	"github.com/modelsphere/console/internal/apikey"
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

	keys *apikey.Store

	draining atomic.Bool
}

func New(cfg *config.Config, kube *cluster.Kube, log *slog.Logger, version string) *Server {
	return &Server{cfg: cfg, kube: kube, log: log, version: version}
}

// SetWeb installs the SPA filesystem. Without one, console is API only.
func (s *Server) SetWeb(f fs.FS) { s.web = f }

// SetIAM installs the identity kernel: the user store, the token signer, and
// the login authenticator. Without it, /oauth and /api/iam are unavailable and
// every /api/* request is rejected.
func (s *Server) SetIAM(store *iam.Store, signer *iam.Signer, authn *iam.Authenticator, authz *iam.Authorizer) {
	s.store, s.signer, s.authn, s.authz = store, signer, authn, authz
}

// SetAPIKeys installs key management and the /v1 endpoint.
func (s *Server) SetAPIKeys(keys *apikey.Store) { s.keys = keys }

// Handler builds the mux and wraps it in the middleware chain. Auth runs inside
// logging and recovery, so an auth rejection is still logged and a panic in it
// cannot take the process down.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.handleHealthz)
	mux.HandleFunc("GET /readyz", s.handleReadyz)

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

		// Federation: everything under a backend prefix. Needs the authorizer,
		// hence inside this block.
		resolvers := s.mountBackends(mux)

		if s.keys != nil {
			mux.HandleFunc("GET /api/iam/apikeys", s.handleListAPIKeys)
			mux.HandleFunc("POST /api/iam/apikeys", s.handleCreateAPIKey)
			mux.HandleFunc("DELETE /api/iam/apikeys/{id}", s.handleDeleteAPIKey)
			s.mountInference(mux, resolvers[s.cfg.APIKeys.Backend])
		}
	}

	if s.web != nil {
		// Method-less on purpose: "GET /" next to a method-less backend prefix
		// is an ambiguous pair that ServeMux refuses. spa enforces GET/HEAD.
		mux.HandleFunc("/", s.spa)
	}
	return s.recover(s.logRequests(s.authenticate(s.requirePasswordReset(mux))))
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
		s.log.Info("console listening", "addr", s.cfg.Server.Addr, "version", s.version)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errc <- err
		}
	}()
	select {
	case err := <-errc:
		return err
	case <-ctx.Done():
		// Fail readiness first and give the endpoints controller time to take
		// this pod out, then let in-flight generations finish.
		s.draining.Store(true)
		s.log.Info("draining", "delay", drainDelay, "grace", shutdownGrace)
		time.Sleep(drainDelay)
		down, cancel := context.WithTimeout(context.WithoutCancel(ctx), shutdownGrace)
		defer cancel()
		return srv.Shutdown(down)
	}
}

// The chart's terminationGracePeriodSeconds has to exceed their sum.
const (
	drainDelay    = 5 * time.Second
	shutdownGrace = 60 * time.Second
)

func (s *Server) handleHealthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "version": s.version})
}

func (s *Server) handleReadyz(w http.ResponseWriter, r *http.Request) {
	if s.draining.Load() {
		writeError(w, http.StatusServiceUnavailable, "draining")
		return
	}
	s.handleHealthz(w, r)
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

// Flush forwards to the wrapped writer. Wrapping hid http.Flusher from the
// reverse proxy, whose type assertion then failed: every SSE frame and chunked
// progress update waited for the handler to return, which for a streaming model
// means the whole answer arrives at once -- or, on a long generation, not at all.
func (r *statusRecorder) Flush() {
	if f, ok := r.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
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
