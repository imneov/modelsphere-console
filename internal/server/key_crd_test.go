package server

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/modelsphere/console/internal/config"
	"github.com/modelsphere/console/internal/router"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
)

func crdInferenceServer(t *testing.T) *Server {
	t.Helper()
	up, _ := gatewayUpstream(t)
	return crdInferenceServerAt(t, up.URL)
}

func crdInferenceServerAt(t *testing.T, upstream string) *Server {
	t.Helper()
	t.Setenv("TEST_GATEWAY_KEY", "gw-key")
	srv := testServerWithConfig(t, &config.Config{
		Backends: []config.Backend{{Name: "llm", Prefix: "/api/llm", URL: upstream + "/llm", APIKeyEnv: "TEST_GATEWAY_KEY"}},
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
	ctx, cancel := context.WithCancel(t.Context())
	t.Cleanup(cancel)
	keys, err := router.NewCRDStore(ctx, srv.kube.Dynamic(), "console", slog.New(slog.DiscardHandler))
	if err != nil {
		t.Fatal(err)
	}
	srv.EnableRouter(keys)
	return srv
}

func TestCRDKeyUsesGlobalCredentialAndExplicitOwner(t *testing.T) {
	srv := crdInferenceServer(t)
	handler := srv.Handler()
	admin := login(t, handler, "admin", "admin-pw")
	response := do(handler, "POST", "/api/router/apikeys", admin,
		`{"name":"ci","user":"bob","principalUID":"bob-uid","expiresAt":null}`)
	if response.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", response.Code, response.Body.String())
	}
	var key map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &key); err != nil {
		t.Fatal(err)
	}
	if key["user"] != "bob" || key["principalUID"] != "bob-uid" || key["creator"] != "admin" {
		t.Fatalf("owner and creator: %v", key)
	}
	credential, ok := key["key"].(string)
	if !ok || !strings.HasPrefix(credential, "sk-") || len(credential) != 39 || strings.Contains(credential, key["id"].(string)) {
		t.Fatalf("credential contract: %v", key)
	}
	deadline := time.Now().Add(3 * time.Second)
	for {
		response = do(handler, "POST", "/v1/chat/completions", credential, `{"model":"qwen"}`)
		if response.Code == http.StatusOK {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("verify: %d %s", response.Code, response.Body.String())
		}
		time.Sleep(time.Millisecond)
	}
	resources, err := srv.kube.Dynamic().Resource(router.APIKeysGVR).Namespace("console").List(t.Context(), metav1.ListOptions{})
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(resources)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(encoded), credential) {
		t.Fatal("CRD contains plaintext credential")
	}
}

func TestCRDKeyRejectsMissingAndForgedOwners(t *testing.T) {
	handler := crdInferenceServer(t).Handler()
	admin := login(t, handler, "admin", "admin-pw")
	for _, body := range []string{
		`{"name":"missing"}`,
		`{"name":"forged","user":"bob","principalUID":"admin-uid"}`,
		`{"name":"unknown","user":"unknown"}`,
	} {
		response := do(handler, "POST", "/api/router/apikeys", admin, body)
		if response.Code != http.StatusBadRequest {
			t.Errorf("%s: %d %s", body, response.Code, response.Body.String())
		}
	}
	bob := login(t, handler, "bob", "bob-pw")
	response := do(handler, "POST", "/api/router/apikeys", bob, `{"name":"stolen","user":"admin","principalUID":"admin-uid"}`)
	if response.Code != http.StatusForbidden {
		t.Fatalf("cross-user creation: %d", response.Code)
	}
}

func TestCRDKeyManualDisableAndModelScopeRemainIndependent(t *testing.T) {
	handler := crdInferenceServer(t).Handler()
	admin := login(t, handler, "admin", "admin-pw")
	key := createKey(t, handler, admin, `{"name":"scoped","user":"bob","models":["qwen"]}`)
	awaitKeyResponse(t, handler, key.Value, "qwen", http.StatusOK)
	awaitKeyResponse(t, handler, key.Value, "kimi", http.StatusForbidden)
	response := do(handler, "PUT", "/api/router/apikeys/"+key.ID+"/status", admin, `{"status":"disabled"}`)
	if response.Code != http.StatusNoContent {
		t.Fatalf("disable: %d %s", response.Code, response.Body.String())
	}
	awaitKeyResponse(t, handler, key.Value, "qwen", http.StatusForbidden)
	response = do(handler, "PUT", "/api/router/apikeys/"+key.ID+"/status", admin, `{"status":"enabled"}`)
	if response.Code != http.StatusNoContent {
		t.Fatalf("enable: %d", response.Code)
	}
	awaitKeyResponse(t, handler, key.Value, "qwen", http.StatusOK)
	awaitKeyResponse(t, handler, key.Value, "kimi", http.StatusForbidden)
}

func awaitKeyResponse(t *testing.T, handler http.Handler, credential, model string, status int) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for {
		response := do(handler, "POST", "/v1/chat/completions", credential, `{"model":"`+model+`"}`)
		if response.Code == status {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("key response: %d want %d: %s", response.Code, status, response.Body.String())
		}
		time.Sleep(time.Millisecond)
	}
}
