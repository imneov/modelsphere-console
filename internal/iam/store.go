package iam

import (
	"context"
	"fmt"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/dynamic"
)

// Store reads and writes the iam CRDs through the dynamic client. Users are
// cluster-scoped, matching Global.
type Store struct {
	dyn dynamic.Interface
}

func NewStore(dyn dynamic.Interface) *Store { return &Store{dyn: dyn} }

func (s *Store) GetUser(ctx context.Context, name string) (*User, error) {
	u, err := s.dyn.Resource(UsersGVR).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}
	return fromUnstructured(u)
}

func (s *Store) ListUsers(ctx context.Context) ([]User, error) {
	list, err := s.dyn.Resource(UsersGVR).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	out := make([]User, 0, len(list.Items))
	for i := range list.Items {
		u, err := fromUnstructured(&list.Items[i])
		if err != nil {
			return nil, err
		}
		out = append(out, *u)
	}
	return out, nil
}

func (s *Store) CreateUser(ctx context.Context, u *User) (*User, error) {
	u.TypeMeta = metav1.TypeMeta{APIVersion: Group + "/" + Version, Kind: "User"}
	obj, err := toUnstructured(u)
	if err != nil {
		return nil, err
	}
	created, err := s.dyn.Resource(UsersGVR).Create(ctx, obj, metav1.CreateOptions{})
	if err != nil {
		return nil, err
	}
	return fromUnstructured(created)
}

func (s *Store) UpdateUser(ctx context.Context, u *User) (*User, error) {
	obj, err := toUnstructured(u)
	if err != nil {
		return nil, err
	}
	updated, err := s.dyn.Resource(UsersGVR).Update(ctx, obj, metav1.UpdateOptions{})
	if err != nil {
		return nil, err
	}
	return fromUnstructured(updated)
}

func (s *Store) DeleteUser(ctx context.Context, name string) error {
	return s.dyn.Resource(UsersGVR).Delete(ctx, name, metav1.DeleteOptions{})
}

// UpdateLastLogin stamps status.lastLoginTime. Best-effort: a failure here must
// not fail the login, so callers log and move on.
func (s *Store) UpdateLastLogin(ctx context.Context, name string) error {
	now := metav1.Now()
	u, err := s.dyn.Resource(UsersGVR).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return err
	}
	if err := unstructured.SetNestedField(u.Object, now.Format("2006-01-02T15:04:05Z07:00"), "status", "lastLoginTime"); err != nil {
		return err
	}
	_, err = s.dyn.Resource(UsersGVR).UpdateStatus(ctx, u, metav1.UpdateOptions{})
	return err
}

func fromUnstructured(u *unstructured.Unstructured) (*User, error) {
	var out User
	if err := runtime.DefaultUnstructuredConverter.FromUnstructured(u.Object, &out); err != nil {
		return nil, fmt.Errorf("decode user: %w", err)
	}
	return &out, nil
}

func toUnstructured(u *User) (*unstructured.Unstructured, error) {
	m, err := runtime.DefaultUnstructuredConverter.ToUnstructured(u)
	if err != nil {
		return nil, fmt.Errorf("encode user: %w", err)
	}
	return &unstructured.Unstructured{Object: m}, nil
}
