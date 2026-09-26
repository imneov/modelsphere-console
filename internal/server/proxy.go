package server

import (
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"

	"github.com/modelsphere/console/internal/config"
)

// backendResource is the RBAC resource a backend is authorized as; the backend's
// name is the resourceName. A role granting verbs ["get"] on resources
// ["backends"], resourceNames ["swiss"] gives read-only access to swiss.
const backendResource = "backends"

// mountBackends proxies each backend's prefix. Authentication and the
// password-reset guard already ran (the prefix is under /api/); this adds
// per-backend authorization, swaps the caller's identity into the X-Remote-*
// headers the backend trusts -- the same headers Rise Global's apiserver sets
// for a ReverseProxy, so a backend runs unchanged behind either -- and adds the
// backend's own credential, if it has one.
//
// Backend URLs were checked by config.Validate; one that still fails to parse
// is skipped and logged rather than taking the server down.
func (s *Server) mountBackends(mux *http.ServeMux) {
	for _, b := range s.cfg.Backends {
		target, err := url.Parse(b.URL)
		if err != nil {
			s.log.Error("backend skipped: bad url", "backend", b.Name, "err", err)
			continue
		}
		key := b.APIKey()
		if b.APIKeyEnv != "" && key == "" {
			s.log.Warn("backend credential is empty: requests go without it", "backend", b.Name, "env", b.APIKeyEnv)
		}
		proxy := s.backendProxy(b, target, key)
		mux.HandleFunc(strings.TrimSuffix(b.Prefix, "/")+"/", func(w http.ResponseWriter, r *http.Request) {
			if !s.authorize(w, r, backendVerb(r.Method), backendResource, b.Name) {
				return
			}
			proxy.ServeHTTP(w, r)
		})
	}
}

func (s *Server) backendProxy(b config.Backend, target *url.URL, apiKey string) *httputil.ReverseProxy {
	prefix := strings.TrimSuffix(b.Prefix, "/")
	return &httputil.ReverseProxy{
		Rewrite: func(pr *httputil.ProxyRequest) {
			pr.Out.URL.Path = strings.TrimPrefix(pr.In.URL.Path, prefix)
			pr.Out.URL.RawPath = ""
			pr.SetURL(target)
			pr.SetXForwarded()

			for k := range pr.Out.Header {
				if strings.HasPrefix(http.CanonicalHeaderKey(k), "X-Remote-") {
					pr.Out.Header.Del(k)
				}
			}
			pr.Out.Header.Del("Cookie")
			if id := identityFrom(pr.In.Context()); id != nil {
				pr.Out.Header.Set("X-Remote-User", id.Name)
				for _, g := range id.Groups {
					pr.Out.Header.Add("X-Remote-Group", g)
				}
			}
			// Carry the session as a Bearer header even when the browser sent it
			// only as a cookie, so a backend that verifies the JWT itself can.
			if tok := bearerToken(pr.In); tok != "" {
				pr.Out.Header.Set("Authorization", "Bearer "+tok)
			}
			// A backend with a credential of its own replaces that token: the
			// session authorizes the caller to console, not to the gateway.
			if apiKey != "" {
				pr.Out.Header.Set("Authorization", "Bearer "+apiKey)
			}
		},
		// Stream as it arrives: backends answer with SSE / chunked progress.
		FlushInterval: -1,
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			s.log.Warn("backend unreachable", "backend", b.Name, "path", r.URL.Path, "err", err)
			writeError(w, http.StatusBadGateway, "backend "+b.Name+" unreachable")
		},
	}
}

// backendVerb maps an HTTP method onto the RBAC verb checked for it.
func backendVerb(method string) string {
	switch method {
	case http.MethodGet, http.MethodHead, http.MethodOptions:
		return "get"
	case http.MethodPost:
		return "create"
	case http.MethodPut, http.MethodPatch:
		return "update"
	case http.MethodDelete:
		return "delete"
	}
	return strings.ToLower(method)
}
