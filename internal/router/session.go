package router

import (
	"context"

	"github.com/modelsphere/console/internal/iam"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
)

func (rt *Router) SessionAuthorizer() *iam.Authorizer {
	store := rt.identityStore()
	if store == nil {
		return nil
	}
	return store.authorizer
}

func (rt *Router) SessionUser(ctx context.Context, name string) (*iam.User, error) {
	store := rt.identityStore()
	if store == nil {
		return nil, ErrUnavailable
	}
	return store.SessionUser(ctx, name)
}

func (store *CRDStore) Authorizer() *iam.Authorizer { return store.authorizer }

func (store *CRDStore) SessionUser(ctx context.Context, name string) (*iam.User, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	value, found, err := store.users.GetStore().GetByKey(name)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, apierrors.NewNotFound(iam.UsersGVR.GroupResource(), name)
	}
	var user iam.User
	if err := runtime.DefaultUnstructuredConverter.FromUnstructured(value.(*unstructured.Unstructured).Object, &user); err != nil {
		return nil, err
	}
	return &user, nil
}

func (rt *Router) identityStore() *CRDStore {
	if store, ok := rt.keys.(*CRDStore); ok {
		return store
	}
	return rt.importer
}
