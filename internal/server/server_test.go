package server

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	dynamicfake "k8s.io/client-go/dynamic/fake"

	"github.com/modelsphere/console/internal/config"
	"github.com/modelsphere/console/internal/iam"
)

func testServer(t *testing.T) *Server {
	t.Helper()
	adminHash, _ := iam.HashPassword("admin-pw")
	bobHash, _ := iam.HashPassword("bob-pw")
	user := func(name, hash string, groups ...string) *unstructured.Unstructured {
		gs := make([]any, len(groups))
		for i, g := range groups {
			gs[i] = g
		}
		return &unstructured.Unstructured{Object: map[string]any{
			"apiVersion": iam.Group + "/" + iam.Version,
			"kind":       "User",
			"metadata":   map[string]any{"name": name},
			"spec":       map[string]any{"groups": gs, "encryptedPassword": hash},
		}}
	}
	dyn := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(runtime.NewScheme(),
		map[schema.GroupVersionResource]string{
			iam.UsersGVR:        "UserList",
			iam.RolesGVR:        "IAMRoleList",
			iam.RoleBindingsGVR: "IAMRoleBindingList",
		},
		user("admin", adminHash, "system:masters"),
		user("bob", bobHash),
	)
	store := iam.NewStore(dyn)
	signer := iam.NewSigner("https://issuer.test", "secret", time.Hour)
	log := slog.New(slog.DiscardHandler)
	srv := New(&config.Config{}, nil, log, "test")
	srv.SetIAM(store, signer, iam.NewAuthenticator(store, signer, log), iam.NewAuthorizer(store))
	return srv
}

func login(t *testing.T, h http.Handler, user, pw string) string {
	t.Helper()
	form := url.Values{"grant_type": {"password"}, "username": {user}, "password": {pw}}
	req := httptest.NewRequest("POST", "/oauth/token", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("login %s: status %d, body %s", user, rec.Code, rec.Body.String())
	}
	var tok iam.Token
	if err := json.Unmarshal(rec.Body.Bytes(), &tok); err != nil {
		t.Fatal(err)
	}
	return tok.AccessToken
}

func do(h http.Handler, method, path, token, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestHealthz(t *testing.T) {
	h := testServer(t).Handler()
	if rec := do(h, "GET", "/healthz", "", ""); rec.Code != http.StatusOK {
		t.Fatalf("healthz: %d", rec.Code)
	}
}

func TestLoginAndMe(t *testing.T) {
	h := testServer(t).Handler()
	token := login(t, h, "admin", "admin-pw")

	rec := do(h, "GET", "/api/me", token, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("me: %d", rec.Code)
	}
	var me map[string]any
	json.Unmarshal(rec.Body.Bytes(), &me)
	if me["name"] != "admin" || me["isAdmin"] != true {
		t.Fatalf("bad me: %v", me)
	}
}

func TestWrongPassword(t *testing.T) {
	h := testServer(t).Handler()
	form := url.Values{"grant_type": {"password"}, "username": {"admin"}, "password": {"nope"}}
	req := httptest.NewRequest("POST", "/oauth/token", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("wrong password: expected 401, got %d (body %s)", rec.Code, rec.Body.String())
	}
}

func TestGuardsAPI(t *testing.T) {
	h := testServer(t).Handler()
	if rec := do(h, "GET", "/api/iam/users", "", ""); rec.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated list: expected 401, got %d", rec.Code)
	}
	token := login(t, h, "admin", "admin-pw")
	if rec := do(h, "GET", "/api/iam/users", token, ""); rec.Code != http.StatusOK {
		t.Fatalf("authenticated list: %d", rec.Code)
	}
}

func TestRBACGrantsViaRole(t *testing.T) {
	h := testServer(t).Handler()
	admin := login(t, h, "admin", "admin-pw")
	bob := login(t, h, "bob", "bob-pw")

	// Before any grant, bob cannot list users.
	if rec := do(h, "GET", "/api/iam/users", bob, ""); rec.Code != http.StatusForbidden {
		t.Fatalf("bob list before grant: expected 403, got %d", rec.Code)
	}

	// Admin creates a read-only role over users and binds bob to it.
	role := `{"name":"user-viewer","rules":[{"verbs":["list","get"],"apiGroups":["iam.theriseunion.io"],"resources":["users"]}]}`
	if rec := do(h, "POST", "/api/iam/roles", admin, role); rec.Code != http.StatusCreated {
		t.Fatalf("create role: %d, %s", rec.Code, rec.Body.String())
	}
	binding := `{"name":"bob-viewer","role":"user-viewer","subjects":[{"kind":"User","name":"bob"}]}`
	if rec := do(h, "POST", "/api/iam/rolebindings", admin, binding); rec.Code != http.StatusCreated {
		t.Fatalf("create binding: %d, %s", rec.Code, rec.Body.String())
	}

	// Now bob can list users, but still cannot create them (no create verb).
	if rec := do(h, "GET", "/api/iam/users", bob, ""); rec.Code != http.StatusOK {
		t.Fatalf("bob list after grant: expected 200, got %d", rec.Code)
	}
	body := `{"name":"eve","password":"x"}`
	if rec := do(h, "POST", "/api/iam/users", bob, body); rec.Code != http.StatusForbidden {
		t.Fatalf("bob create after grant: expected 403, got %d", rec.Code)
	}
}

func TestUserCRUDRequiresAdmin(t *testing.T) {
	h := testServer(t).Handler()
	body := `{"name":"carol","password":"carol-pw","displayName":"Carol"}`

	// A non-admin (bob) is forbidden from creating users.
	bob := login(t, h, "bob", "bob-pw")
	if rec := do(h, "POST", "/api/iam/users", bob, body); rec.Code != http.StatusForbidden {
		t.Fatalf("bob create: expected 403, got %d", rec.Code)
	}

	// Admin can, and the password hash never comes back.
	admin := login(t, h, "admin", "admin-pw")
	rec := do(h, "POST", "/api/iam/users", admin, body)
	if rec.Code != http.StatusCreated {
		t.Fatalf("admin create: %d, body %s", rec.Code, rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), "assword") || strings.Contains(rec.Body.String(), "$2") {
		t.Fatalf("response leaked password material: %s", rec.Body.String())
	}
	// New user can log in with the password admin set.
	_ = login(t, h, "carol", "carol-pw")
}
