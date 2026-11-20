package inferenceauth

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/modelsphere/console/internal/config"
	"github.com/modelsphere/console/internal/iam"
	"github.com/modelsphere/console/internal/router"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
)

type testDirectory struct {
	key            router.Key
	user           *iam.User
	keyError       error
	userError      error
	admissionError error
}

func (directory *testDirectory) Verify(_ context.Context, credential string) (router.Key, error) {
	if directory.keyError != nil {
		return router.Key{}, directory.keyError
	}
	if credential != "test-api-key" {
		return router.Key{}, router.ErrInvalid
	}
	return directory.key, directory.admissionError
}

func (directory *testDirectory) SessionUser(context.Context, string) (*iam.User, error) {
	return directory.user, directory.userError
}

func (directory *testDirectory) Admit(string) error                     { return directory.admissionError }
func (directory *testDirectory) WalletAdmission(string) (string, int64) { return "allowed", 7 }

type testAuthorizer struct {
	allowed bool
	err     error
	last    iam.Attributes
}

func (authorizer *testAuthorizer) Authorize(_ context.Context, _ *iam.Identity, attributes iam.Attributes) (bool, error) {
	authorizer.last = attributes
	return authorizer.allowed, authorizer.err
}

func testConfig() *config.Config {
	return &config.Config{
		Server:  config.Server{Auth: config.Auth{JWTSecret: "test-signing-secret"}},
		Router:  config.Router{KeySource: "crd", Namespace: "test", Backend: "llm"},
		Higress: config.Higress{Enabled: true, Models: []string{"model-one", "model-two"}, Route: "model-route", SessionOrigin: "https://console.test"},
	}
}

func newTestHandler(t *testing.T) (*Handler, *testDirectory, *testAuthorizer, string) {
	t.Helper()
	user := &iam.User{ObjectMeta: metav1.ObjectMeta{Name: "alice", UID: types.UID("alice-uid")}}
	directory := &testDirectory{user: user, key: router.Key{ID: "key-id", User: user.Name, PrincipalUID: "alice-uid"}}
	authorizer := &testAuthorizer{allowed: true}
	signer := iam.NewSigner("test", "test-signing-secret", time.Hour)
	token, err := signer.Mint(user)
	if err != nil {
		t.Fatal(err)
	}
	handler, err := New(directory, signer, authorizer, testConfig(), slog.New(slog.DiscardHandler))
	if err != nil {
		t.Fatal(err)
	}
	return handler, directory, authorizer, token.AccessToken
}

