package iam

import (
	"context"
	"errors"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
)

func decodeInto[T any](u *unstructured.Unstructured, out *T) error {
	return runtime.DefaultUnstructuredConverter.FromUnstructured(u.Object, out)
}

// Roles and bindings are read through a platform-scope lens. On a Rise Global
// cluster these CRDs also hold every workspace, cluster and namespace role;
// those are Global's to manage, and the console neither lists nor touches them.
// A non-platform object reads as not found.
var platformSelector = metav1.ListOptions{LabelSelector: ScopeLabel + "=" + ScopePlatform + "," + ScopeValueLabel + "=" + ScopeGlobal}

// ErrRoleNotBindable: the role does not exist at platform scope.
var ErrRoleNotBindable = errors.New("role not found at platform scope")

func (s *Store) ListRoles(ctx context.Context) ([]IAMRole, error) {
	list, err := s.dyn.Resource(RolesGVR).List(ctx, platformSelector)
	if err != nil {
		return nil, err
	}
	out := make([]IAMRole, len(list.Items))
	for i := range list.Items {
		if err := decodeInto(&list.Items[i], &out[i]); err != nil {
			return nil, err
		}
	}
	return out, nil
}

func (s *Store) GetRole(ctx context.Context, name string) (*IAMRole, error) {
	u, err := s.dyn.Resource(RolesGVR).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}
	if !isPlatformScope(u.GetLabels()) {
		return nil, apierrors.NewNotFound(RolesGVR.GroupResource(), name)
	}
	var r IAMRole
	return &r, decodeInto(u, &r)
}

func (s *Store) CreateRole(ctx context.Context, r *IAMRole) (*IAMRole, error) {
	r.TypeMeta = metav1.TypeMeta{APIVersion: Group + "/" + Version, Kind: "IAMRole"}
	setGlobalScope(&r.ObjectMeta)
	obj, err := runtime.DefaultUnstructuredConverter.ToUnstructured(r)
	if err != nil {
		return nil, err
	}
	created, err := s.dyn.Resource(RolesGVR).Create(ctx, &unstructured.Unstructured{Object: obj}, metav1.CreateOptions{})
	if err != nil {
		return nil, err
	}
	var out IAMRole
	return &out, decodeInto(created, &out)
}

func (s *Store) UpdateRole(ctx context.Context, r *IAMRole) (*IAMRole, error) {
	if _, err := s.GetRole(ctx, r.Name); err != nil {
		return nil, err
	}
	obj, err := runtime.DefaultUnstructuredConverter.ToUnstructured(r)
	if err != nil {
		return nil, err
	}
	updated, err := s.dyn.Resource(RolesGVR).Update(ctx, &unstructured.Unstructured{Object: obj}, metav1.UpdateOptions{})
	if err != nil {
		return nil, err
	}
	var out IAMRole
	return &out, decodeInto(updated, &out)
}

func (s *Store) DeleteRole(ctx context.Context, name string) error {
	if _, err := s.GetRole(ctx, name); err != nil {
		return err
	}
	return s.dyn.Resource(RolesGVR).Delete(ctx, name, metav1.DeleteOptions{})
}

func (s *Store) ListRoleBindings(ctx context.Context) ([]IAMRoleBinding, error) {
	list, err := s.dyn.Resource(RoleBindingsGVR).List(ctx, platformSelector)
	if err != nil {
		return nil, err
	}
	out := make([]IAMRoleBinding, len(list.Items))
	for i := range list.Items {
		if err := decodeInto(&list.Items[i], &out[i]); err != nil {
			return nil, err
		}
	}
	return out, nil
}

// CreateRoleBinding binds only platform roles: a platform binding to a
// namespace role would hand its rules out platform-wide.
func (s *Store) CreateRoleBinding(ctx context.Context, b *IAMRoleBinding) (*IAMRoleBinding, error) {
	if _, err := s.GetRole(ctx, b.Spec.RoleRef.Name); err != nil {
		return nil, ErrRoleNotBindable
	}
	b.TypeMeta = metav1.TypeMeta{APIVersion: Group + "/" + Version, Kind: "IAMRoleBinding"}
	setGlobalScope(&b.ObjectMeta)
	obj, err := runtime.DefaultUnstructuredConverter.ToUnstructured(b)
	if err != nil {
		return nil, err
	}
	created, err := s.dyn.Resource(RoleBindingsGVR).Create(ctx, &unstructured.Unstructured{Object: obj}, metav1.CreateOptions{})
	if err != nil {
		return nil, err
	}
	var out IAMRoleBinding
	return &out, decodeInto(created, &out)
}

func (s *Store) DeleteRoleBinding(ctx context.Context, name string) error {
	u, err := s.dyn.Resource(RoleBindingsGVR).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return err
	}
	if !isPlatformScope(u.GetLabels()) {
		return apierrors.NewNotFound(RoleBindingsGVR.GroupResource(), name)
	}
	return s.dyn.Resource(RoleBindingsGVR).Delete(ctx, name, metav1.DeleteOptions{})
}

// setGlobalScope stamps the platform/global scope labels every role and binding
// carries in this single-scope kernel, matching what Global's controllers key on.
func setGlobalScope(m *metav1.ObjectMeta) {
	if m.Labels == nil {
		m.Labels = map[string]string{}
	}
	m.Labels[ManagedLabel] = "true"
	m.Labels[ScopeLabel] = ScopePlatform
	m.Labels[ScopeValueLabel] = ScopeGlobal
}
