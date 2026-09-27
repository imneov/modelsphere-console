package server

import (
	"bufio"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/modelsphere/console/internal/config"
	"github.com/modelsphere/console/internal/router"
)

// gatewayUpstream stands in for llm-openresty behind route /llm.
func gatewayUpstream(t *testing.T) (*httptest.Server, *[]seenRequest) {
	t.Helper()
	var seen []seenRequest
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		seen = append(seen, seenRequest{r.Method, r.URL.Path, r.URL.RawQuery, string(b), r.Header.Clone()})
		w.Header().Set("Content-Type", "application/json")
		if strings.Contains(string(b), `"model":"missing"`) {
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte(`{"error":{"message":"model not found"}}`))
			return
		}
		if r.URL.Path == "/llm/v1/models" {
			_, _ = w.Write([]byte(`{"object":"list","data":[{"id":"qwen","object":"model"},{"id":"kimi","object":"model"}]}`))
			return
		}
		_, _ = w.Write([]byte(`{"from":"gateway"}`))
	}))
	t.Cleanup(srv.Close)
	return srv, &seen
}

func inferenceServer(t *testing.T, gatewayURL string, maxBody int64) *Server {
	t.Helper()
	t.Setenv("TEST_GATEWAY_KEY", "gw-key")
	cfg := &config.Config{
		Backends: []config.Backend{{Name: "llm", Prefix: "/api/llm", URL: gatewayURL + "/llm", APIKeyEnv: "TEST_GATEWAY_KEY"}},
		Router:   config.Router{Secret: "console/console-api-keys", Backend: "llm", MaxBodyBytes: maxBody},
	}
	srv := testServerWithConfig(t, cfg)
	srv.EnableRouter(router.NewStore(srv.kube, "console", "console-api-keys", slog.New(slog.DiscardHandler)))
	return srv
}

type createdKey struct {
	ID        string  `json:"id"`
	Value     string  `json:"value"`
	CreatedBy string  `json:"createdBy"`
	ExpiresAt *string `json:"expiresAt"`
}

func createKey(t *testing.T, h http.Handler, token, body string) createdKey {
	t.Helper()
	rec := do(h, "POST", "/api/router/apikeys", token, body)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create key: %d %s", rec.Code, rec.Body.String())
	}
	var v createdKey
	if err := json.Unmarshal(rec.Body.Bytes(), &v); err != nil {
		t.Fatal(err)
	}
	return v
}

func TestAPIKeyManagementIsForAdmins(t *testing.T) {
	up, _ := gatewayUpstream(t)
	h := inferenceServer(t, up.URL, 0).Handler()
	admin, bob := login(t, h, "admin", "admin-pw"), login(t, h, "bob", "bob-pw")

	for _, rec := range []*httptest.ResponseRecorder{
		do(h, "GET", "/api/router/apikeys", bob, ""),
		do(h, "POST", "/api/router/apikeys", bob, `{"name":"x","expiresInDays":7}`),
		do(h, "DELETE", "/api/router/apikeys/0123456789abcdef", bob, ""),
	} {
		if rec.Code != http.StatusForbidden {
			t.Fatalf("bob: %d %s", rec.Code, rec.Body.String())
		}
	}

	key := createKey(t, h, admin, `{"name":"ci","description":"nightly","expiresInDays":30}`)
	if !strings.HasPrefix(key.Value, "ms_"+key.ID+"_") || key.ExpiresAt == nil || key.CreatedBy != "admin" {
		t.Fatalf("created %+v", key)
	}
	if rec := do(h, "POST", "/api/router/apikeys", admin, `{"name":"ci","expiresInDays":0}`); rec.Code != http.StatusConflict {
		t.Fatalf("duplicate name: %d", rec.Code)
	}
	if rec := do(h, "POST", "/api/router/apikeys", admin, `{"name":"x","expiresInDays":1}`); rec.Code != http.StatusBadRequest {
		t.Fatalf("expiry outside the offered ones: %d", rec.Code)
	}
	if rec := do(h, "POST", "/api/router/apikeys", admin, `{"name":" ","expiresInDays":0}`); rec.Code != http.StatusBadRequest {
		t.Fatalf("blank name: %d", rec.Code)
	}

	rec := do(h, "GET", "/api/router/apikeys", admin, "")
	body := rec.Body.String()
	if rec.Code != http.StatusOK || !strings.Contains(body, `"maskedValue": "ms_`+key.ID[:4]+`***"`) {
		t.Fatalf("list: %d %s", rec.Code, body)
	}
	secret := key.Value[len("ms_")+len(key.ID)+1:]
	for _, leak := range []string{secret, `"value"`, `"hash"`, `"salt"`, `lastUsed`} {
		if strings.Contains(body, leak) {
			t.Fatalf("list leaks %s: %s", leak, body)
		}
	}

	if rec := do(h, "DELETE", "/api/router/apikeys/"+key.ID, admin, ""); rec.Code != http.StatusNoContent {
		t.Fatalf("delete: %d %s", rec.Code, rec.Body.String())
	}
	if rec := do(h, "DELETE", "/api/router/apikeys/"+key.ID, admin, ""); rec.Code != http.StatusNotFound {
		t.Fatalf("delete twice: %d", rec.Code)
	}
}

