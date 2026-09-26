package server

import (
	"encoding/json"
	"net/http"
	"testing"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"

	"github.com/modelsphere/console/internal/config"
	"github.com/modelsphere/console/internal/iam"
)

// On a Rise Global cluster the IAM CRDs hold roles and bindings for every
// scope. The console manages the platform level only: that is all its pages
// list, and anything else must be out of its reach -- not readable, editable or
// deletable through it.

func globalObj(kind, name, scope, value string, spec map[string]any) *unstructured.Unstructured {
	return &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": iam.Group + "/" + iam.Version,
		"kind":       kind,
		"metadata": map[string]any{"name": name, "labels": map[string]any{
			iam.ScopeLabel: scope, iam.ScopeValueLabel: value, iam.ManagedLabel: "true",
		}},
		"spec": spec,
	}}
}

func globalRole(name, scope, value string) *unstructured.Unstructured {
	return globalObj("IAMRole", name, scope, value, map[string]any{
		"rules": []any{map[string]any{"apiGroups": []any{"*"}, "resources": []any{"*"}, "verbs": []any{"*"}}},
	})
}

func globalBinding(name, role, scope, value string) *unstructured.Unstructured {
	return globalObj("IAMRoleBinding", name, scope, value, map[string]any{
		"roleRef":  map[string]any{"apiGroup": iam.Group, "kind": "IAMRole", "name": role},
		"subjects": []any{map[string]any{"kind": "User", "name": "admin"}},
	})
}

func scopedServer(t *testing.T) (http.Handler, string) {
	t.Helper()
	objs := []runtime.Object{
		globalRole("platform-global-admin", iam.ScopePlatform, iam.ScopeGlobal),
		globalBinding("platform-global-admin-admin", "platform-global-admin", iam.ScopePlatform, iam.ScopeGlobal),
		globalRole("namespace-aaa-1-admin", "namespace", "aaa-1"),
		globalBinding("namespace-aaa-1-admin-admin", "namespace-aaa-1-admin", "namespace", "aaa-1"),
		globalRole("workspace-aaa-viewer", "workspace", "aaa"),
	}
	h := testServerWithConfig(t, &config.Config{}, objs...).Handler()
	return h, login(t, h, "admin", "admin-pw")
}

func names(t *testing.T, body []byte) []string {
	t.Helper()
	var out struct {
		Items []struct {
			Name string `json:"name"`
		} `json:"items"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		t.Fatal(err)
	}
	ns := make([]string, len(out.Items))
	for i, it := range out.Items {
		ns[i] = it.Name
	}
	return ns
}

func TestRolePagesListPlatformScopeOnly(t *testing.T) {
	h, admin := scopedServer(t)
	if got := names(t, do(h, "GET", "/api/iam/roles", admin, "").Body.Bytes()); len(got) != 1 || got[0] != "platform-global-admin" {
		t.Fatalf("roles = %v, want [platform-global-admin]", got)
	}
	if got := names(t, do(h, "GET", "/api/iam/rolebindings", admin, "").Body.Bytes()); len(got) != 1 || got[0] != "platform-global-admin-admin" {
		t.Fatalf("bindings = %v, want [platform-global-admin-admin]", got)
	}
}

func TestOtherScopesAreOutOfReach(t *testing.T) {
	h, admin := scopedServer(t)
	for _, c := range []struct{ method, path, body string }{
		{"GET", "/api/iam/roles/namespace-aaa-1-admin", ""},
		{"PUT", "/api/iam/roles/namespace-aaa-1-admin", `{"rules":[]}`},
		{"DELETE", "/api/iam/roles/namespace-aaa-1-admin", ""},
		{"DELETE", "/api/iam/rolebindings/namespace-aaa-1-admin-admin", ""},
	} {
		if rec := do(h, c.method, c.path, admin, c.body); rec.Code != http.StatusNotFound {
			t.Errorf("%s %s: expected 404, got %d %s", c.method, c.path, rec.Code, rec.Body.String())
		}
	}
}

func TestCannotBindAPlatformSubjectToAnotherScopesRole(t *testing.T) {
	h, admin := scopedServer(t)
	body := `{"name":"sneaky","role":"namespace-aaa-1-admin","subjects":[{"kind":"User","name":"bob"}]}`
	if rec := do(h, "POST", "/api/iam/rolebindings", admin, body); rec.Code != http.StatusBadRequest {
		t.Fatalf("binding to a namespace-scoped role: expected 400, got %d %s", rec.Code, rec.Body.String())
	}
	if got := names(t, do(h, "GET", "/api/iam/rolebindings", admin, "").Body.Bytes()); len(got) != 1 {
		t.Fatalf("a binding was created anyway: %v", got)
	}
}
