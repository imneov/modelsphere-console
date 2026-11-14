package router

import (
	"errors"

	"github.com/modelsphere/console/internal/gatewayapi"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

var ErrBillingBlocked = errors.New("wallet billing admission blocked")

func (store *CRDStore) EnforceBilling(enabled bool) { store.enforceBilling = enabled }

func (rt *Router) EnforceBilling(enabled bool) error {
	store, ok := rt.keys.(*CRDStore)
	if !ok {
		return errors.New("billing requires CRD keySource")
	}
	store.EnforceBilling(enabled)
	return nil
}

func (store *CRDStore) Admit(ownerUID string) error {
	if !store.enforceBilling {
		return nil
	}
	state, _ := store.walletAdmission(ownerUID)
	if state != "allowed" {
		return ErrBillingBlocked
	}
	return nil
}

func (store *CRDStore) walletAdmission(ownerUID string) (string, int64) {
	value, exists, err := store.wallets.GetStore().GetByKey(store.namespace + "/" + gatewayapi.WalletName(ownerUID))
	if err != nil || !exists {
		return "unknown", 0
	}
	object := value.(*unstructured.Unstructured)
	owner, _, err := unstructured.NestedString(object.Object, "spec", "principalUID")
	if err != nil || owner != ownerUID {
		return "unknown", 0
	}
	state, _, err := unstructured.NestedString(object.Object, "status", "billingState")
	if err != nil || (state != "allowed" && state != "blocked") {
		return "unknown", 0
	}
	revision, _, err := unstructured.NestedInt64(object.Object, "status", "walletRevision")
	if err != nil {
		return "unknown", 0
	}
	return state, revision
}

func (rt *Router) WalletAdmission(ownerUID string) (string, int64) {
	store, ok := rt.keys.(*CRDStore)
	if !ok {
		return "unknown", 0
	}
	return store.walletAdmission(ownerUID)
}