func TestV1SwapsTheKeyForTheGateways(t *testing.T) {
	up, seen := gatewayUpstream(t)
	h := inferenceServer(t, up.URL, 0).Handler()
	admin := login(t, h, "admin", "admin-pw")
	key := createKey(t, h, admin, `{"name":"ci","expiresInDays":0}`)

	req := httptest.NewRequest("POST", "/v1/chat/completions", strings.NewReader(`{"model":"qwen","stream":true}`))
	req.Header.Set("Authorization", "Bearer "+key.Value)
	req.Header.Set("X-Session-Id", "conv-1")
	req.Header.Set("X-Remote-User", "spoofed")
	req.AddCookie(&http.Cookie{Name: "token", Value: admin})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK || rec.Body.String() != `{"from":"gateway"}` {
		t.Fatalf("%d %s", rec.Code, rec.Body.String())
	}
	var got seenRequest
	for _, r := range *seen {
		if r.path == "/llm/v1/chat/completions" {
			got = r
		}
	}
	switch {
	case got.path != "/llm/v1/chat/completions" || got.body != `{"model":"qwen","stream":true}`:
		t.Fatalf("forwarded %s %q", got.path, got.body)
	case got.header.Get("Authorization") != "Bearer gw-key":
		t.Fatalf("gateway credential %q", got.header.Get("Authorization"))
	case got.header.Get("X-Session-Id") != "conv-1":
		t.Fatal("X-Session-Id not passed through")
	case got.header.Get("Cookie") != "" || got.header.Get("X-Remote-User") != "":
		t.Fatalf("leaked headers %v", got.header)
	}

	do(h, "DELETE", "/api/router/apikeys/"+key.ID, admin, "")
	if rec := do(h, "POST", "/v1/chat/completions", key.Value, `{"model":"qwen"}`); rec.Code != http.StatusUnauthorized {
		t.Fatalf("deleted key: %d", rec.Code)
	}
}

func TestV1RejectsWhatIsNotAKey(t *testing.T) {
	up, seen := gatewayUpstream(t)
	h := inferenceServer(t, up.URL, 0).Handler()
	admin := login(t, h, "admin", "admin-pw")

	for name, token := range map[string]string{
		"none":          "",
		"console login": admin,
		"made up":       "ms_0123456789abcdef_0123456789abcdef0123456789abcdef",
	} {
		rec := do(h, "GET", "/v1/models", token, "")
		var body struct {
			Error struct{ Code string } `json:"error"`
		}
		_ = json.Unmarshal(rec.Body.Bytes(), &body)
		if rec.Code != http.StatusUnauthorized || body.Error.Code != "invalid_api_key" {
			t.Fatalf("%s: %d %s", name, rec.Code, rec.Body.String())
		}
	}
	if len(*seen) != 0 {
		t.Fatalf("%d requests reached the gateway", len(*seen))
	}
}

func TestV1KeyLimitedToModels(t *testing.T) {
	up, seen := gatewayUpstream(t)
	h := inferenceServer(t, up.URL, 64).Handler()
	admin := login(t, h, "admin", "admin-pw")
	key := createKey(t, h, admin, `{"name":"qwen only","expiresInDays":7,"models":["qwen"]}`)

	cases := []struct {
		method, path, body string
		want               int
	}{
		{"POST", "/v1/chat/completions", `{"model":"qwen"}`, http.StatusOK},
		{"POST", "/v1/chat/completions", `{"model":"kimi"}`, http.StatusForbidden},
		{"POST", "/v1/chat/completions", `{"messages":[]}`, http.StatusForbidden},
		{"GET", "/v1/models/qwen", "", http.StatusOK},
		{"GET", "/v1/models/kimi", "", http.StatusForbidden},
		{"POST", "/v1/chat/completions", `{"model":"qwen","prompt":"` + strings.Repeat("x", 64) + `"}`, http.StatusRequestEntityTooLarge},
	}
	for _, tc := range cases {
		if rec := do(h, tc.method, tc.path, key.Value, tc.body); rec.Code != tc.want {
			t.Errorf("%s %s %s: %d, want %d: %s", tc.method, tc.path, tc.body, rec.Code, tc.want, rec.Body.String())
		}
	}
	forwarded := 0
	for _, r := range *seen {
		if r.path != "/llm/v1/models" {
			forwarded++
		}
	}
	// Only the allowed chat: /v1/models/<id> is answered by console itself.
	if forwarded != 1 {
		t.Fatalf("%d inference requests reached the gateway, want the 1 allowed", forwarded)
	}

	rec := do(h, "GET", "/v1/models", key.Value, "")
	var list struct {
		Object string `json:"object"`
		Data   []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &list); err != nil || rec.Code != http.StatusOK {
		t.Fatalf("models: %d %s", rec.Code, rec.Body.String())
	}
	if list.Object != "list" || len(list.Data) != 1 || list.Data[0].ID != "qwen" {
		t.Fatalf("models not filtered: %s", rec.Body.String())
	}
}

