package iam

import (
	"context"
	"fmt"
	"time"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/dynamic/dynamicinformer"
	"k8s.io/client-go/tools/cache"
)

type AuthorizationStore interface {
	ListRoleBindings(context.Context) ([]IAMRoleBinding, error)
	GetRole(context.Context, string) (*IAMRole, error)
}

type RulesCache struct{ roles, bindings cache.SharedIndexInformer }

func NewRulesCache(ctx context.Context, client dynamic.Interface) (*RulesCache, error) {
	factory := dynamicinformer.NewDynamicSharedInformerFactory(client, 0)
	rules := &RulesCache{roles: factory.ForResource(RolesGVR).Informer(), bindings: factory.ForResource(RoleBindingsGVR).Informer()}
	factory.Start(ctx.Done())
	syncContext, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	if !cache.WaitForCacheSync(syncContext.Done(), rules.roles.HasSynced, rules.bindings.HasSynced) {
		return nil, fmt.Errorf("sync inference authorization informers: %w", syncContext.Err())
	}
	return rules, nil
}

func (rules *RulesCache) GetRole(ctx context.Context, name string) (*IAMRole, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	value, found, err := rules.roles.GetStore().GetByKey(name)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, apierrors.NewNotFound(RolesGVR.GroupResource(), name)
	}
	object := value.(*unstructured.Unstructured)
	if !isPlatformScope(object.GetLabels()) {
		return nil, apierrors.NewNotFound(RolesGVR.GroupResource(), name)
	}
	var role IAMRole
	if err := decodeInto(object, &role); err != nil {
		return nil, err
	}
	return &role, nil
}

func (rules *RulesCache) ListRoleBindings(ctx context.Context) ([]IAMRoleBinding, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	result := []IAMRoleBinding{}
	for _, value := range rules.bindings.GetStore().List() {
		object := value.(*unstructured.Unstructured)
		if !isPlatformScope(object.GetLabels()) {
			continue
		}
		var binding IAMRoleBinding
		if err := decodeInto(object, &binding); err != nil {
			return nil, err
		}
		result = append(result, binding)
	}
	return result, nil
}
