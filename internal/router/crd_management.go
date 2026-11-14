package router

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/client-go/util/retry"
)

func (store *CRDStore) find(ctx context.Context, id string) (Key, error) {
	keys, err := store.List(ctx)
	if err != nil {
		return Key{}, err
	}
	for _, key := range keys {
		if key.ID == id {
			return key, nil
		}
	}
	return Key{}, ErrNotFound
}

func (store *CRDStore) SetDisabled(ctx context.Context, id string, disabled bool) error {
	key, err := store.find(ctx, id)
	if err != nil {
		return err
	}
	resource := store.client.Resource(APIKeysGVR).Namespace(store.namespace)
	return retry.RetryOnConflict(retry.DefaultRetry, func() error {
		object, err := resource.Get(ctx, resourceName(key), metav1.GetOptions{})
		if err != nil {
			return err
		}
		if err := unstructured.SetNestedField(object.Object, disabled, "spec", "disabled"); err != nil {
			return err
		}
		_, err = resource.Update(ctx, object, metav1.UpdateOptions{})
		return err
	})
}

func (rt *Router) SetKeyStatus(w http.ResponseWriter, request *http.Request) {
	store, supported := rt.keys.(*CRDStore)
	if !supported {
		writeError(w, http.StatusConflict, "key lifecycle requires CRD keySource")
		return
	}
	var input struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, request.Body, 4096)).Decode(&input); err != nil || (input.Status != "enabled" && input.Status != "disabled") {
		writeError(w, http.StatusBadRequest, "status must be enabled or disabled")
		return
	}
	err := store.SetDisabled(request.Context(), request.PathValue("id"), input.Status == "disabled")
	if errors.Is(err, ErrNotFound) {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	if err != nil {
		rt.log.Error("update key lifecycle failed", "err", err)
		writeError(w, http.StatusInternalServerError, "update key lifecycle failed")
		return
	}
	rt.log.Info("key lifecycle updated", "key_id", request.PathValue("id"), "status", input.Status)
	w.WriteHeader(http.StatusNoContent)
}

func (rt *Router) SetKeyMigration(target *CRDStore) error {
	source, ok := rt.keys.(*Store)
	if !ok || target == nil {
		return ErrMigrationConflict
	}
	rt.legacy, rt.importer = source, target
	return nil
}

func (rt *Router) ImportKeys(w http.ResponseWriter, request *http.Request) {
	store := rt.importer
	if store == nil || rt.legacy == nil {
		writeError(w, http.StatusConflict, "prepare migration while Secret is the active key authority")
		return
	}
	var input struct {
		OperationID string                  `json:"operationID"`
		Owners      map[string]OwnerMapping `json:"owners"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, request.Body, rt.maxBody)).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid owner mapping")
		return
	}
	if err := store.Import(request.Context(), rt.legacy, input.Owners, input.OperationID); err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, ErrBadInput) || errors.Is(err, ErrDisabled) {
			status = http.StatusBadRequest
		}
		if errors.Is(err, ErrExists) || errors.Is(err, ErrMigrationConflict) {
			status = http.StatusConflict
		}
		writeError(w, status, fmt.Sprintf("import APIKeys: %v", err))
		return
	}
	rt.log.Info("legacy keys imported", "mapped_keys", len(input.Owners))
	writeJSON(w, http.StatusOK, map[string]string{"status": "imported"})
}

type MigrationInfo struct {
	Phase       string                  `json:"phase"`
	OperationID string                  `json:"operationID"`
	Owners      map[string]OwnerMapping `json:"owners"`
}

func (rt *Router) migrationInfo(ctx context.Context) (*MigrationInfo, error) {
	if rt.legacy == nil || rt.importer == nil {
		return nil, nil
	}
	_, _, marker, err := rt.legacy.readSnapshot(ctx)
	if err != nil {
		return nil, err
	}
	staged, err := rt.importer.List(ctx)
	if err != nil {
		return nil, err
	}
	info := &MigrationInfo{Phase: marker.Phase, OperationID: marker.OperationID, Owners: map[string]OwnerMapping{}}
	for _, key := range staged {
		info.Owners[key.ID] = OwnerMapping{User: key.User, PrincipalUID: key.PrincipalUID}
	}
	return info, nil
}