func TestReadyzFailsWhileDraining(t *testing.T) {
	srv := testServer(t)
	h := srv.Handler()
	if rec := do(h, "GET", "/readyz", "", ""); rec.Code != http.StatusOK {
		t.Fatalf("ready: %d", rec.Code)
	}
	srv.draining.Store(true)
	if rec := do(h, "GET", "/readyz", "", ""); rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("draining: %d", rec.Code)
	}
	if rec := do(h, "GET", "/healthz", "", ""); rec.Code != http.StatusOK {
		t.Fatalf("liveness must not fail while draining: %d", rec.Code)
	}
}

func scrape(t *testing.T, srv *Server) string {
	t.Helper()
	rec := httptest.NewRecorder()
	srv.MetricsHandler().ServeHTTP(rec, httptest.NewRequest("GET", "/metrics", nil))
	return rec.Body.String()
}

// Usage is observed as metrics rather than written back to the keys' Secret.
func TestRouterMetrics(t *testing.T) {
	up, _ := gatewayUpstream(t)
	srv := inferenceServer(t, up.URL, 0)
	h := srv.Handler()
	admin := login(t, h, "admin", "admin-pw")
	key := createKey(t, h, admin, `{"name":"ci","expiresInDays":0}`)

	do(h, "POST", "/v1/chat/completions", key.Value, `{"model":"qwen"}`)
	do(h, "POST", "/v1/chat/completions", key.Value, `{"model":"qwen"}`)
	do(h, "POST", "/v1/chat/completions", key.Value, `{"model":"missing"}`)
	do(h, "GET", "/v1/models", "ms_0123456789abcdef_0123456789abcdef0123456789abcdef", "")

	out := scrape(t, srv)
	for _, want := range []string{
		`router_requests_total{code="200",key_id="` + key.ID + `",key_name="ci",model="qwen"} 2`,
		// A model nothing serves is answered here and never becomes a label value.
		`router_rejected_total{reason="unknown_model"} 1`,
		`router_key_last_request_timestamp_seconds{key_id="` + key.ID + `",key_name="ci"}`,
		`router_rejected_total{reason="invalid_key"} 1`,
		"go_goroutines",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("metrics lack %s", want)
		}
	}
	if strings.Contains(out, key.Value) {
		t.Fatal("metrics leak the key")
	}

	do(h, "DELETE", "/api/router/apikeys/"+key.ID, admin, "")
	if out := scrape(t, srv); strings.Contains(out, key.ID) {
		t.Fatal("a deleted key's series remain")
	}
}

func TestV1Streams(t *testing.T) {
	release := make(chan struct{})
	gateway := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/llm/v1/models" {
			_, _ = w.Write([]byte(`{"data":[{"id":"qwen"}]}`))
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte(`data: {"choices":[{"delta":{"content":"first"}}]}` + "\n\n"))
		w.(http.Flusher).Flush()
		<-release
		_, _ = w.Write([]byte("data: [DONE]\n\n"))
	}))
	t.Cleanup(gateway.Close)
	srv := inferenceServer(t, gateway.URL, 0)
	h := srv.Handler()
	key := createKey(t, h, login(t, h, "admin", "admin-pw"), `{"name":"ci","expiresInDays":0}`)
	console := httptest.NewServer(h)
	t.Cleanup(console.Close)

	req, _ := http.NewRequest("POST", console.URL+"/v1/chat/completions", strings.NewReader(`{"model":"qwen","stream":true}`))
	req.Header.Set("Authorization", "Bearer "+key.Value)
	resp, err := console.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	first := make(chan string, 1)
	reader := bufio.NewReader(resp.Body)
	go func() { line, _ := reader.ReadString('\n'); first <- line }()
	select {
	case line := <-first:
		if !strings.Contains(line, "first") {
			t.Fatalf("first frame: %q", line)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("no frame while the gateway was still generating: /v1 buffered the stream")
	}
	close(release)
	if rest, _ := io.ReadAll(reader); !strings.Contains(string(rest), "[DONE]") {
		t.Fatalf("stream did not finish: %q", rest)
	}
}
