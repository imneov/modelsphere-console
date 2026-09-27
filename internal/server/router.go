package server

import (
	"context"
	"net/http"
	"net/url"

	"github.com/modelsphere/console/internal/router"
)

// keysResource is the RBAC resource guarding the router's API keys: list,
// create, delete. Only system:masters has it unless a role grants it.
const keysResource = "apikeys"

// mountRouter serves /v1 to API keys (the router does its own auth: the path is
// outside /api, so the session middleware lets it through) and key management
// to authorized console users.
func (s *Server) mountRouter(mux *http.ServeMux) {
	mux.Handle("/v1/", s.router)
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
	t, err := rb.resolve(ctx)
	if err != nil {
		return nil, err
	}
	c, err := rb.s.models.get(ctx, rb.name, t, model)
	if err != nil {
		return nil, err
	}
	route, err := c.routeFor(model, t)
	if err != nil {
		return nil, err
	}
	u, err := url.Parse(routeURL(t, route))
	if err != nil {
		return nil, err
	}
	return &router.Target{URL: *u, Header: t.header, Key: t.key}, nil
}
