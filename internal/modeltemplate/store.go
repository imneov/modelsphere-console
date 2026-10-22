package modeltemplate

import (
	"context"
	"time"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
)

var configMaps = schema.GroupVersionResource{Version: "v1", Resource: "configmaps"}

const ownerAnnotation = "console.modelsphere.io/model-templates"

type Store struct {
	client dynamic.ResourceInterface
	name   string
}

func NewStore(client dynamic.Interface, namespace, name string) *Store {
	return &Store{client: client.Resource(configMaps).Namespace(namespace), name: name}
}

func (s *Store) read(ctx context.Context) (*State, *unstructured.Unstructured, error) {
	obj, err := s.client.Get(ctx, s.name, metav1.GetOptions{})
	if apierrors.IsNotFound(err) {
		return Empty(), nil, nil
	}
	if err != nil {
		return nil, nil, err
	}
	if obj.GetLabels()["app.kubernetes.io/managed-by"] != "console" || obj.GetAnnotations()[ownerAnnotation] != "true" {
		return nil, nil, ErrInvalidState
	}
	raw, ok, err := unstructured.NestedString(obj.Object, "data", "state.json")
	if err != nil || !ok {
		return nil, nil, ErrInvalidState
	}
	state, err := Decode(raw)
	return state, obj, err
}
func (s *Store) Read(ctx context.Context) (*State, error) {
	state, _, err := s.read(ctx)
	return state, err
}

func (s *Store) Create(ctx context.Context, in Input, actor string) (*State, error) {
	if _, err := Validate(in); err != nil {
		return nil, err
	}
	for attempt := 0; attempt < 5; attempt++ {
		state, obj, err := s.read(ctx)
		if err != nil {
			return nil, err
		}
		if err := state.Add(in, actor, time.Now().UTC().Format(time.RFC3339)); err != nil {
			return nil, err
		}
		raw, err := state.Encode()
		if err != nil {
			return nil, err
		}
		create := obj == nil
		if create {
			obj = &unstructured.Unstructured{Object: map[string]any{"apiVersion": "v1", "kind": "ConfigMap", "metadata": map[string]any{"name": s.name}}}
			obj.SetLabels(map[string]string{"app.kubernetes.io/managed-by": "console"})
			obj.SetAnnotations(map[string]string{ownerAnnotation: "true"})
		}
		if err := unstructured.SetNestedField(obj.Object, raw, "data", "state.json"); err != nil {
			return nil, err
		}
		if create {
			_, err = s.client.Create(ctx, obj, metav1.CreateOptions{})
		} else {
			_, err = s.client.Update(ctx, obj, metav1.UpdateOptions{})
		}
		if apierrors.IsAlreadyExists(err) || apierrors.IsConflict(err) {
			continue
		}
		if err != nil {
			return nil, err
		}
		return state, nil
	}
	return nil, apierrors.NewConflict(configMaps.GroupResource(), s.name, ErrDuplicate)
}
