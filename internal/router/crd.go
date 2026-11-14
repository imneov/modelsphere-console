package router

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"fmt"
	"log/slog"
	"slices"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/modelsphere/console/internal/gatewayapi"
	"github.com/modelsphere/console/internal/iam"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/dynamic/dynamicinformer"
	"k8s.io/client-go/tools/cache"
)

var APIKeysGVR = gatewayapi.APIKeys

type KeyStatus struct {
	State          string `json:"state,omitempty"`
	DisabledReason string `json:"disabledReason,omitempty"`
	BillingState   string `json:"billingState,omitempty"`
	WalletRevision int64  `json:"walletRevision,omitempty"`
}

type APIKey struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`
	Spec              Key       `json:"spec"`
	Status            KeyStatus `json:"status,omitempty"`
}

type CRDStore struct {
	client         dynamic.Interface
	namespace      string
	keys           cache.SharedIndexInformer
	users          cache.SharedIndexInformer
	wallets        cache.SharedIndexInformer
	enforceBilling bool
	authorizer     *iam.Authorizer
}

func NewCRDStore(ctx context.Context, client dynamic.Interface, namespace string, log *slog.Logger) (*CRDStore, error) {
	keyFactory := dynamicinformer.NewFilteredDynamicSharedInformerFactory(client, 0, namespace, nil)
	userFactory := dynamicinformer.NewDynamicSharedInformerFactory(client, 0)
	store := &CRDStore{client: client, namespace: namespace,
		keys: keyFactory.ForResource(APIKeysGVR).Informer(), users: userFactory.ForResource(iam.UsersGVR).Informer()}
	store.wallets = keyFactory.ForResource(gatewayapi.WalletAdmissions).Informer()
	if err := store.keys.AddIndexers(cache.Indexers{"digest": fieldIndex("hash"), "id": fieldIndex("id")}); err != nil {
		return nil, fmt.Errorf("index APIKeys: %w", err)
	}
	keyFactory.Start(ctx.Done())
	userFactory.Start(ctx.Done())
	syncCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	if !cache.WaitForCacheSync(syncCtx.Done(), store.keys.HasSynced, store.users.HasSynced, store.wallets.HasSynced) {
		return nil, fmt.Errorf("sync APIKey and User informers: %w", syncCtx.Err())
	}
	log.Info("api key informers synchronized", "namespace", namespace)
	rules, err := iam.NewRulesCache(ctx, client)
	if err != nil {
		return nil, err
	}
	store.authorizer = iam.NewAuthorizer(rules)
	return store, nil
}

func fieldIndex(field string) cache.IndexFunc {
	return func(value any) ([]string, error) {
		object, ok := value.(*unstructured.Unstructured)
		if !ok {
			return nil, fmt.Errorf("unexpected APIKey cache object %T", value)
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

func credentialDigest(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

func resourceName(key Key) string {
	return "key-" + credentialDigest(key.PrincipalUID + "\x00" + key.Name)[:40]
}

func (store *CRDStore) owner(name, expectedUID string) (string, error) {
	return store.resolveOwner(name, expectedUID, false)
}

func (store *CRDStore) resolveOwner(name, expectedUID string, allowInactive bool) (string, error) {
	value, exists, err := store.users.GetStore().GetByKey(name)
	if err != nil {
		return "", fmt.Errorf("read cached user: %w", err)
	}
	if !exists {
		return "", fmt.Errorf("%w: user not found", ErrBadInput)
	}
	var user iam.User
	if err := runtime.DefaultUnstructuredConverter.FromUnstructured(value.(*unstructured.Unstructured).Object, &user); err != nil {
		return "", err
	}
	uid := iam.CanonicalUID(&user)
	if uid == "" || (expectedUID != "" && expectedUID != uid) {
		return "", fmt.Errorf("%w: user identity changed or unresolved", ErrBadInput)
	}
	if !allowInactive && user.Status.State != "" && user.Status.State != iam.UserActive {
		return "", ErrDisabled
	}
	return uid, nil
}

func (store *CRDStore) Create(ctx context.Context, input Input) (Key, string, error) {
	name := strings.TrimSpace(input.Name)
	if name == "" || len(name) > 200 || len(input.Description) > 65536 || input.User == "" || input.ExpiresIn < 0 {
		return Key{}, "", fmt.Errorf("%w: name and explicit user are required", ErrBadInput)
	}
	uid, err := store.owner(input.User, input.PrincipalUID)
	if err != nil {
		return Key{}, "", err
	}
	id, err := uuid.NewRandom()
	if err != nil {
		return Key{}, "", fmt.Errorf("generate key ID: %w", err)
	}
	secret, err := uuid.NewRandom()
	if err != nil {
		return Key{}, "", fmt.Errorf("generate credential: %w", err)
	}
	value := "sk-" + secret.String()
	key := Key{ID: id.String(), Name: name, Description: strings.TrimSpace(input.Description),
		User: input.User, PrincipalKind: "User", PrincipalUID: uid, WalletID: uid,
		Creator: input.CreatedBy, CreatedBy: input.CreatedBy, CreatedAt: time.Now().UTC(),
		Models: cleanModels(input.Models), Hash: credentialDigest(value), KeyMasked: "sk-******" + value[len(value)-8:], From: "system", ExpiresAt: input.ExpiresAt}
	if key.ExpiresAt == nil && input.ExpiresIn > 0 {
		expiry := key.CreatedAt.Add(input.ExpiresIn)
		key.ExpiresAt = &expiry
	}
	if key.Expired(time.Now()) {
		return Key{}, "", fmt.Errorf("%w: expiry must be in the future", ErrBadInput)
	}
	if err := store.put(ctx, key); err != nil {
		return Key{}, "", err
	}
	return key, value, nil
}

func (store *CRDStore) put(ctx context.Context, key Key) error {
	return store.createResource(ctx, key, metav1.CreateOptions{})
}

func (store *CRDStore) createResource(ctx context.Context, key Key, options metav1.CreateOptions) error {
	object := APIKey{TypeMeta: metav1.TypeMeta{APIVersion: APIKeysGVR.GroupVersion().String(), Kind: "APIKey"},
		ObjectMeta: metav1.ObjectMeta{Name: resourceName(key), Namespace: store.namespace}, Spec: key}
	data, err := runtime.DefaultUnstructuredConverter.ToUnstructured(&object)
	if err != nil {
		return fmt.Errorf("encode APIKey: %w", err)
	}
	_, err = store.client.Resource(APIKeysGVR).Namespace(store.namespace).Create(ctx, &unstructured.Unstructured{Object: data}, options)
	if apierrors.IsAlreadyExists(err) {
		return ErrExists
	}
	return err
}

func decodeKey(object *unstructured.Unstructured) (Key, error) {
	var resource APIKey
	if err := runtime.DefaultUnstructuredConverter.FromUnstructured(object.Object, &resource); err != nil {
		return Key{}, fmt.Errorf("decode APIKey %s: %w", object.GetName(), err)
	}
	resource.Spec.BillingState = resource.Status.BillingState
	resource.Spec.WalletRevision = resource.Status.WalletRevision
	resource.Spec.EffectiveStatus = resource.Status.State
	resource.Spec.DisabledReason = resource.Status.DisabledReason
	return resource.Spec, nil
}

func (store *CRDStore) List(ctx context.Context) ([]Key, error) {
	list, err := store.client.Resource(APIKeysGVR).Namespace(store.namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	keys := make([]Key, 0, len(list.Items))
	for index := range list.Items {
		key, err := decodeKey(&list.Items[index])
		if err != nil {
			return nil, err
		}
		keys = append(keys, key)
	}
	slices.SortFunc(keys, func(left, right Key) int { return right.CreatedAt.Compare(left.CreatedAt) })
	return keys, nil
}

func (store *CRDStore) Delete(ctx context.Context, id string) error {
	keys, err := store.List(ctx)
	if err != nil {
		return err
	}
	for _, key := range keys {
		if key.ID == id {
			return store.client.Resource(APIKeysGVR).Namespace(store.namespace).Delete(ctx, resourceName(key), metav1.DeleteOptions{})
		}
	}
	return ErrNotFound
}

func (store *CRDStore) Verify(_ context.Context, value string) (Key, error) {
	if len(value) < 9 || len(value) > 4096 {
		return Key{}, ErrInvalid
	}
	index, lookup := "digest", credentialDigest(value)
	legacyID, legacySecret, legacy := Parse(value)
	if legacy {
		index, lookup = "id", legacyID
	}
	objects, err := store.keys.GetIndexer().ByIndex(index, lookup)
	if err != nil {
		return Key{}, fmt.Errorf("%w: %v", ErrUnavailable, err)
	}
	if len(objects) != 1 {
		return Key{}, ErrInvalid
	}
	key, err := decodeKey(objects[0].(*unstructured.Unstructured))
	if err != nil {
		return Key{}, err
	}
	if legacy {
		if !key.matches(legacySecret) {
			return Key{}, ErrInvalid
		}
	} else if subtle.ConstantTimeCompare([]byte(key.Hash), []byte(lookup)) != 1 {
		return Key{}, ErrInvalid
	}
	if key.Expired(time.Now()) {
		return Key{}, ErrExpired
	}
	if key.Disabled {
		return Key{}, ErrDisabled
	}
	if _, err := store.owner(key.User, key.PrincipalUID); err != nil {
		return Key{}, ErrDisabled
	}
	if key.PrincipalUID == "" {
		return Key{}, ErrDisabled
	}
	if err := store.Admit(key.PrincipalUID); err != nil {
		return Key{}, err
	}
	return key, nil
}
