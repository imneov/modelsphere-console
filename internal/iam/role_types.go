package iam

import (
	rbacv1 "k8s.io/api/rbac/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// Label keys carried on roles and bindings, identical to Global. A global-scope
// kernel always sets scope=platform, scope-value=global.
const (
	ScopeLabel      = "iam.theriseunion.io/scope"
	ScopeValueLabel = "iam.theriseunion.io/scope-value"
	ManagedLabel    = "iam.theriseunion.io/managed"
	ScopePlatform   = "platform"
	ScopeGlobal     = "global"
)

// IAMRole wraps standard rbac PolicyRules (plus UI permission identifiers for
// the frontend). Same shape as Global, so its controllers can adopt these
// objects on upgrade.
type IAMRoleSpec struct {
	Rules         []rbacv1.PolicyRule `json:"rules,omitempty"`
	UIPermissions []string            `json:"uiPermissions,omitempty"`
}

type IAMRole struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`
	Spec              IAMRoleSpec `json:"spec,omitempty"`
}

// IAMRoleBinding binds subjects to an IAMRole. Subjects are standard
// rbacv1.Subject (User/Group), RoleRef names the IAMRole.
type IAMRoleBindingSpec struct {
	Subjects []rbacv1.Subject `json:"subjects,omitempty"`
	RoleRef  rbacv1.RoleRef   `json:"roleRef"`
}

type IAMRoleBinding struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`
	Spec              IAMRoleBindingSpec `json:"spec,omitempty"`
}
