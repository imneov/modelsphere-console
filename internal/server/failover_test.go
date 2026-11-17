package server

import (
	"context"
	"encoding/json"
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
	"k8s.io/apimachinery/pkg/types"
)

// failoverGateway serves two routes listing one model: the primary answers
// completions with the status the test set, the standby with usage.
type failoverGateway struct {
	mu      sync.Mutex
	hits    map[string]int
	primary int
}

func (g *failoverGateway) ServeHTTP(writer http.ResponseWriter, request *http.Request) {
	route, rest, _ := strings.Cut(strings.TrimPrefix(request.URL.Path, "/"), "/")
	if request.Header.Get("Authorization") != "Bearer gw-key" {
		http.Error(writer, "missing or invalid api key", http.StatusUnauthorized)
		return
	}
	if route != "primary" && route != "standby" {
		http.Error(writer, "no such route", http.StatusBadGateway)
		return
	}
	if rest == "v1/models" {
		_ = json.NewEncoder(writer).Encode(map[string]any{"object": "list", "data": []map[string]string{{"id": "qwen"}}})
		return
	}
	g.mu.Lock()
	g.hits[route]++
	g.mu.Unlock()
	writer.Header().Set("Content-Type", "application/json")
	if route == "primary" {
		writer.WriteHeader(g.primary)
		_, _ = writer.Write([]byte(`{"error":{"message":"primary unavailable"}}`))
		return
	}
	_, _ = writer.Write([]byte(`{"usage":{"prompt_tokens":10,"completion_tokens":2}}`))
}

func (g *failoverGateway) hit(route string) int {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.hits[route]
}

// failoverServer is a CRD-keyed router over a gateway whose model is served by
// two routes, with the pipeline configured by the test.
func failoverServer(t *testing.T, primaryStatus int, options router.PipelineOptions) (*Server, http.Handler, *failoverGateway) {
	t.Helper()
	gateway := &failoverGateway{hits: map[string]int{}, primary: primaryStatus}
	upstream := httptest.NewServer(gateway)
	t.Cleanup(upstream.Close)
	base, _ := url.Parse(upstream.URL)

	t.Setenv("TEST_GATEWAY_KEY", "gw-key")
	srv := testServerWithConfig(t, &config.Config{
		Backends: []config.Backend{{Name: "llm", Prefix: "/api/llm", Gateway: &config.Gateway{ConfigMap: "llm-route/openresty-conf", Service: "llm-route/openresty"}}},
		Router:   config.Router{KeySource: "crd", Namespace: "console", Backend: "llm"},
	})
	for _, name := range []string{"admin", "bob"} {
		user, err := srv.store.GetUser(t.Context(), name)
		if err != nil {
			t.Fatal(err)
		}
		user.UID = types.UID(name + "-uid")
		if _, err := srv.store.UpdateUser(t.Context(), user); err != nil {
			t.Fatal(err)
		}
	}
	srv.targetsOnce.Do(func() {
		srv.targets = map[string]targetResolver{"llm": func(context.Context) (*backendTarget, error) {
			return &backendTarget{url: *base, header: "Authorization", key: "Bearer gw-key", routes: []string{"primary", "standby"}}, nil
		}}
	})
	ctx, cancel := context.WithCancel(t.Context())
	t.Cleanup(cancel)
	keys, err := router.NewCRDStore(ctx, srv.kube.Dynamic(), "console", slog.New(slog.DiscardHandler))
	if err != nil {
		t.Fatal(err)
	}
	if err := srv.EnableRouter(keys); err != nil {
		t.Fatal(err)
	}
	if options.Transport == nil {
		options.Transport = http.DefaultTransport
	}
	if err := srv.router.ConfigurePipeline(options); err != nil {
		t.Fatal(err)
	}
	return srv, srv.Handler(), gateway
}

func TestUpstreamStatusFailsOverToAnotherRouteServingTheModel(t *testing.T) {
	_, handler, gateway := failoverServer(t, http.StatusServiceUnavailable, router.PipelineOptions{MaxAttempts: 2, MaxSSEFrameBytes: 1 << 20, FailoverStatuses: []int{http.StatusServiceUnavailable}})
	admin := login(t, handler, "admin", "admin-pw")
	key := createKey(t, handler, admin, `{"name":"failover","user":"bob"}`)
	awaitKeyResponse(t, handler, key.Value, "qwen", http.StatusOK)
	if gateway.hit("primary") != 1 || gateway.hit("standby") != 1 {
		t.Fatalf("routes hit: primary=%d standby=%d", gateway.hit("primary"), gateway.hit("standby"))
	}
}

func TestClientErrorsAreNotReplayed(t *testing.T) {
	_, handler, gateway := failoverServer(t, http.StatusBadRequest, router.PipelineOptions{MaxAttempts: 2, MaxSSEFrameBytes: 1 << 20, FailoverStatuses: []int{http.StatusServiceUnavailable}})
	admin := login(t, handler, "admin", "admin-pw")
	key := createKey(t, handler, admin, `{"name":"client","user":"bob"}`)
	awaitKeyResponse(t, handler, key.Value, "qwen", http.StatusBadRequest)
	if gateway.hit("primary") != 1 || gateway.hit("standby") != 0 {
		t.Fatalf("routes hit: primary=%d standby=%d", gateway.hit("primary"), gateway.hit("standby"))
	}
}

func TestOpenCircuitSkipsToAnotherRoute(t *testing.T) {
	_, handler, gateway := failoverServer(t, http.StatusServiceUnavailable, router.PipelineOptions{MaxAttempts: 2, MaxSSEFrameBytes: 1 << 20, FailoverStatuses: []int{http.StatusServiceUnavailable}, CircuitFailureThreshold: 1, CircuitResetAfter: time.Hour})
	admin := login(t, handler, "admin", "admin-pw")
	key := createKey(t, handler, admin, `{"name":"circuit-failover","user":"bob"}`)
	awaitKeyResponse(t, handler, key.Value, "qwen", http.StatusOK)
	if response := do(handler, http.MethodPost, "/v1/chat/completions", key.Value, `{"model":"qwen"}`); response.Code != http.StatusOK {
		t.Fatalf("second call: %d %s", response.Code, response.Body.String())
	}
	if gateway.hit("primary") != 1 {
		t.Fatalf("first call should fail over once from primary: %d", gateway.hit("primary"))
	}
	if gateway.hit("standby") != 2 {
		t.Fatalf("second call should skip the open primary: %d", gateway.hit("standby"))
	}
}
