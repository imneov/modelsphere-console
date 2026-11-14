package billing

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/modelsphere/console/internal/gatewayapi"
	"github.com/modelsphere/console/internal/iam"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/dynamic/dynamicinformer"
	"k8s.io/client-go/tools/cache"
	"k8s.io/client-go/util/retry"
	"k8s.io/client-go/util/workqueue"
)

type ProjectionStore interface {
	Projections(context.Context, int) ([]Projection, error)
	LatestProjection(context.Context, string) (Projection, error)
	AckProjection(context.Context, Projection) error
}

type AdmissionProjector struct {
	due       workqueue.TypedDelayingInterface[string]
	client    dynamic.Interface
	namespace string
	store     ProjectionStore
	keys      cache.SharedIndexInformer
	users     cache.SharedIndexInformer
	log       *slog.Logger
	// mu guards owners queued by informer additions and user lifecycle changes.
	mu     sync.Mutex
	owners map[string]uint64
}

func NewAdmissionProjector(ctx context.Context, client dynamic.Interface, namespace string, store ProjectionStore, log *slog.Logger) (*AdmissionProjector, error) {
	factory := dynamicinformer.NewFilteredDynamicSharedInformerFactory(client, 0, namespace, nil)
	userFactory := dynamicinformer.NewDynamicSharedInformerFactory(client, 0)
	projector := &AdmissionProjector{due: workqueue.NewTypedDelayingQueue[string](), client: client, namespace: namespace, store: store, log: log, keys: factory.ForResource(gatewayapi.APIKeys).Informer(), users: userFactory.ForResource(iam.UsersGVR).Informer(), owners: map[string]uint64{}}
	if err := projector.keys.AddIndexers(cache.Indexers{"owner": keySpecIndex("principalUID"), "user": keySpecIndex("user")}); err != nil {
		return nil, err
	}
	if _, err := projector.keys.AddEventHandler(cache.ResourceEventHandlerFuncs{AddFunc: projector.newKey, UpdateFunc: projector.keyChanged}); err != nil {
		return nil, err
	}
	if _, err := projector.users.AddEventHandler(cache.ResourceEventHandlerFuncs{AddFunc: projector.userChanged, UpdateFunc: func(_, updated any) { projector.userChanged(updated) }, DeleteFunc: projector.userChanged}); err != nil {
		return nil, err
	}
	go func() { <-ctx.Done(); projector.due.ShutDown() }()
	factory.Start(ctx.Done())
	userFactory.Start(ctx.Done())
	syncContext, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	if !cache.WaitForCacheSync(syncContext.Done(), projector.keys.HasSynced, projector.users.HasSynced) {
		return nil, fmt.Errorf("sync admission projection informers: %w", syncContext.Err())
	}
	return projector, nil
}

func keySpecIndex(field string) cache.IndexFunc {
	return func(value any) ([]string, error) {
		object, ok := value.(*unstructured.Unstructured)
		if !ok {
			return nil, errors.New("unexpected key cache object")
		}
		text, _, err := unstructured.NestedString(object.Object, "spec", field)
		if err != nil {
			return nil, err
		}
		if text == "" {
			return nil, nil
		}
		return []string{text}, nil
	}
}

func (projector *AdmissionProjector) newKey(value any) {
	object, ok := value.(*unstructured.Unstructured)
	if !ok {
		return
	}
	owner, _, err := unstructured.NestedString(object.Object, "spec", "principalUID")
	if err != nil || owner == "" {
		return
	}
	projector.enqueue(owner)
	projector.scheduleExpiry(object, owner)
}

func (projector *AdmissionProjector) enqueue(owner string) {
	projector.mu.Lock()
	projector.owners[owner]++
	projector.mu.Unlock()
}

func (projector *AdmissionProjector) userChanged(value any) {
	if tombstone, ok := value.(cache.DeletedFinalStateUnknown); ok {
		value = tombstone.Obj
	}
	object, ok := value.(*unstructured.Unstructured)
	if !ok {
		return
	}
	keys, err := projector.keys.GetIndexer().ByIndex("user", object.GetName())
	if err != nil {
		projector.log.Error("index keys for user lifecycle failed", "err", err)
		return
	}
	for _, key := range keys {
		projector.newKey(key)
	}
}

func (projector *AdmissionProjector) ProjectPending(ctx context.Context, limit int) error {
	for projector.due.Len() > 0 {
		owner, shutdown := projector.due.Get()
		if shutdown {
			break
		}
		projector.enqueue(owner)
		projector.due.Done(owner)
	}
	pending, err := projector.store.Projections(ctx, limit)
	if err != nil {
		return err
	}
	for _, projection := range pending {
		if err := projector.projectLatest(ctx, projection.OwnerUID); err != nil {
			return err
		}
	}
	projector.mu.Lock()
	owners := make(map[string]uint64)
	for owner, version := range projector.owners {
		if len(owners) >= limit {
			break
		}
		owners[owner] = version
	}
	projector.mu.Unlock()
	for owner, version := range owners {
		if err := projector.projectLatest(ctx, owner); err != nil {
			return err
		}
		projector.mu.Lock()
		if projector.owners[owner] == version {
			delete(projector.owners, owner)
		}
		projector.mu.Unlock()
	}
	return nil
}

func (projector *AdmissionProjector) projectLatest(ctx context.Context, owner string) error {
	projection, err := projector.store.LatestProjection(ctx, owner)
	persisted := true
	if errors.Is(err, sql.ErrNoRows) {
		projection = Projection{OwnerUID: owner, State: "blocked"}
		persisted = false
	} else if err != nil {
		return err
	}
	if err := projector.wallet(ctx, projection); err != nil {
		return err
	}
	keys, err := projector.keys.GetIndexer().ByIndex("owner", owner)
	if err != nil {
		return err
	}
	for _, value := range keys {
		key := value.(*unstructured.Unstructured)
		projector.scheduleExpiry(key, owner)
		if err := projector.key(ctx, key.GetName(), projection); err != nil {
			return err
		}
	}
	if persisted {
		return projector.store.AckProjection(ctx, projection)
	}
	return nil
}

