package server

import (
	"context"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/modelsphere/console/internal/config"
	"github.com/modelsphere/console/internal/inferenceauth"
	"github.com/modelsphere/console/internal/router"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/runtime"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	k8stesting "k8s.io/client-go/testing"
)

func higressAuthFixture(t *testing.T) (*Server, *router.CRDStore, http.Handler, string) {
	t.Helper()
	server := crdInferenceServer(t)
	server.cfg.Higress = config.Higress{Enabled: true, Models: []string{"qwen"}, Route: "qwen", SessionOrigin: "https://console.test"}
	directory, err := router.NewCRDStore(t.Context(), server.kube.Dynamic(), "console", slog.New(slog.DiscardHandler))
	if err != nil {
		t.Fatal(err)
	}
	server.cfg.Server.Auth.JWTSecret = "test-signing-key"
	auth, err := inferenceauth.New(directory, server.signer, directory.Authorizer(), server.cfg, slog.New(slog.DiscardHandler))
	if err != nil {
		t.Fatal(err)
	}
	_, credential, err := directory.Create(t.Context(), router.Input{Name: "higress", User: "bob", PrincipalUID: "bob-uid", Models: []string{"qwen"}})
	if err != nil {
		t.Fatal(err)
	}
	waitHigressAuth(t, auth, credential, http.StatusOK)
	return server, directory, auth, credential
}

func higressAuthorization(handler http.Handler, path, credential string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(http.MethodPost, path, strings.NewReader(`{"model":"qwen","messages":[]}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+credential)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}

func waitHigressAuth(t *testing.T, handler http.Handler, credential string, status int) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for {
		response := higressAuthorization(handler, "/authorize/v1/chat/completions", credential)
		if response.Code == status {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("authorization did not converge to %d: %d %s", status, response.Code, response.Body.String())
		}
		time.Sleep(time.Millisecond)
	}
}

func TestHigressAuthUsesCRDDigestsAndObservesDisable(t *testing.T) {
	_, directory, auth, credential := higressAuthFixture(t)
	response := higressAuthorization(auth, "/authorize/v1/chat/completions", credential)
	if response.Code != http.StatusOK || response.Header().Get("X-Console-Principal-Uid") != "bob-uid" {
		t.Fatalf("canonical owner missing: %d %s", response.Code, response.Body.String())
	}
	key, err := directory.Verify(t.Context(), credential)
	if err != nil {
		t.Fatal(err)
	}
	if err := directory.SetDisabled(t.Context(), key.ID, true); err != nil {
		t.Fatal(err)
	}
	waitHigressAuth(t, auth, credential, http.StatusForbidden)
}

func TestHigressAuthDoesNotReadAPIServerPerRequest(t *testing.T) {
	server, _, auth, credential := higressAuthFixture(t)
	session := login(t, server.Handler(), "admin", "admin-pw")
	client := server.kube.Dynamic().(*dynamicfake.FakeDynamicClient)
	client.PrependReactor("*", "*", func(k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, apierrors.NewServiceUnavailable("injected API Server outage")
	})
	for path, token := range map[string]string{"/authorize/v1/chat/completions": credential, "/authorize/api/llm/v1/chat/completions": session} {
		response := higressAuthorization(auth, path, token)
		if response.Code != http.StatusOK {
			t.Fatalf("hot-path API dependency at %s: %d %s", path, response.Code, response.Body.String())
		}
	}
}

func TestHigressAuthUsesWalletAdmissionWithoutFinancialWrites(t *testing.T) {
	_, directory, auth, credential := higressAuthFixture(t)
	directory.EnforceBilling(true)
	waitHigressAuth(t, auth, credential, http.StatusPaymentRequired)
	if _, err := directory.Verify(context.Background(), credential); err != router.ErrBillingBlocked {
		t.Fatalf("unknown wallet must fail closed: %v", err)
	}
}
