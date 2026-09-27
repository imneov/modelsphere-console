package server

import (
	"context"
	"net/http"

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

func routerResolver(resolve targetResolver) router.Resolver {
	if resolve == nil {
		return nil
	}
	return func(ctx context.Context) (*router.Target, error) {
		t, err := resolve(ctx)
		if err != nil {
			return nil, err
		}
		return &router.Target{URL: t.url, Header: t.header, Key: t.key}, nil
	}
}
