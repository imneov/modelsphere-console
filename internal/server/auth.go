package server

import (
	"context"
	"net/http"
	"strings"

	"github.com/modelsphere/console/internal/iam"
)

type ctxKey int

const identityKey ctxKey = iota

func withIdentity(ctx context.Context, id *iam.Identity) context.Context {
	return context.WithValue(ctx, identityKey, id)
}

// identityFrom returns the authenticated caller, or nil for anonymous requests.
func identityFrom(ctx context.Context) *iam.Identity {
	id, _ := ctx.Value(identityKey).(*iam.Identity)
	return id
}

// authenticate verifies the token on every request and stashes the caller in
// context. Public paths pass through anonymously; a guarded /api/* path with no
// valid token is rejected with a JSON 401 so the SPA's fetch layer sees an
// error envelope rather than the login HTML.
func (s *Server) authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if s.signer != nil {
			if tok := bearerToken(r); tok != "" {
				if id, err := s.signer.Verify(tok); err == nil {
					next.ServeHTTP(w, r.WithContext(withIdentity(r.Context(), id)))
					return
				}
			}
		}
		if isPublic(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}
		writeError(w, http.StatusUnauthorized, "unauthenticated")
	})
}

// bearerToken reads the token from the Authorization header, falling back to a
// `token` cookie (browser requests) -- the same two sources Global accepts.
func bearerToken(r *http.Request) string {
	if h := r.Header.Get("Authorization"); h != "" {
		if parts := strings.SplitN(h, " ", 2); len(parts) == 2 && parts[0] == "Bearer" {
			return parts[1]
		}
	}
	if c, err := r.Cookie("token"); err == nil {
		return c.Value
	}
	return ""
}

func isPublic(path string) bool {
	switch {
	case path == "/healthz", path == "/readyz", path == "/login":
		return true
	case path == "/oauth/token", strings.HasPrefix(path, "/.well-known/"):
		return true
	case !strings.HasPrefix(path, "/api/") && !strings.HasPrefix(path, "/oauth/"):
		// SPA routes and static assets.
		return true
	}
	return false
}
