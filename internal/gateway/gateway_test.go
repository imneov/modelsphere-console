package gateway

import (
	"context"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/modelsphere/console/internal/config"
)

// profileYAML is what swissd deploys from: the entrypoint Service, the shared
// route ConfigMap, and the Secret holding the gateway's keys.
const profileYAML = `
name: llm
namespace: llm
route:
  nginxConfigMap: llm/openresty-conf
  nginxService: llm/openresty
  nginxPort: 8080
  auth:
    secretRef: llm/openresty-keys
`

// routes is the openresty ConfigMap: one route per model, plus the aggregate
// route that serves several and therefore lists them on /v1/models.
var routes = map[string]string{
	"session_route_kimi-k2.6.conf":   "set $route \"kimi-k2.6\";\n",
	"session_route_glm-5.1.conf":     "set $route \"glm-5.1\";\n",
	"session_route_llm-gateway.conf": "set $route \"llm-gateway\";\npeers_by_model = { [\"kimi-k2.6\"] = {}, [\"glm-5.1\"] = {} }\n",
}

type fakeCluster struct {
	configMaps map[string]map[string]string
	secrets    map[string]map[string][]byte
	reads      int
	err        error
}

func (f *fakeCluster) ConfigMap(_ context.Context, ns, name string) (map[string]string, error) {
	f.reads++
	if f.err != nil {
		return nil, f.err
	}
	cm, ok := f.configMaps[ns+"/"+name]
	if !ok {
		return nil, errNotFound
	}
	return cm, nil
}

func (f *fakeCluster) Secret(_ context.Context, ns, name string) (map[string][]byte, error) {
	f.reads++
	if f.err != nil {
		return nil, f.err
	}
	s, ok := f.secrets[ns+"/"+name]
	if !ok {
		return nil, errNotFound
	}
	return s, nil
}

type notFound struct{}

func (notFound) Error() string { return "not found" }

var errNotFound = notFound{}

func fixture() *fakeCluster {
	return &fakeCluster{
		configMaps: map[string]map[string]string{
			"llm/site-profile":       {"profile.yaml": profileYAML},
			"llm/openresty-conf":     routes,
			"other/site-profile":     {"profile.yaml": strings.Replace(profileYAML, "llm/", "other/", -1)},
			"llm/no-service-profile": {"profile.yaml": "name: x\nroute:\n  nginxConfigMap: llm/openresty-conf\n"},
			"llm/old-format-conf": {
				"session_route_kimi-k2.6.conf": "set $route \"kimi-k2.6\";\n",
			},
			"llm/many-routes-conf": {
				"session_route_a.conf": "set $route \"a\";\n",
				"session_route_b.conf": "set $route \"b\";\n",
			},
			"llm/empty-conf": {"unrelated": "x"},
		},
		secrets: map[string]map[string][]byte{
			"llm/openresty-keys": {"keys": []byte("k1:alice,k2:bob")},
			"llm/blank-keys":     {"keys": []byte("")},
			"llm/other-entry":    {"apiKey": []byte("k9:carol")},
		},
	}
}

func resolveOne(t *testing.T, cfg *config.Gateway, c *fakeCluster) (*Entry, error) {
	t.Helper()
	b := config.Backend{Name: "llm", Prefix: "/api/llm", Gateway: cfg}
	return NewResolver(b, c, slog.New(slog.DiscardHandler)).Resolve(t.Context())
}

func TestResolveFromProfile(t *testing.T) {
	entry, err := resolveOne(t, &config.Gateway{Profile: "llm/site-profile"}, fixture())
	if err != nil {
		t.Fatal(err)
	}
	// The aggregate route, not one of the two single-model ones.
	if entry.URL != "http://openresty.llm.svc:8080/llm-gateway" {
		t.Fatalf("url = %q", entry.URL)
	}
	if entry.Route != "llm-gateway" || entry.Source != "llm/openresty-conf" {
		t.Fatalf("route = %q from %q", entry.Route, entry.Source)
	}
	// The first key of the keys entry, with the OpenAI convention.
	if entry.Header != "Authorization" || entry.Key != "Bearer k1" {
		t.Fatalf("credential = %q %q", entry.Header, entry.Key)
	}
	if !strings.Contains(entry.KeySource, "llm/openresty-keys") || strings.Contains(entry.KeySource, "k1") {
		t.Fatalf("key source leaks or hides where the key came from: %q", entry.KeySource)
	}
}

func TestResolveWithoutProfile(t *testing.T) {
	c := fixture()
	entry, err := resolveOne(t, &config.Gateway{ConfigMap: "llm/openresty-conf", Service: "llm/openresty", SecretRef: "llm/openresty-keys"}, c)
	if err != nil {
		t.Fatal(err)
	}
	if entry.URL != "http://openresty.llm.svc:8080/llm-gateway" || entry.Key != "Bearer k1" {
		t.Fatalf("entry = %+v", entry)
	}
}

func TestResolveExplicitRouteAndPort(t *testing.T) {
	entry, err := resolveOne(t, &config.Gateway{
		Profile: "llm/site-profile", Route: "kimi-k2.6", Port: 9000,
	}, fixture())
	if err != nil {
		t.Fatal(err)
	}
	if entry.URL != "http://openresty.llm.svc:9000/kimi-k2.6" {
		t.Fatalf("url = %q", entry.URL)
	}
}

func TestResolveSingleModelRoute(t *testing.T) {
	// No aggregate route: one route is unambiguous, and its own /v1/models
	// answers from the engine.
	entry, err := resolveOne(t, &config.Gateway{ConfigMap: "llm/old-format-conf", Service: "llm/openresty"}, fixture())
	if err != nil {
		t.Fatal(err)
	}
	if entry.Route != "kimi-k2.6" {
		t.Fatalf("route = %q", entry.Route)
	}
}

