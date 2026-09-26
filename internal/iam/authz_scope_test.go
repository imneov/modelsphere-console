package iam

import (
	"context"
	"testing"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	dynamicfake "k8s.io/client-go/dynamic/fake"
)

// These fixtures mirror what a Rise Global member cluster holds (seen on
// rg-member): roles and bindings for every scope level side by side, told apart
// only by the iam.theriseunion.io/scope and scope-value labels.

func role(name string, labels map[string]string, ui ...string) *unstructured.Unstructured {
	uis := make([]any, len(ui))
	for i, p := range ui {
		uis[i] = p
	}
	return &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": Group + "/" + Version,
		"kind":       "IAMRole",
		"metadata":   map[string]any{"name": name, "labels": toAny(labels)},
		"spec": map[string]any{
			"rules":         []any{map[string]any{"apiGroups": []any{"*"}, "resources": []any{"*"}, "verbs": []any{"*"}}},
			"uiPermissions": uis,
		},
	}}
}

func binding(name, roleName, user string, labels map[string]string) *unstructured.Unstructured {
	return &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": Group + "/" + Version,
		"kind":       "IAMRoleBinding",
		"metadata":   map[string]any{"name": name, "labels": toAny(labels)},
		"spec": map[string]any{
			"roleRef":  map[string]any{"apiGroup": Group, "kind": "IAMRole", "name": roleName},
			"subjects": []any{map[string]any{"kind": "User", "name": user}},
		},
	}}
}

func toAny(m map[string]string) map[string]any {
	out := map[string]any{}
	for k, v := range m {
		out[k] = v
	}
	return out
}

func scoped(scope, value string) map[string]string {
	return map[string]string{ScopeLabel: scope, ScopeValueLabel: value}
}

func authorizerWith(objs ...runtime.Object) *Authorizer {
	dyn := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(runtime.NewScheme(),
		map[schema.GroupVersionResource]string{
			UsersGVR:        "UserList",
			RolesGVR:        "IAMRoleList",
			RoleBindingsGVR: "IAMRoleBindingList",
		}, objs...)
	return NewAuthorizer(NewStore(dyn))
}

var listUsers = Attributes{Verb: "list", APIGroup: Group, Resource: "users"}

func TestAuthorizeOnlyHonoursPlatformScopeBindings(t *testing.T) {
	platform := scoped(ScopePlatform, ScopeGlobal)
	cases := []struct {
		name    string
		labels  map[string]string
		allowed bool
	}{
		{"platform/global binding grants", platform, true},
		// Global confines these to their scope; the console is platform scope,
		// so a namespace or workspace admin must not become a console admin.
		{"namespace-scoped binding does not grant", scoped("namespace", "aaa-1"), false},
		{"workspace-scoped binding does not grant", scoped("workspace", "aaa"), false},
		{"cluster-scoped binding does not grant", scoped("cluster", "rg-member"), false},
		{"platform binding with another value does not grant", scoped(ScopePlatform, "other"), false},
		{"unlabelled binding does not grant", nil, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			a := authorizerWith(role("r", platform), binding("b", "r", "bob", tc.labels))
			ok, err := a.Authorize(context.Background(), &Identity{Name: "bob"}, listUsers)
			if err != nil {
				t.Fatal(err)
			}
			if ok != tc.allowed {
				t.Fatalf("allowed = %v, want %v", ok, tc.allowed)
			}
		})
	}
}

func TestPermissionsForOnlyHonoursPlatformScopeBindings(t *testing.T) {
	a := authorizerWith(
		role("platform-viewer", scoped(ScopePlatform, ScopeGlobal), "users.view"),
		role("ns-admin", scoped("namespace", "aaa-1"), "roles.view"),
		binding("p", "platform-viewer", "bob", scoped(ScopePlatform, ScopeGlobal)),
		binding("n", "ns-admin", "bob", scoped("namespace", "aaa-1")),
	)
	got, err := a.PermissionsFor(context.Background(), &Identity{Name: "bob"})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0] != "users.view" {
		t.Fatalf("permissions = %v, want [users.view]", got)
	}
}

func TestSystemMastersStillShortCircuits(t *testing.T) {
	a := authorizerWith()
	ok, err := a.Authorize(context.Background(), &Identity{Name: "admin", Groups: []string{"system:masters"}}, listUsers)
	if err != nil || !ok {
		t.Fatalf("system:masters denied: %v %v", ok, err)
	}
}
