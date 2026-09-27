package server

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/modelsphere/console/internal/config"
	"github.com/modelsphere/console/internal/router"
)

// autoconfigGateway stands in for llm-openresty fed by autoconfig: one plain
// route per model, each proxying /v1/models to its engine, and no route that
// lists them all. Route "broken" does not answer.
type autoconfigGateway struct {
	mu     sync.Mutex
	models map[string][]string
	hits   []string
}

func (g *autoconfigGateway) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	route, rest, _ := strings.Cut(strings.TrimPrefix(r.URL.Path, "/"), "/")
	g.mu.Lock()
	models, ok := g.models[route]
	g.hits = append(g.hits, r.Method+" "+r.URL.Path)
	g.mu.Unlock()
	if r.Header.Get("Authorization") != "Bearer gw-key" {
		http.Error(w, "missing or invalid api key", http.StatusUnauthorized)
		return
	}
	switch {
	case !ok:
		http.Error(w, "no such route", http.StatusBadGateway)
	case rest == "v1/models":
		data := []map[string]string{}
		for _, m := range models {
			data = append(data, map[string]string{"id": m})
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"object": "list", "data": data})
	default:
		_, _ = io.Copy(io.Discard, r.Body)
		_ = json.NewEncoder(w).Encode(map[string]string{"route": route, "path": "/" + rest})
	}
}

func (g *autoconfigGateway) serve(route string, models ...string) {
	g.mu.Lock()
	g.models[route] = models
	g.mu.Unlock()
}

func multiRouteServer(t *testing.T) (*Server, http.Handler, *autoconfigGateway) {
	t.Helper()
	gw := &autoconfigGateway{models: map[string][]string{"qwen-a": {"qwen-a"}, "qwen-b": {"qwen-b"}}}
	up := httptest.NewServer(gw)
	t.Cleanup(up.Close)
	base, _ := url.Parse(up.URL)

	cfg := &config.Config{
		Backends: []config.Backend{{Name: "llm", Prefix: "/api/llm", Gateway: &config.Gateway{ConfigMap: "llm-route/openresty-conf", Service: "llm-route/openresty"}}},
		Router:   config.Router{Secret: "console/console-api-keys", Backend: "llm"},
	}
	srv := testServerWithConfig(t, cfg)
	// What the resolver makes of autoconfig's ConfigMap, pointed at the fake.
	srv.targetsOnce.Do(func() {
		srv.targets = map[string]targetResolver{"llm": func(context.Context) (*backendTarget, error) {
			return &backendTarget{url: *base, header: "Authorization", key: "Bearer gw-key", routes: []string{"broken", "qwen-a", "qwen-b"}}, nil
		}}
	})
	srv.EnableRouter(router.NewStore(srv.kube, "console", "console-api-keys", slog.New(slog.DiscardHandler)))
	return srv, srv.Handler(), gw
}

func decode(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var v map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &v); err != nil {
		t.Fatalf("%d %s: %v", rec.Code, rec.Body.String(), err)
	}
	return v
}

func ids(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()
	var out []string
	for _, d := range decode(t, rec)["data"].([]any) {
		out = append(out, d.(map[string]any)["id"].(string))
	}
	return strings.Join(out, ",")
}

func TestPlaygroundAcrossPlainRoutes(t *testing.T) {
	_, h, _ := multiRouteServer(t)
	admin := login(t, h, "admin", "admin-pw")

	// One list, from every route that answered: "broken" is left out, not fatal.
	if got := ids(t, do(h, "GET", "/api/llm/v1/models", admin, "")); got != "qwen-a,qwen-b" {
		t.Fatalf("models = %s", got)
	}
	rec := do(h, "POST", "/api/llm/v1/chat/completions", admin, `{"model":"qwen-b","stream":true}`)
	if v := decode(t, rec); v["route"] != "qwen-b" || v["path"] != "/v1/chat/completions" {
		t.Fatalf("qwen-b went to %v", v)
	}
	if v := decode(t, do(h, "POST", "/api/llm/v1/chat/completions", admin, `{"model":"qwen-a"}`)); v["route"] != "qwen-a" {
		t.Fatalf("qwen-a went to %v", v)
	}

	rec = do(h, "POST", "/api/llm/v1/chat/completions", admin, `{"model":"nope"}`)
	if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "qwen-a, qwen-b") {
		t.Fatalf("unknown model: %d %s", rec.Code, rec.Body.String())
	}
	rec = do(h, "POST", "/api/llm/v1/chat/completions", admin, `{"messages":[]}`)
	if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "name a model") {
		t.Fatalf("no model: %d %s", rec.Code, rec.Body.String())
	}
}

