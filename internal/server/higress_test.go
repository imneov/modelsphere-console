package server

import (
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/modelsphere/console/internal/config"
)

func TestHigressDisablesBothOldInferenceProxiesButKeepsManagement(t *testing.T) {
	var calls atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		calls.Add(1)
		writer.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(upstream.Close)
	server := crdInferenceServerAt(t, upstream.URL)
	server.cfg.Higress.Enabled = true
	handler := server.Handler()
	admin := login(t, handler, "admin", "admin-pw")
	for _, path := range []string{"/v1/chat/completions", "/v1/models", "/api/llm/v1/chat/completions", "/api/llm/v1/models"} {
		response := do(handler, "POST", path, admin, `{"model":"qwen"}`)
		if response.Code != http.StatusServiceUnavailable {
			t.Fatalf("old proxy still mounted at %s: %d %s", path, response.Code, response.Body.String())
		}
	}
	response := do(handler, "POST", "/api/router/apikeys", admin, `{"name":"higress-key","user":"bob","principalUID":"bob-uid"}`)
	if response.Code != http.StatusCreated {
		t.Fatalf("key management unavailable: %d %s", response.Code, response.Body.String())
	}
	if response := do(handler, "GET", "/api/router/apikeys", admin, ""); response.Code != http.StatusOK {
		t.Fatalf("key list unavailable: %d", response.Code)
	}
	if calls.Load() != 0 {
		t.Fatalf("Console still forwarded %d inference requests", calls.Load())
	}
	if response := do(handler, "GET", "/api/llm/route-options", admin, ""); response.Code != http.StatusNotFound {
		t.Fatalf("optional legacy directive catalog must remain absent: %d", response.Code)
	}
}

func TestHigressWithoutLegacyBackendRejectsInference(t *testing.T) {
	server := testServerWithConfig(t, &config.Config{Higress: config.Higress{Enabled: true}})
	handler := server.Handler()
	admin := login(t, handler, "admin", "admin-pw")
	if response := do(handler, "POST", "/api/llm/v1/chat/completions", admin, `{}`); response.Code != http.StatusServiceUnavailable {
		t.Fatalf("inference reached fallback: %d %s", response.Code, response.Body.String())
	}
}
