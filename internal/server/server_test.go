package server

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	k8stesting "k8s.io/client-go/testing"

	"github.com/modelsphere/console/internal/cluster"
	"github.com/modelsphere/console/internal/config"
	"github.com/modelsphere/console/internal/iam"
)

func testServer(t *testing.T) *Server {
	t.Helper()
	return testServerWithConfig(t, &config.Config{})
}

func testServerWithConfig(t *testing.T, cfg *config.Config, objs ...runtime.Object) *Server {
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
	admin := user("admin", adminHash, "system:masters")
	dyn := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(runtime.NewScheme(),
		map[schema.GroupVersionResource]string{
			iam.UsersGVR:        "UserList",
			iam.RolesGVR:        "IAMRoleList",
			iam.RoleBindingsGVR: "IAMRoleBindingList",
			iam.LoginRecordsGVR: "LoginRecordList",
		},
		append([]runtime.Object{admin, user("bob", bobHash)}, objs...)...,
	)
	nextRecord := 0
	dyn.PrependReactor("create", "loginrecords", func(action k8stesting.Action) (bool, runtime.Object, error) {
		create, ok := action.(k8stesting.CreateAction)
		if !ok {
			return false, nil, nil
		}
		obj := create.GetObject().(*unstructured.Unstructured).DeepCopy()
		nextRecord++
		if obj.GetName() == "" {
			obj.SetName(fmt.Sprintf("%s%d", obj.GetGenerateName(), nextRecord))
		}
		obj.SetCreationTimestamp(metav1.NewTime(time.Date(2026, 9, 24, 0, 0, nextRecord, 0, time.UTC)))
		if err := dyn.Tracker().Create(iam.LoginRecordsGVR, obj, ""); err != nil {
			return true, nil, err
		}
		return true, obj, nil
	})
	store := iam.NewStore(dyn)
	signer := iam.NewSigner("https://issuer.test", "secret", time.Hour)
	log := slog.New(slog.DiscardHandler)
	srv := New(cfg, cluster.NewKubeFrom(dyn), log, "test")
	srv.SetIAM(store, signer, iam.NewAuthenticator(store, signer, log), iam.NewAuthorizer(store))
	return srv
}

