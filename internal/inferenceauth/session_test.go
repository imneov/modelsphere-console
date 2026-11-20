package inferenceauth

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/modelsphere/console/internal/iam"
	"github.com/modelsphere/console/internal/router"
	"k8s.io/apimachinery/pkg/types"
)

func TestSessionUsesCanonicalUserAndNoAPIKey(t *testing.T) {
	handler, _, authorizer, session := newTestHandler(t)
	response := authorizeRequest(handler, "/authorize/api/llm/v1/chat/completions", session, `{"model":"model-one"}`)
	if response.Code != 200 || response.Header().Get("X-Console-Principal-Uid") != "alice-uid" || response.Header().Get("X-Console-Source") != "session" {
		t.Fatalf("session authorization: %d %s", response.Code, response.Body.String())
	}
	if values, present := response.Header()["X-Console-Api-Key-Id"]; !present || len(values) != 1 || values[0] != "" {
		t.Fatal("session must overwrite a forged API Key ID with an empty value")
	}
	if authorizer.last.Verb != "create" || authorizer.last.Resource != "backends" || authorizer.last.Name != "llm" || authorizer.last.APIGroup != iam.Group {
		t.Fatalf("wrong RBAC check: %+v", authorizer.last)
	}
}

func TestSessionStateAndPermissionFailures(t *testing.T) {
	for _, test := range []struct {
		name   string
		mutate func(*testDirectory, *testAuthorizer)
		status int
	}{
		{"recreated-user", func(directory *testDirectory, _ *testAuthorizer) { directory.user.UID = types.UID("replacement") }, 401},
		{"inactive", func(directory *testDirectory, _ *testAuthorizer) { directory.user.Status.State = "Disabled" }, 401},
		{"initial-password", func(directory *testDirectory, _ *testAuthorizer) {
			directory.user.Annotations = map[string]string{iam.RequirePasswordResetAnnotation: "true"}
		}, 403},
		{"rbac-denied", func(_ *testDirectory, authorizer *testAuthorizer) { authorizer.allowed = false }, 403},
		{"rbac-error", func(_ *testDirectory, authorizer *testAuthorizer) { authorizer.err = errors.New("unavailable") }, 503},
		{"wallet", func(directory *testDirectory, _ *testAuthorizer) { directory.admissionError = router.ErrBillingBlocked }, 402},
		{"user-cache", func(directory *testDirectory, _ *testAuthorizer) { directory.userError = router.ErrUnavailable }, 503},
	} {
		t.Run(test.name, func(t *testing.T) {
			handler, directory, authorizer, session := newTestHandler(t)
			test.mutate(directory, authorizer)
			response := authorizeRequest(handler, "/authorize/api/llm/v1/chat/completions", session, `{"model":"model-one"}`)
			if response.Code != test.status {
				t.Fatalf("status=%d, body=%s", response.Code, response.Body.String())
			}
		})
	}
}

func TestSessionCookieCSRF(t *testing.T) {
	for _, test := range []struct {
		origin string
		status int
	}{
		{"https://console.test", 200}, {"https://attacker.test", 403}, {"", 403},
	} {
		t.Run(test.origin, func(t *testing.T) {
			handler, _, _, session := newTestHandler(t)
			request := httptest.NewRequest(http.MethodPost, "/authorize/api/llm/v1/chat/completions", strings.NewReader(`{"model":"model-one"}`))
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set("Origin", test.origin)
			request.AddCookie(&http.Cookie{Name: "token", Value: session})
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != test.status {
				t.Fatalf("status=%d, body=%s", response.Code, response.Body.String())
			}
		})
	}
}

func TestBearerCrossOriginAndAmbiguousCredentialsRejected(t *testing.T) {
	handler, _, _, session := newTestHandler(t)
	request := httptest.NewRequest(http.MethodPost, "/authorize/api/llm/v1/chat/completions", strings.NewReader(`{"model":"model-one"}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+session)
	request.Header.Set("Origin", "https://attacker.test")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != 403 {
		t.Fatalf("cross-origin session accepted: %d", response.Code)
	}
	request.Header.Del("Origin")
	request.Header.Add("Authorization", "Bearer test-api-key")
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != 401 {
		t.Fatalf("ambiguous credentials accepted: %d", response.Code)
	}
}

func TestCatalogFiltersKeyModelsAndPreservesPlaygroundShape(t *testing.T) {
	handler, directory, authorizer, session := newTestHandler(t)
	directory.key.Models = []string{"model-two"}
	request := httptest.NewRequest(http.MethodGet, "/v1/models", nil)
	request.Header.Set("Authorization", "Bearer test-api-key")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != 200 || strings.Contains(response.Body.String(), "model-one") || !strings.Contains(response.Body.String(), "model-two") {
		t.Fatalf("key model list: %d %s", response.Code, response.Body.String())
	}
	request = httptest.NewRequest(http.MethodGet, "/api/llm/routes", nil)
	request.Header.Set("Authorization", "Bearer "+session)
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != 200 || !strings.Contains(response.Body.String(), `"route":"model-route"`) || authorizer.last.Verb != "get" {
		t.Fatalf("Playground route list: %d %s", response.Code, response.Body.String())
	}
}