func authorizeRequest(handler http.Handler, path, credential, body string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	if credential != "" {
		request.Header.Set("Authorization", "Bearer "+credential)
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}

func TestSDKAuthorizationAndTrustedIdentity(t *testing.T) {
	handler, _, _, _ := newTestHandler(t)
	request := httptest.NewRequest(http.MethodPost, "/authorize/v1/chat/completions", strings.NewReader(`{"model":"model-one","messages":[]}`))
	request.Header.Set("Authorization", "Bearer test-api-key")
	request.Header.Set("Content-Type", "application/json")
	for _, header := range []string{"X-Console-Principal-Uid", "X-Console-Source", "X-Console-Api-Key-Id", "X-Console-Model", "X-Console-Request-Id", "X-Remote-User"} {
		request.Header.Set(header, "forged")
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK || response.Body.Len() != 0 {
		t.Fatalf("authorization: %d %s", response.Code, response.Body.String())
	}
	for header, expected := range map[string]string{"X-Console-Principal-Uid": "alice-uid", "X-Console-User": "alice", "X-Console-Source": "sdk", "X-Console-Api-Key-Id": "key-id", "X-Console-Model": "model-one", "X-Console-Wallet-Revision": "7"} {
		if response.Header().Get(header) != expected {
			t.Fatalf("%s = %q", header, response.Header().Get(header))
		}
	}
	if id := response.Header().Get("X-Console-Request-Id"); id == "" || id == "forged" {
		t.Fatal("client request identity was trusted")
	}
	if response.Header().Get("Authorization") != "" || response.Header().Get("X-Remote-User") != "" {
		t.Fatal("untrusted or sensitive headers in authorization response")
	}
}

func TestCredentialFailureStatus(t *testing.T) {
	for _, test := range []struct {
		name   string
		err    error
		status int
	}{
		{"invalid", router.ErrInvalid, 401}, {"expired", router.ErrExpired, 401},
		{"disabled", router.ErrDisabled, 403}, {"wallet", router.ErrBillingBlocked, 402},
		{"dependency", router.ErrUnavailable, 503},
	} {
		t.Run(test.name, func(t *testing.T) {
			handler, directory, _, _ := newTestHandler(t)
			directory.keyError = test.err
			response := authorizeRequest(handler, "/authorize/v1/chat/completions", "test-api-key", `{"model":"model-one"}`)
			if response.Code != test.status || !json.Valid(response.Body.Bytes()) {
				t.Fatalf("status=%d, body=%s", response.Code, response.Body.String())
			}
			if response.Header().Get("X-Console-Principal-Uid") != "" {
				t.Fatal("rejected request has trusted identity")
			}
		})
	}
}

func TestChatRequestValidation(t *testing.T) {
	for _, test := range []struct {
		name, body string
		status     int
	}{
		{"valid", `{"model":"model-one"}`, 200},
		{"unknown", `{"model":"other"}`, 404},
		{"missing", `{"messages":[]}`, 400},
		{"duplicate", `{"model":"model-one","model":"model-two"}`, 400},
		{"escaped-duplicate", `{"model":"model-one","mo\u0064el":"model-two"}`, 400},
		{"mixed-case", `{"model":"model-one","Model":"model-two"}`, 400},
		{"trailing", `{"model":"model-one"} {}`, 400},
		{"array", `[{"model":"model-one"}]`, 400},
		{"bad-type", `{"model":3}`, 400},
		{"malformed", `{"model":"model-one"`, 400},
	} {
		t.Run(test.name, func(t *testing.T) {
			handler, _, _, _ := newTestHandler(t)
			response := authorizeRequest(handler, "/authorize/v1/chat/completions", "test-api-key", test.body)
			if response.Code != test.status {
				t.Fatalf("status=%d, body=%s", response.Code, response.Body.String())
			}
		})
	}
}

func TestModelRestrictionAndBodyLimit(t *testing.T) {
	handler, directory, _, _ := newTestHandler(t)
	directory.key.Models = []string{"model-two"}
	if response := authorizeRequest(handler, "/authorize/v1/chat/completions", "test-api-key", `{"model":"model-one"}`); response.Code != 403 {
		t.Fatalf("model permission bypass: %d", response.Code)
	}
	handler.maxBody = 8
	if response := authorizeRequest(handler, "/authorize/v1/chat/completions", "test-api-key", `{"model":"model-two"}`); response.Code != 413 {
		t.Fatalf("body limit bypass: %d", response.Code)
	}
}

func TestUnsupportedEndpointsAndCredentialSeparation(t *testing.T) {
	handler, _, _, session := newTestHandler(t)
	for _, path := range []string{"/authorize/v1/files", "/authorize/v1/embeddings", "/authorizeevil/v1/chat/completions", "/v1/chat/completions"} {
		if response := authorizeRequest(handler, path, "test-api-key", `{"model":"model-one"}`); response.Code != 404 {
			t.Fatalf("unexpected endpoint served: %s: %d", path, response.Code)
		}
	}
	if response := authorizeRequest(handler, "/authorize/v1/chat/completions", session, `{"model":"model-one"}`); response.Code != 401 {
		t.Fatal("SDK accepted a session")
	}
	if response := authorizeRequest(handler, "/authorize/api/llm/v1/chat/completions", "test-api-key", `{"model":"model-one"}`); response.Code != 401 {
		t.Fatal("session entrypoint accepted an API key")
	}
}