func setRequirePasswordReset(t *testing.T, srv *Server, required bool) {
	t.Helper()
	u, err := srv.store.GetUser(t.Context(), "admin")
	if err != nil {
		t.Fatal(err)
	}
	if u.Annotations == nil {
		u.Annotations = map[string]string{}
	}
	if required {
		u.Annotations[iam.RequirePasswordResetAnnotation] = "true"
	} else {
		delete(u.Annotations, iam.RequirePasswordResetAnnotation)
	}
	if _, err := srv.store.UpdateUser(t.Context(), u); err != nil {
		t.Fatal(err)
	}
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
	srv := testServer(t)
	setRequirePasswordReset(t, srv, true)
	h := srv.Handler()
	token := login(t, h, "admin", "admin-pw")

	rec := do(h, "GET", "/api/me", token, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("me: %d", rec.Code)
	}
	var me struct {
		Name                 string   `json:"name"`
		IsAdmin              bool     `json:"isAdmin"`
		Permissions          []string `json:"permissions"`
		RequirePasswordReset bool     `json:"requirePasswordReset"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &me); err != nil {
		t.Fatal(err)
	}
	if me.Name != "admin" || !me.IsAdmin || len(me.Permissions) != 1 || me.Permissions[0] != "*" || !me.RequirePasswordReset {
		t.Fatalf("bad me: %v", me)
	}
}

func TestChangeOwnPassword(t *testing.T) {
	srv := testServer(t)
	setRequirePasswordReset(t, srv, true)
	h := srv.Handler()
	token := login(t, h, "admin", "admin-pw")

	if rec := do(h, "POST", "/api/me/password", token, `{"oldPassword":"","newPassword":"NewPass1!"}`); rec.Code != http.StatusBadRequest {
		t.Fatalf("empty old password: expected 400, got %d (body %s)", rec.Code, rec.Body.String())
	}
	if rec := do(h, "POST", "/api/me/password", token, `{"oldPassword":"admin-pw","newPassword":""}`); rec.Code != http.StatusBadRequest {
		t.Fatalf("empty new password: expected 400, got %d (body %s)", rec.Code, rec.Body.String())
	}
	if rec := do(h, "POST", "/api/me/password", token, `{"oldPassword":"wrong","newPassword":"NewPass1!"}`); rec.Code != http.StatusUnauthorized {
		t.Fatalf("wrong old password: expected 401, got %d (body %s)", rec.Code, rec.Body.String())
	}
	if rec := do(h, "POST", "/api/me/password", token, `{"oldPassword":"admin-pw","newPassword":"weak"}`); rec.Code != http.StatusBadRequest {
		t.Fatalf("weak new password: expected 400, got %d (body %s)", rec.Code, rec.Body.String())
	}
	if rec := do(h, "POST", "/api/me/password", token, `{"oldPassword":"admin-pw","newPassword":"NewPass1!"}`); rec.Code != http.StatusOK {
		t.Fatalf("change password: expected 200, got %d (body %s)", rec.Code, rec.Body.String())
	}

	u, err := srv.store.GetUser(t.Context(), "admin")
	if err != nil {
		t.Fatal(err)
	}
	if !iam.VerifyPassword("NewPass1!", u.Spec.EncryptedPassword) {
		t.Fatal("new password was not stored")
	}
	if u.RequiresPasswordReset() || u.Annotations[iam.RequirePasswordResetAnnotation] != "" {
		t.Fatalf("require-password-reset annotation was not cleared: %v", u.Annotations)
	}
	if rec := do(h, "GET", "/api/iam/users", token, ""); rec.Code != http.StatusOK {
		t.Fatalf("same token after password change: expected 200, got %d (body %s)", rec.Code, rec.Body.String())
	}
	_ = login(t, h, "admin", "NewPass1!")
}

// Keeping the current password is allowed -- the UI warns, it does not refuse --
// and still completes a required reset.
func TestChangeOwnPasswordToTheSamePassword(t *testing.T) {
	srv := testServer(t)
	h := srv.Handler()
	token := login(t, h, "admin", "admin-pw")
	if rec := do(h, "POST", "/api/me/password", token, `{"oldPassword":"admin-pw","newPassword":"Same-Pass1"}`); rec.Code != http.StatusOK {
		t.Fatalf("set a complex password: expected 200, got %d (body %s)", rec.Code, rec.Body.String())
	}
	setRequirePasswordReset(t, srv, true)

	if rec := do(h, "POST", "/api/me/password", token, `{"oldPassword":"Same-Pass1","newPassword":"Same-Pass1"}`); rec.Code != http.StatusOK {
		t.Fatalf("same password: expected 200, got %d (body %s)", rec.Code, rec.Body.String())
	}
	u, err := srv.store.GetUser(t.Context(), "admin")
	if err != nil {
		t.Fatal(err)
	}
	if !iam.VerifyPassword("Same-Pass1", u.Spec.EncryptedPassword) {
		t.Fatal("password no longer verifies")
	}
	if u.RequiresPasswordReset() {
		t.Fatal("require-password-reset annotation was not cleared")
	}
}

func TestMePermissionsFromBoundRoles(t *testing.T) {
	h := testServer(t).Handler()
	admin := login(t, h, "admin", "admin-pw")
	bob := login(t, h, "bob", "bob-pw")

	roles := []string{
		`{"name":"user-viewer","rules":[],"uiPermissions":["users.view","shared.view"]}`,
		`{"name":"role-viewer","rules":[],"uiPermissions":["roles.view","shared.view"]}`,
	}
	for _, role := range roles {
		if rec := do(h, "POST", "/api/iam/roles", admin, role); rec.Code != http.StatusCreated {
			t.Fatalf("create role: %d, %s", rec.Code, rec.Body.String())
		}
	}
	bindings := []string{
		`{"name":"bob-users","role":"user-viewer","subjects":[{"kind":"User","name":"bob"}]}`,
		`{"name":"bob-roles","role":"role-viewer","subjects":[{"kind":"User","name":"bob"}]}`,
	}
	for _, binding := range bindings {
		if rec := do(h, "POST", "/api/iam/rolebindings", admin, binding); rec.Code != http.StatusCreated {
			t.Fatalf("create binding: %d, %s", rec.Code, rec.Body.String())
		}
	}

	rec := do(h, "GET", "/api/me", bob, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("me: %d, %s", rec.Code, rec.Body.String())
	}
	var me struct {
		Permissions []string `json:"permissions"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &me); err != nil {
		t.Fatal(err)
	}
	want := []string{"roles.view", "shared.view", "users.view"}
	if len(me.Permissions) != len(want) {
		t.Fatalf("permissions = %v, want %v", me.Permissions, want)
	}
	for i := range want {
		if me.Permissions[i] != want[i] {
			t.Fatalf("permissions = %v, want %v", me.Permissions, want)
		}
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

func TestTokenAttemptsCreateLoginRecords(t *testing.T) {
	srv := testServer(t)
	h := srv.Handler()
	attempt := func(username, password, forwarded, realIP, remoteAddr, userAgent string) int {
		form := url.Values{"grant_type": {"password"}, "username": {username}, "password": {password}}
		req := httptest.NewRequest("POST", "/oauth/token", strings.NewReader(form.Encode()))
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		req.Header.Set("X-Forwarded-For", forwarded)
		req.Header.Set("X-Real-IP", realIP)
		req.Header.Set("User-Agent", userAgent)
		req.RemoteAddr = remoteAddr
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec.Code
	}

	if code := attempt("admin", "wrong", "203.0.113.10, 10.0.0.1", "203.0.113.20", "203.0.113.30:1234", "audit-test/1"); code != http.StatusUnauthorized {
		t.Fatalf("wrong password: got %d", code)
	}
	if code := attempt("missing", "secret", "", "203.0.113.20", "203.0.113.30:1234", "audit-test/2"); code != http.StatusUnauthorized {
		t.Fatalf("missing user: got %d", code)
	}
	if code := attempt("admin", "admin-pw", "", "", "203.0.113.30:1234", "audit-test/3"); code != http.StatusOK {
		t.Fatalf("successful login: got %d", code)
	}

	records, err := srv.store.ListLoginRecords(t.Context(), "")
	if err != nil {
		t.Fatal(err)
	}
	if len(records) != 3 {
		t.Fatalf("records: got %d, want 3", len(records))
	}
	if !records[0].Spec.Success || records[0].Labels[iam.UsernameLabel] != "admin" || records[0].Spec.SourceIP != "203.0.113.30" {
		t.Fatalf("latest record: %#v", records[0])
	}
	if records[1].Spec.Reason != "user not found" || records[1].Spec.SourceIP != "203.0.113.20" {
		t.Fatalf("missing-user record: %#v", records[1])
	}
	if records[2].Spec.Reason != "invalid password" || records[2].Spec.SourceIP != "203.0.113.10" || records[2].Spec.UserAgent != "audit-test/1" {
		t.Fatalf("wrong-password record: %#v", records[2])
	}
	for _, record := range records {
		if record.GenerateName != "loginrecord-" || record.Spec.Type != "password" || record.Spec.Provider != "local" {
			t.Fatalf("record metadata: %#v", record)
		}
	}
}

func TestListLoginRecordsRequiresAuthorizationAndFiltersUser(t *testing.T) {
	srv := testServer(t)
	h := srv.Handler()
	admin := login(t, h, "admin", "admin-pw")

	form := url.Values{"grant_type": {"password"}, "username": {"missing"}, "password": {"secret"}}
	req := httptest.NewRequest("POST", "/oauth/token", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("missing user login: got %d", rec.Code)
	}

	rec = do(h, "GET", "/api/iam/loginrecords?user=missing", admin, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("list login records: %d, %s", rec.Code, rec.Body.String())
	}
	var response struct {
		Items []loginRecordView `json:"items"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if len(response.Items) != 1 || response.Items[0].User != "missing" || response.Items[0].Success || response.Items[0].Reason != "user not found" {
		t.Fatalf("filtered response: %#v", response.Items)
	}
	if body := rec.Body.String(); strings.Contains(body, "metadata") || strings.Contains(body, "spec") || strings.Contains(body, "encryptedPassword") {
		t.Fatalf("response leaked internal fields: %s", body)
	}

	bob := login(t, h, "bob", "bob-pw")
	if rec := do(h, "GET", "/api/iam/loginrecords", bob, ""); rec.Code != http.StatusForbidden {
		t.Fatalf("unauthorized list: expected 403, got %d", rec.Code)
	}
}

func TestRequestSourceIP(t *testing.T) {
	tests := []struct {
		name       string
		forwarded  string
		realIP     string
		remoteAddr string
		want       string
	}{
		{name: "forwarded", forwarded: "203.0.113.1, 10.0.0.2", realIP: "203.0.113.2", remoteAddr: "203.0.113.3:1234", want: "203.0.113.1"},
		{name: "real ip", realIP: "203.0.113.2", remoteAddr: "203.0.113.3:1234", want: "203.0.113.2"},
		{name: "remote address", remoteAddr: "203.0.113.3:1234", want: "203.0.113.3"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("POST", "/oauth/token", nil)
			req.Header.Set("X-Forwarded-For", tt.forwarded)
			req.Header.Set("X-Real-IP", tt.realIP)
			req.RemoteAddr = tt.remoteAddr
			if got := requestSourceIP(req); got != tt.want {
				t.Fatalf("got %q, want %q", got, tt.want)
			}
		})
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

func TestPasswordResetGuardUsesLiveUserState(t *testing.T) {
	srv := testServer(t)
	h := srv.Handler()
	token := login(t, h, "admin", "admin-pw")
	setRequirePasswordReset(t, srv, true)

	rec := do(h, "GET", "/api/iam/users", token, "")
	if rec.Code != http.StatusForbidden || !strings.Contains(rec.Body.String(), "请先修改初始密码") {
		t.Fatalf("reset-required list: expected explicit 403, got %d (body %s)", rec.Code, rec.Body.String())
	}

	setRequirePasswordReset(t, srv, false)
	if rec := do(h, "GET", "/api/iam/users", token, ""); rec.Code != http.StatusOK {
		t.Fatalf("same token after reset cleared: expected 200, got %d (body %s)", rec.Code, rec.Body.String())
	}
}

func TestDeletedTokenUserIsUnauthenticated(t *testing.T) {
	srv := testServer(t)
	h := srv.Handler()
	token := login(t, h, "admin", "admin-pw")
	if err := srv.store.DeleteUser(t.Context(), "admin"); err != nil {
		t.Fatal(err)
	}

	for _, request := range []struct {
		method string
		path   string
		body   string
	}{
		{method: "GET", path: "/api/me"},
		{method: "POST", path: "/api/me/password", body: `{"oldPassword":"admin-pw","newPassword":"NewPass1!"}`},
		{method: "GET", path: "/api/iam/users"},
	} {
		rec := do(h, request.method, request.path, token, request.body)
		if rec.Code != http.StatusUnauthorized || rec.Body.String() != "{\n  \"error\": \"unauthenticated\"\n}\n" {
			t.Fatalf("%s %s: expected fixed 401, got %d (body %s)", request.method, request.path, rec.Code, rec.Body.String())
		}
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
	body := `{"name":"carol","password":"Carol1!x","displayName":"Carol"}`

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
	_ = login(t, h, "carol", "Carol1!x")
}
