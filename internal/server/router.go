package server

import (
	"context"
	"net/http"
	"net/url"

	"github.com/modelsphere/console/internal/iam"
	"github.com/modelsphere/console/internal/router"
)

// keysResource is the RBAC resource guarding the router's API keys: list,
// create, delete. Only system:masters has it unless a role grants it.
const keysResource = "apikeys"

// mountRouter serves /v1 to API keys (the router does its own auth: the path is
// outside /api, so the session middleware lets it through) and key management
// to authorized console users.
func (s *Server) mountRouter(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/router/users", s.handleKeyOwners)
	mux.HandleFunc("PUT /api/router/apikeys/{id}/status", func(w http.ResponseWriter, r *http.Request) {
		if s.authorize(w, r, "update", keysResource, r.PathValue("id")) {
			s.router.SetKeyStatus(w, r)
		}
	})
	mux.HandleFunc("POST /api/router/apikeys/import", func(w http.ResponseWriter, r *http.Request) {
		if s.authorize(w, r, "create", keysResource, "") {
			s.router.ImportKeys(w, r)
		}
	})
	if !s.cfg.Higress.Enabled {
		mux.Handle("/v1/", s.router)
	} else {
		mux.HandleFunc("/v1/", s.inferenceMoved)
	}
	mux.HandleFunc("GET /api/router/apikeys", func(w http.ResponseWriter, r *http.Request) {
		if s.authorize(w, r, "list", keysResource, "") {
			s.router.ListKeys(w, r)
		}
	})
	mux.HandleFunc("POST /api/router/apikeys", func(w http.ResponseWriter, r *http.Request) {
		if s.authorize(w, r, "create", keysResource, "") {
			s.router.CreateKey(w, r, identityFrom(r.Context()).Name)
		}
	})
	mux.HandleFunc("DELETE /api/router/apikeys/{id}", func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		if s.authorize(w, r, "delete", keysResource, id) {
			s.router.DeleteKey(w, r, id, identityFrom(r.Context()).Name)
		}
	})
}

func (s *Server) inferenceMoved(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet && r.URL.Path == "/api/llm/route-options" {
		writeError(w, http.StatusNotFound, "Higress does not expose the legacy route directive catalog")
		return
	}
	writeError(w, http.StatusServiceUnavailable, "inference is served by Higress, not the Console management service")
}

func (s *Server) handleKeyOwners(w http.ResponseWriter, r *http.Request) {
	if !s.authorize(w, r, "create", keysResource, "") {
		return
	}
	includeInactive := r.URL.Query().Get("includeInactive")
	if includeInactive != "" && includeInactive != "true" && includeInactive != "false" {
		writeError(w, http.StatusBadRequest, "includeInactive must be true or false")
		return
	}
	users, err := s.store.ListUsers(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "list key owners failed")
		return
	}
	owners := make([]map[string]string, 0, len(users))
	for index := range users {
		user := &users[index]
		uid := iam.CanonicalUID(user)
		if uid != "" && (includeInactive == "true" || user.Status.State == "" || user.Status.State == iam.UserActive) {
			owners = append(owners, map[string]string{"name": user.Name, "uid": uid, "displayName": user.Spec.DisplayName})
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": owners})
}

// routerBackend is the router's view of a backend: its models, and the route for
// one of them, through the same index the Playground uses.
type routerBackend struct {
	s       *Server
	name    string
	resolve targetResolver
}

func (rb routerBackend) Models(ctx context.Context) ([]string, error) {
	t, err := rb.resolve(ctx)
	if err != nil {
		return nil, err
	}
	c, err := rb.s.models.get(ctx, rb.name, t, "")
	if err != nil {
		return nil, err
	}
	return c.models, nil
}

func (rb routerBackend) Target(ctx context.Context, model string) (*router.Target, error) {
	targets, err := rb.Targets(ctx, model)
	if err != nil {
		return nil, err
	}
	return targets[0], nil
}

// Targets lists every route serving model, preferred first, so the router can
// replay a request that a failed route did not answer.
func (rb routerBackend) Targets(ctx context.Context, model string) ([]*router.Target, error) {
	t, err := rb.resolve(ctx)
	if err != nil {
		return nil, err
	}
	c, err := rb.s.models.get(ctx, rb.name, t, model)
	if err != nil {
		return nil, err
	}
	routes, err := c.routesFor(model, t)
	if err != nil {
		return nil, err
	}
	targets := make([]*router.Target, 0, len(routes))
	for _, route := range routes {
		u, err := url.Parse(routeURL(t, route))
		if err != nil {
			return nil, err
		}
		targets = append(targets, &router.Target{URL: *u, Header: t.header, Key: t.key})
	}
	return targets, nil
}