func TestV1AcrossPlainRoutes(t *testing.T) {
	_, h, _ := multiRouteServer(t)
	admin := login(t, h, "admin", "admin-pw")
	all := createKey(t, h, admin, `{"name":"all","expiresInDays":0}`)
	onlyA := createKey(t, h, admin, `{"name":"a","expiresInDays":0,"models":["qwen-a"]}`)

	if got := ids(t, do(h, "GET", "/v1/models", all.Value, "")); got != "qwen-a,qwen-b" {
		t.Fatalf("all: %s", got)
	}
	if got := ids(t, do(h, "GET", "/v1/models", onlyA.Value, "")); got != "qwen-a" {
		t.Fatalf("scoped: %s", got)
	}
	if v := decode(t, do(h, "GET", "/v1/models/qwen-b", all.Value, "")); v["id"] != "qwen-b" {
		t.Fatalf("model object: %v", v)
	}

	for model, route := range map[string]string{"qwen-a": "qwen-a", "qwen-b": "qwen-b"} {
		if v := decode(t, do(h, "POST", "/v1/chat/completions", all.Value, `{"model":"`+model+`"}`)); v["route"] != route {
			t.Fatalf("%s went to %v", model, v)
		}
	}
	cases := []struct {
		key, method, path, body string
		want                    int
		code                    string
	}{
		{onlyA.Value, "POST", "/v1/chat/completions", `{"model":"qwen-b"}`, http.StatusForbidden, "model_not_allowed"},
		{onlyA.Value, "GET", "/v1/models/qwen-b", "", http.StatusForbidden, "model_not_allowed"},
		{all.Value, "POST", "/v1/chat/completions", `{"model":"nope"}`, http.StatusNotFound, "model_not_found"},
		{all.Value, "GET", "/v1/models/nope", "", http.StatusNotFound, "model_not_found"},
		{all.Value, "POST", "/v1/chat/completions", `{"messages":[]}`, http.StatusBadRequest, ""},
	}
	for _, tc := range cases {
		rec := do(h, tc.method, tc.path, tc.key, tc.body)
		if rec.Code != tc.want || !strings.Contains(rec.Body.String(), tc.code) {
			t.Errorf("%s %s %s: %d %s", tc.method, tc.path, tc.body, rec.Code, rec.Body.String())
		}
	}
}

// A model deployed after the list was taken works on its first request: an
// unknown model re-asks the routes, at most every catalogMissRefresh.
func TestNewModelIsFoundWithoutWaitingForTheTTL(t *testing.T) {
	srv, h, gw := multiRouteServer(t)
	admin := login(t, h, "admin", "admin-pw")
	clock := time.Now()
	srv.models.now = func() time.Time { return clock }

	do(h, "GET", "/api/llm/v1/models", admin, "")
	gw.serve("qwen-b", "qwen-b", "qwen-c")

	if rec := do(h, "POST", "/api/llm/v1/chat/completions", admin, `{"model":"qwen-c"}`); rec.Code != http.StatusBadRequest {
		t.Fatalf("within the miss window the old list stands: %d", rec.Code)
	}
	clock = clock.Add(catalogMissRefresh)
	if v := decode(t, do(h, "POST", "/api/llm/v1/chat/completions", admin, `{"model":"qwen-c"}`)); v["route"] != "qwen-b" {
		t.Fatalf("qwen-c went to %v", v)
	}
}

// A route openresty has not loaded yet answers 502; once it does, its model
// shows up within catalogMissRefresh, not the full TTL.
func TestLateRouteJoinsTheListSoon(t *testing.T) {
	srv, h, gw := multiRouteServer(t)
	admin := login(t, h, "admin", "admin-pw")
	clock := time.Now()
	srv.models.now = func() time.Time { return clock }

	if got := ids(t, do(h, "GET", "/api/llm/v1/models", admin, "")); got != "qwen-a,qwen-b" {
		t.Fatalf("models = %s", got)
	}
	gw.serve("broken", "qwen-late")
	clock = clock.Add(catalogMissRefresh)
	do(h, "GET", "/api/llm/v1/models", admin, "") // stale answer, refresh behind it
	deadline := time.Now().Add(5 * time.Second)
	for {
		got := ids(t, do(h, "GET", "/api/llm/v1/models", admin, ""))
		if got == "qwen-a,qwen-b,qwen-late" {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("models = %s", got)
		}
		time.Sleep(20 * time.Millisecond)
	}
}