func TestResolveAmbiguousRoutes(t *testing.T) {
	_, err := resolveOne(t, &config.Gateway{ConfigMap: "llm/many-routes-conf", Service: "llm/openresty"}, fixture())
	if err == nil || !strings.Contains(err.Error(), "set gateway.route") || !strings.Contains(err.Error(), "a, b") {
		t.Fatalf("err = %v", err)
	}
}

func TestResolveNoRoutes(t *testing.T) {
	_, err := resolveOne(t, &config.Gateway{ConfigMap: "llm/empty-conf", Service: "llm/openresty"}, fixture())
	if err == nil || !strings.Contains(err.Error(), "no session_route_") {
		t.Fatalf("err = %v", err)
	}
}

func TestResolveProfileWithoutService(t *testing.T) {
	_, err := resolveOne(t, &config.Gateway{Profile: "llm/no-service-profile"}, fixture())
	if err == nil || !strings.Contains(err.Error(), "nginxService") {
		t.Fatalf("err = %v", err)
	}
}

func TestResolveSecretEntryMissing(t *testing.T) {
	_, err := resolveOne(t, &config.Gateway{Profile: "llm/site-profile", SecretRef: "llm/other-entry"}, fixture())
	if err == nil || !strings.Contains(err.Error(), `no "keys" entry`) || !strings.Contains(err.Error(), "apiKey") {
		t.Fatalf("err = %v", err)
	}
}

func TestResolveEnvOverridesSecret(t *testing.T) {
	t.Setenv("CONSOLE_TEST_GW_KEY", "from-env")
	entry, err := resolveOne(t, &config.Gateway{Profile: "llm/site-profile"}, fixture())
	if err != nil {
		t.Fatal(err)
	}
	if entry.Key != "Bearer k1" {
		t.Fatalf("without apiKeyEnv the secret decides, got %q", entry.Key)
	}

	b := config.Backend{Name: "llm", Prefix: "/api/llm", Gateway: &config.Gateway{Profile: "llm/site-profile"}, APIKeyEnv: "CONSOLE_TEST_GW_KEY"}
	entry, err = NewResolver(b, fixture(), slog.New(slog.DiscardHandler)).Resolve(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	if entry.Key != "Bearer from-env" || !strings.Contains(entry.KeySource, "CONSOLE_TEST_GW_KEY") {
		t.Fatalf("entry = %+v", entry)
	}
}

func TestResolveWithoutKeys(t *testing.T) {
	// llm-openresty fails open with no keys configured; console sends none and
	// says why, rather than inventing a credential.
	entry, err := resolveOne(t, &config.Gateway{Profile: "llm/site-profile", SecretRef: "llm/blank-keys"}, fixture())
	if err != nil {
		t.Fatal(err)
	}
	if entry.Key != "" || !strings.Contains(entry.KeySource, "empty") {
		t.Fatalf("entry = %+v", entry)
	}
}

func TestResolveBareSecretRefUsesEntrypointNamespace(t *testing.T) {
	c := &fakeCluster{
		configMaps: map[string]map[string]string{
			"llm/site-profile":   {"profile.yaml": strings.Replace(profileYAML, "secretRef: llm/openresty-keys", "secretRef: openresty-keys", 1)},
			"llm/openresty-conf": routes,
		},
		secrets: map[string]map[string][]byte{"llm/openresty-keys": {"keys": []byte("k1:alice")}},
	}
	entry, err := resolveOne(t, &config.Gateway{Profile: "llm/site-profile"}, c)
	if err != nil {
		t.Fatal(err)
	}
	// A bare name means the entrypoint's namespace, the same rule swissd applies.
	if entry.Key != "Bearer k1" {
		t.Fatalf("entry = %+v", entry)
	}
}

func TestResolveCachesAndKeepsLastGood(t *testing.T) {
	c := fixture()
	b := config.Backend{Name: "llm", Prefix: "/api/llm", Gateway: &config.Gateway{Profile: "llm/site-profile"}}
	r := NewResolver(b, c, slog.New(slog.DiscardHandler))

	first, err := r.Resolve(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	reads := c.reads
	if _, err := r.Resolve(t.Context()); err != nil {
		t.Fatal(err)
	}
	if c.reads != reads {
		t.Fatalf("a cached resolution read the cluster again: %d reads", c.reads-reads)
	}
	if ttl := r.ttl; ttl <= 0 || ttl > time.Minute {
		t.Fatalf("cache ttl = %v", ttl)
	}

	// Past the TTL a failing refresh keeps the entry the Playground is using:
	// the gateway is still there, only the API call was not.
	r.ttl = time.Nanosecond
	c.err = errNotFound
	again, err := r.Resolve(t.Context())
	if err != nil || again.URL != first.URL {
		t.Fatalf("stale entry dropped: %v %+v", err, again)
	}
}

func TestResolveReportsFailureUntilItWorks(t *testing.T) {
	c := fixture()
	b := config.Backend{Name: "llm", Prefix: "/api/llm", Gateway: &config.Gateway{Profile: "llm/absent-profile"}}
	r := NewResolver(b, c, slog.New(slog.DiscardHandler))
	if _, err := r.Resolve(t.Context()); err == nil {
		t.Fatal("a missing profile resolved")
	}

	// The cluster changes underneath; the console needs no restart to notice.
	c.configMaps["llm/absent-profile"] = map[string]string{"profile.yaml": profileYAML}
	r.ttl = time.Nanosecond
	entry, err := r.Resolve(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	if entry.Route != "llm-gateway" {
		t.Fatalf("entry = %+v", entry)
	}
}