func (projector *AdmissionProjector) wallet(ctx context.Context, projection Projection) error {
	resource := projector.client.Resource(gatewayapi.WalletAdmissions).Namespace(projector.namespace)
	name := gatewayapi.WalletName(projection.OwnerUID)
	return retry.RetryOnConflict(retry.DefaultRetry, func() error {
		object, err := resource.Get(ctx, name, metav1.GetOptions{})
		if apierrors.IsNotFound(err) {
			object = &unstructured.Unstructured{Object: map[string]any{"apiVersion": gatewayapi.Group + "/" + gatewayapi.Version, "kind": "WalletAdmission", "metadata": map[string]any{"name": name, "namespace": projector.namespace}, "spec": map[string]any{"principalKind": "User", "principalUID": projection.OwnerUID}}}
			object, err = resource.Create(ctx, object, metav1.CreateOptions{})
		}
		if err != nil {
			return err
		}
		owner, _, err := unstructured.NestedString(object.Object, "spec", "principalUID")
		if err != nil {
			return err
		}
		if owner != projection.OwnerUID {
			return ErrConflict
		}
		revision, _, err := unstructured.NestedInt64(object.Object, "status", "walletRevision")
		if err != nil {
			return err
		}
		state, _, err := unstructured.NestedString(object.Object, "status", "billingState")
		if err != nil {
			return err
		}
		if revision > projection.Revision || (revision == projection.Revision && state == projection.State) {
			return nil
		}
		status := map[string]any{"billingState": projection.State, "walletRevision": projection.Revision}
		if err := unstructured.SetNestedMap(object.Object, status, "status"); err != nil {
			return err
		}
		_, err = resource.UpdateStatus(ctx, object, metav1.UpdateOptions{})
		return err
	})
}

func (projector *AdmissionProjector) key(ctx context.Context, name string, projection Projection) error {
	resource := projector.client.Resource(gatewayapi.APIKeys).Namespace(projector.namespace)
	return retry.RetryOnConflict(retry.DefaultRetry, func() error {
		object, err := resource.Get(ctx, name, metav1.GetOptions{})
		if apierrors.IsNotFound(err) {
			return nil
		}
		if err != nil {
			return err
		}
		owner, _, err := unstructured.NestedString(object.Object, "spec", "principalUID")
		if err != nil {
			return err
		}
		if owner != projection.OwnerUID {
			return ErrConflict
		}
		revision, _, err := unstructured.NestedInt64(object.Object, "status", "walletRevision")
		if err != nil {
			return err
		}
		if revision > projection.Revision {
			return nil
		}
		state, reason, err := projector.keyState(object, projection)
		if err != nil {
			return err
		}
		desired := map[string]any{"state": state, "disabledReason": reason, "billingState": projection.State, "walletRevision": projection.Revision}
		previous, _, err := unstructured.NestedMap(object.Object, "status")
		if err != nil {
			return err
		}
		if previous["state"] == state && previous["disabledReason"] == reason && previous["billingState"] == projection.State {
			return nil
		}
		if err := unstructured.SetNestedMap(object.Object, desired, "status"); err != nil {
			return err
		}
		_, err = resource.UpdateStatus(ctx, object, metav1.UpdateOptions{})
		return err
	})
}

func (projector *AdmissionProjector) keyState(object *unstructured.Unstructured, projection Projection) (string, string, error) {
	disabled, _, err := unstructured.NestedBool(object.Object, "spec", "disabled")
	if err != nil {
		return "", "", err
	}
	if disabled {
		return "disabled", "admin", nil
	}
	userName, _, err := unstructured.NestedString(object.Object, "spec", "user")
	if err != nil {
		return "", "", err
	}
	value, exists, err := projector.users.GetStore().GetByKey(userName)
	if err != nil {
		return "", "", err
	}
	var user iam.User
	if !exists {
		return "system-disabled", "user-inactive", nil
	}
	if err := runtime.DefaultUnstructuredConverter.FromUnstructured(value.(*unstructured.Unstructured).Object, &user); err != nil {
		return "", "", err
	}
	if iam.CanonicalUID(&user) != projection.OwnerUID || (user.Status.State != "" && user.Status.State != iam.UserActive) {
		return "system-disabled", "user-inactive", nil
	}
	expiry, _, err := unstructured.NestedString(object.Object, "spec", "expiresAt")
	if err != nil {
		return "", "", err
	}
	if expiry != "" {
		at, err := time.Parse(time.RFC3339Nano, expiry)
		if err != nil {
			return "", "", err
		}
		if !time.Now().Before(at) {
			return "system-disabled", "expired", nil
		}
	}
	if projection.State == "blocked" {
		return "system-disabled", "insufficient-balance", nil
	}
	return "enabled", "", nil
}

func (projector *AdmissionProjector) keyChanged(_, updated any) {
	projector.newKey(updated)
}

func (projector *AdmissionProjector) scheduleExpiry(object *unstructured.Unstructured, owner string) {
	expiry, _, err := unstructured.NestedString(object.Object, "spec", "expiresAt")
	if err != nil || expiry == "" {
		return
	}
	at, err := time.Parse(time.RFC3339Nano, expiry)
	if err == nil && at.After(time.Now()) {
		projector.due.AddAfter(owner, time.Until(at))
	}
}
