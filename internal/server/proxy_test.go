package server

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/modelsphere/console/internal/config"
)

type seenRequest struct {
	method, path, query, body string
	header                    http.Header
}

// upstream is a fake module backend (swissd) that records what reached it.
func upstream(t *testing.T) (*httptest.Server, *[]seenRequest) {
	t.Helper()
	var seen []seenRequest
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		seen = append(seen, seenRequest{r.Method, r.URL.Path, r.URL.RawQuery, string(b), r.Header.Clone()})
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusTeapot)
		_, _ = w.Write([]byte(`{"from":"swissd"}`))
	}))
	t.Cleanup(srv.Close)
	return srv, &seen
}

func proxyServer(t *testing.T, backendURL string) http.Handler {
	t.Helper()
	cfg := &config.Config{Backends: []config.Backend{{Name: "swiss", Prefix: "/api/deploy", URL: backendURL + "/api"}}}
	return testServerWithConfig(t, cfg).Handler()
}

func TestProxyForwardsUnderPrefixWithIdentity(t *testing.T) {
	up, seen := upstream(t)
	h := proxyServer(t, up.URL)
	admin := login(t, h, "admin", "admin-pw")

	req := httptest.NewRequest("POST", "/api/deploy/plans?dry=1", strings.NewReader(`{"model":"kimi"}`))
	req.Header.Set("Authorization", "Bearer "+admin)
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: "token", Value: admin})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusTeapot || rec.Body.String() != `{"from":"swissd"}` {
		t.Fatalf("response not passed through: %d %s", rec.Code, rec.Body.String())
	}
	if len(*seen) != 1 {
		t.Fatalf("upstream hits: %d", len(*seen))
	}
	got := (*seen)[0]
	if got.method != "POST" || got.path != "/api/plans" || got.query != "dry=1" || got.body != `{"model":"kimi"}` {
		t.Fatalf("prefix not rewritten onto backend path: %+v", got)
	}
	if u := got.header.Get("X-Remote-User"); u != "admin" {
		t.Fatalf("X-Remote-User = %q", u)
	}
	if g := strings.Join(got.header.Values("X-Remote-Group"), ","); g != "system:authenticated,system:masters" {
		t.Fatalf("X-Remote-Group = %q", g)
	}
	if a := got.header.Get("Authorization"); a != "Bearer "+admin {
		t.Fatalf("caller token not carried: %q", a)
	}
	if c := got.header.Get("Cookie"); c != "" {
		t.Fatalf("browser cookies leaked to backend: %q", c)
	}
}

func TestProxyRequiresLogin(t *testing.T) {
	up, seen := upstream(t)
	h := proxyServer(t, up.URL)
	if rec := do(h, "GET", "/api/deploy/catalog", "", ""); rec.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous: expected 401, got %d", rec.Code)
	}
	if len(*seen) != 0 {
		t.Fatal("anonymous request reached the backend")
	}
}

func TestProxyReplacesSpoofedRemoteHeaders(t *testing.T) {
	up, seen := upstream(t)
	h := proxyServer(t, up.URL)
	bob := login(t, h, "bob", "bob-pw")
	grantBackend(t, h, "bob", "get")

	req := httptest.NewRequest("GET", "/api/deploy/catalog", nil)
	req.Header.Set("Authorization", "Bearer "+bob)
	req.Header.Set("X-Remote-User", "admin")
	req.Header.Set("X-Remote-Group", "system:masters")
	req.Header.Set("X-Remote-Extra-Scope", "all")
	h.ServeHTTP(httptest.NewRecorder(), req)

	if len(*seen) != 1 {
		t.Fatalf("upstream hits: %d", len(*seen))
	}
	hdr := (*seen)[0].header
	if hdr.Get("X-Remote-User") != "bob" || strings.Join(hdr.Values("X-Remote-Group"), ",") != "system:authenticated" || hdr.Get("X-Remote-Extra-Scope") != "" {
		t.Fatalf("spoofed identity reached backend: %v", hdr)
	}
}

