package server

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/modelsphere/console/internal/apikey"
	"github.com/modelsphere/console/internal/config"
)

// gatewayUpstream stands in for llm-openresty behind route /llm.
func gatewayUpstream(t *testing.T) (*httptest.Server, *[]seenRequest) {
	t.Helper()
	var seen []seenRequest
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		seen = append(seen, seenRequest{r.Method, r.URL.Path, r.URL.RawQuery, string(b), r.Header.Clone()})
		w.Header().Set("Content-Type", "application/json")
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
		APIKeys:  config.APIKeys{Secret: "console/console-api-keys", Backend: "llm", MaxBodyBytes: maxBody},
	}
	srv := testServerWithConfig(t, cfg)
	srv.SetAPIKeys(apikey.NewStore(srv.kube, "console", "console-api-keys", slog.New(slog.DiscardHandler)))
	return srv
}

func createKey(t *testing.T, h http.Handler, token, body string) apiKeyView {
	t.Helper()
	rec := do(h, "POST", "/api/iam/apikeys", token, body)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create key: %d %s", rec.Code, rec.Body.String())
	}
	var v apiKeyView
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
		do(h, "GET", "/api/iam/apikeys", bob, ""),
		do(h, "POST", "/api/iam/apikeys", bob, `{"name":"x","expiresInDays":7}`),
		do(h, "DELETE", "/api/iam/apikeys/0123456789abcdef", bob, ""),
	} {
		if rec.Code != http.StatusForbidden {
			t.Fatalf("bob: %d %s", rec.Code, rec.Body.String())
		}
	}

	key := createKey(t, h, admin, `{"name":"ci","description":"nightly","expiresInDays":30}`)
	if !strings.HasPrefix(key.Value, "ms_"+key.ID+"_") || key.ExpiresAt == nil || key.CreatedBy != "admin" {
		t.Fatalf("created %+v", key)
	}
	if rec := do(h, "POST", "/api/iam/apikeys", admin, `{"name":"ci","expiresInDays":0}`); rec.Code != http.StatusConflict {
		t.Fatalf("duplicate name: %d", rec.Code)
	}
	if rec := do(h, "POST", "/api/iam/apikeys", admin, `{"name":"x","expiresInDays":1}`); rec.Code != http.StatusBadRequest {
		t.Fatalf("expiry outside the offered ones: %d", rec.Code)
	}
	if rec := do(h, "POST", "/api/iam/apikeys", admin, `{"name":" ","expiresInDays":0}`); rec.Code != http.StatusBadRequest {
		t.Fatalf("blank name: %d", rec.Code)
	}

	rec := do(h, "GET", "/api/iam/apikeys", admin, "")
	body := rec.Body.String()
	if rec.Code != http.StatusOK || !strings.Contains(body, `"maskedValue": "ms_`+key.ID[:4]+`***"`) {
		t.Fatalf("list: %d %s", rec.Code, body)
	}
	secret := key.Value[len("ms_")+len(key.ID)+1:]
	for _, leak := range []string{secret, `"value"`, `"hash"`, `"salt"`} {
		if strings.Contains(body, leak) {
			t.Fatalf("list leaks %s: %s", leak, body)
		}
	}

	if rec := do(h, "DELETE", "/api/iam/apikeys/"+key.ID, admin, ""); rec.Code != http.StatusNoContent {
		t.Fatalf("delete: %d %s", rec.Code, rec.Body.String())
	}
	if rec := do(h, "DELETE", "/api/iam/apikeys/"+key.ID, admin, ""); rec.Code != http.StatusNotFound {
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
	got := (*seen)[0]
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

	do(h, "DELETE", "/api/iam/apikeys/"+key.ID, admin, "")
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
	if len(*seen) != 2 {
		t.Fatalf("%d requests reached the gateway, want the 2 allowed", len(*seen))
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
