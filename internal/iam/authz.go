package iam

import (
	"context"
	"sort"

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
// IAMRoleBinding CRDs, as Rise Global answers it at platform scope: the
// system:masters short-circuit, then standard K8s RBAC rule matching over the
// bindings labelled scope=platform, scope-value=global. Everything the console
// guards (users, roles, backends) is platform-level, so that is the only link of
// Global's scope chain it evaluates. Bindings at namespace, workspace, cluster or
// nodegroup scope are Global's to enforce within that scope and grant nothing
// here -- on a Global member cluster they sit in the same CRDs, and honouring
// them would turn a namespace admin into a console admin.
//
// It evaluates the iam CRDs directly rather than reconciled native RBAC, so no
// controller is needed. The CRD objects are identical to Global's, so on upgrade
// Global's controllers adopt them and its authorizer takes over unchanged.
type Authorizer struct {
	store *Store
}

func NewAuthorizer(store *Store) *Authorizer { return &Authorizer{store: store} }

func (a *Authorizer) PermissionsFor(ctx context.Context, id *Identity) ([]string, error) {
	if id == nil {
		return []string{}, nil
	}
	if id.IsSystemMaster() {
		return []string{"*"}, nil
	}
	roles, err := a.platformRoles(ctx, id)
	if err != nil {
		return nil, err
	}
	seen := map[string]struct{}{}
	permissions := []string{}
	for _, role := range roles {
		for _, permission := range role.Spec.UIPermissions {
			if _, ok := seen[permission]; ok {
				continue
			}
			seen[permission] = struct{}{}
			permissions = append(permissions, permission)
		}
	}
	sort.Strings(permissions)
	return permissions, nil
}

func (a *Authorizer) Authorize(ctx context.Context, id *Identity, attr Attributes) (bool, error) {
	if id == nil {
		return false, nil
	}
	if id.IsSystemMaster() {
		return true, nil
	}
	roles, err := a.platformRoles(ctx, id)
	if err != nil {
		return false, err
	}
	for _, role := range roles {
		for _, rule := range role.Spec.Rules {
			if ruleAllows(rule, attr) {
				return true, nil
			}
		}
	}
	return false, nil
}

// platformRoles is every role bound to id at platform scope, each once.
func (a *Authorizer) platformRoles(ctx context.Context, id *Identity) ([]*IAMRole, error) {
	bindings, err := a.store.ListRoleBindings(ctx)
	if err != nil {
		return nil, err
	}
	seen := map[string]bool{}
	var roles []*IAMRole
	for i := range bindings {
		b := &bindings[i]
		if !isPlatformScope(b.Labels) || !subjectMatches(b.Spec.Subjects, id) {
			continue
		}
		name := b.Spec.RoleRef.Name
		if seen[name] {
			continue
		}
		seen[name] = true
		role, err := a.store.GetRole(ctx, name)
		if err != nil {
			// A dangling RoleRef grants nothing; it is not a hard error.
			continue
		}
		roles = append(roles, role)
	}
	return roles, nil
}

// isPlatformScope is Global's label selector for the platform level
// (authorizer.visitRulesAtScope): scope=platform and scope-value=global.
func isPlatformScope(labels map[string]string) bool {
	return labels[ScopeLabel] == ScopePlatform && labels[ScopeValueLabel] == ScopeGlobal
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