func TestProxyAuthorizesPerBackendAndVerb(t *testing.T) {
	up, seen := upstream(t)
	h := proxyServer(t, up.URL)
	bob := login(t, h, "bob", "bob-pw")

	if rec := do(h, "GET", "/api/deploy/catalog", bob, ""); rec.Code != http.StatusForbidden {
		t.Fatalf("bob before grant: expected 403, got %d", rec.Code)
	}

	grantBackend(t, h, "bob", "get")
	if rec := do(h, "GET", "/api/deploy/catalog", bob, ""); rec.Code != http.StatusTeapot {
		t.Fatalf("bob read after grant: expected passthrough, got %d %s", rec.Code, rec.Body.String())
	}
	if rec := do(h, "POST", "/api/deploy/install", bob, "{}"); rec.Code != http.StatusForbidden {
		t.Fatalf("bob write with read-only grant: expected 403, got %d", rec.Code)
	}
	if rec := do(h, "DELETE", "/api/deploy/releases/x", bob, ""); rec.Code != http.StatusForbidden {
		t.Fatalf("bob delete with read-only grant: expected 403, got %d", rec.Code)
	}
	if len(*seen) != 1 {
		t.Fatalf("only the permitted request may reach the backend, got %d", len(*seen))
	}
}

func TestProxyBackendDown(t *testing.T) {
	up, _ := upstream(t)
	down := up.URL
	up.Close()
	h := proxyServer(t, down)
	admin := login(t, h, "admin", "admin-pw")

	rec := do(h, "GET", "/api/deploy/catalog", admin, "")
	if rec.Code != http.StatusBadGateway || !strings.Contains(rec.Body.String(), `"error"`) {
		t.Fatalf("backend down: expected JSON 502, got %d %s", rec.Code, rec.Body.String())
	}
}

func TestProxyLeavesOwnRoutesAlone(t *testing.T) {
	up, seen := upstream(t)
	h := proxyServer(t, up.URL)
	admin := login(t, h, "admin", "admin-pw")
	if rec := do(h, "GET", "/api/me", admin, ""); rec.Code != http.StatusOK {
		t.Fatalf("/api/me: %d", rec.Code)
	}
	if rec := do(h, "GET", "/api/deployments", admin, ""); rec.Code == http.StatusTeapot {
		t.Fatal("a path that only shares a string prefix with the backend was proxied")
	}
	if len(*seen) != 0 {
		t.Fatalf("console's own routes reached the backend: %+v", *seen)
	}
}

// grantBackend binds user to a role allowing verb on the "swiss" backend.
func grantBackend(t *testing.T, h http.Handler, user, verb string) {
	t.Helper()
	admin := login(t, h, "admin", "admin-pw")
	role := `{"name":"swiss-` + verb + `","rules":[{"verbs":["` + verb + `"],"apiGroups":["iam.theriseunion.io"],"resources":["backends"],"resourceNames":["swiss"]}]}`
	if rec := do(h, "POST", "/api/iam/roles", admin, role); rec.Code != http.StatusCreated {
		t.Fatalf("create role: %d %s", rec.Code, rec.Body.String())
	}
	binding := `{"name":"` + user + `-swiss-` + verb + `","role":"swiss-` + verb + `","subjects":[{"kind":"User","name":"` + user + `"}]}`
	if rec := do(h, "POST", "/api/iam/rolebindings", admin, binding); rec.Code != http.StatusCreated {
		t.Fatalf("create binding: %d %s", rec.Code, rec.Body.String())
	}
}

// The production mux also serves the embedded SPA on "/". Registering it next to
// a backend prefix must not collide (Go's ServeMux panics on ambiguous patterns),
// and each must still get its own requests.
func TestProxyCoexistsWithSPA(t *testing.T) {
	up, seen := upstream(t)
	srv := testServerWithConfig(t, &config.Config{Backends: []config.Backend{{Name: "swiss", Prefix: "/api/deploy", URL: up.URL + "/api"}}})
	srv.SetWeb(fstest.MapFS{"index.html": {Data: []byte("<html>console</html>")}})

	var h http.Handler
	func() {
		defer func() {
			if r := recover(); r != nil {
				t.Fatalf("Handler panicked: %v", r)
			}
		}()
		h = srv.Handler()
	}()

	if rec := do(h, "GET", "/swiss/catalog", "", ""); rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "console") {
		t.Fatalf("SPA route: %d %q", rec.Code, rec.Body.String())
	}
	admin := login(t, h, "admin", "admin-pw")
	if rec := do(h, "POST", "/api/deploy/plans", admin, "{}"); rec.Code != http.StatusTeapot || len(*seen) != 1 {
		t.Fatalf("proxy beside SPA: %d, hits %d", rec.Code, len(*seen))
	}
	if rec := do(h, "POST", "/swiss/catalog", "", ""); rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("non-GET on an SPA route: expected 405, got %d", rec.Code)
	}
}
