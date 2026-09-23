package iam

import (
	"context"

	rbacv1 "k8s.io/api/rbac/v1"
)

// Attributes describe an access request in RBAC terms. Name is optional (a check
// on a whole collection leaves it empty).
type Attributes struct {
	Verb     string
	APIGroup string
	Resource string
	Name     string
}

// Authorizer answers "may this identity do this" against the IAMRole and
// IAMRoleBinding CRDs. This is the global-scope-only core of Global's
// authorizer: the system:masters short-circuit plus standard K8s RBAC rule
// matching. Global's multi-scope chain (workspace/nodegroup/namespace) is
// intentionally dropped -- the community portal has one scope.
//
// It evaluates the iam CRDs directly rather than reconciled native RBAC, so no
// controller is needed. The CRD objects are identical to Global's, so on upgrade
// Global's controllers adopt them and its authorizer takes over unchanged.
type Authorizer struct {
	store *Store
}

func NewAuthorizer(store *Store) *Authorizer { return &Authorizer{store: store} }

func (a *Authorizer) Authorize(ctx context.Context, id *Identity, attr Attributes) (bool, error) {
	if id == nil {
		return false, nil
	}
	if id.IsSystemMaster() {
		return true, nil
	}
	bindings, err := a.store.ListRoleBindings(ctx)
	if err != nil {
		return false, err
	}
	roles := map[string]*IAMRole{}
	for i := range bindings {
		b := &bindings[i]
		if !subjectMatches(b.Spec.Subjects, id) {
			continue
		}
		name := b.Spec.RoleRef.Name
		role, ok := roles[name]
		if !ok {
			role, err = a.store.GetRole(ctx, name)
			if err != nil {
				// A dangling RoleRef grants nothing; it is not a hard error.
				roles[name] = nil
				continue
			}
			roles[name] = role
		}
		if role == nil {
			continue
		}
		for _, rule := range role.Spec.Rules {
			if ruleAllows(rule, attr) {
				return true, nil
			}
		}
	}
	return false, nil
}

func subjectMatches(subjects []rbacv1.Subject, id *Identity) bool {
	for _, s := range subjects {
		switch s.Kind {
		case rbacv1.UserKind:
			if s.Name == id.Name {
				return true
			}
		case rbacv1.GroupKind:
			for _, g := range id.Groups {
				if g == s.Name {
					return true
				}
			}
		}
	}
	return false
}

func ruleAllows(rule rbacv1.PolicyRule, attr Attributes) bool {
	return has(rule.Verbs, attr.Verb) &&
		has(rule.APIGroups, attr.APIGroup) &&
		has(rule.Resources, attr.Resource) &&
		(attr.Name == "" || len(rule.ResourceNames) == 0 || contains(rule.ResourceNames, attr.Name))
}

// has reports whether list allows want, honouring the RBAC "*" wildcard.
func has(list []string, want string) bool {
	for _, v := range list {
		if v == rbacv1.APIGroupAll || v == want {
			return true
		}
	}
	return false
}

func contains(list []string, want string) bool {
	for _, v := range list {
		if v == want {
			return true
		}
	}
	return false
}
