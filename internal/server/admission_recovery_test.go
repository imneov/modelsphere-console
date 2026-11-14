package server

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/modelsphere/console/internal/billing"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/runtime"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	k8stesting "k8s.io/client-go/testing"
)

func TestDebtProjectionRetryAndTopupPreserveManualAndModelRestrictions(t *testing.T) {
	server, store, projector := billingServer(t)
	handler := server.Handler()
	admin := login(t, handler, "admin", "admin-pw")
	creditBob(t, handler, admin, "initial", "10")
	if err := projector.ProjectPending(t.Context(), 100); err != nil {
		t.Fatal(err)
	}
	active := createKey(t, handler, admin, `{"name":"active","user":"bob","models":["qwen"]}`)
	manual := createKey(t, handler, admin, `{"name":"manual","user":"bob"}`)
	if response := do(handler, "PUT", "/api/router/apikeys/"+manual.ID+"/status", admin, `{"status":"disabled"}`); response.Code != http.StatusNoContent {
		t.Fatal(response.Body.String())
	}
	awaitKeyResponse(t, handler, active.Value, "qwen", http.StatusOK)
	settleBobDebt(t, store, active.ID)
	client := server.kube.Dynamic().(*dynamicfake.FakeDynamicClient)
	fail := true
	client.PrependReactor("update", "walletadmissions", func(action k8stesting.Action) (bool, runtime.Object, error) {
		if fail && action.GetSubresource() == "status" {
			return true, nil, apierrors.NewServiceUnavailable("injected projection outage")
		}
		return false, nil, nil
	})
	if err := projector.ProjectPending(t.Context(), 100); err == nil {
		t.Fatal("projection failure was acknowledged")
	}
	pending, err := store.Projections(t.Context(), 100)
	if err != nil || len(pending) == 0 {
		t.Fatalf("projection retry was lost: %v %v", pending, err)
	}
	fail = false
	if err := projector.ProjectPending(t.Context(), 100); err != nil {
		t.Fatal(err)
	}
	awaitKeyResponse(t, handler, active.Value, "qwen", http.StatusPaymentRequired)
	creditBob(t, handler, admin, "recharge", "100")
	if err := projector.ProjectPending(t.Context(), 100); err != nil {
		t.Fatal(err)
	}
	awaitKeyResponse(t, handler, active.Value, "qwen", http.StatusOK)
	awaitKeyResponse(t, handler, manual.Value, "qwen", http.StatusForbidden)
	awaitKeyResponse(t, handler, active.Value, "kimi", http.StatusForbidden)
	newKey := createKey(t, handler, admin, `{"name":"after-recharge","user":"bob"}`)
	awaitKeyResponse(t, handler, newKey.Value, "qwen", http.StatusOK)
	wallet, err := store.Reconcile(t.Context(), "bob-uid")
	if err != nil || wallet.Balance != 90 || wallet.Balance != wallet.LedgerBalance {
		t.Fatalf("recovered wallet: %+v %v", wallet, err)
	}
}

func creditBob(t *testing.T, handler http.Handler, admin, operation, amount string) {
	t.Helper()
	body := `{"operationID":"` + operation + `","user":"bob","principalUID":"bob-uid","currency":"USD","amount":"` + amount + `","kind":"topup"}`
	if response := do(handler, "POST", "/api/billing/credits", admin, body); response.Code != http.StatusOK {
		t.Fatalf("credit: %d %s", response.Code, response.Body.String())
	}
}

func settleBobDebt(t *testing.T, store *billing.Store, keyID string) {
	t.Helper()
	event := billing.Event{SchemaVersion: 1, EventID: "debt-event", Type: "request_terminal", RequestID: "debt-request", OwnerUID: "bob-uid", WalletID: "bob-uid", APIKeyID: keyID, IdentitySource: "sdk", Model: "qwen", AttemptID: "attempt", OccurredAt: time.Now().UTC(), Reason: "completed", Usage: billing.Usage{InputTokens: 20, Complete: true, Source: "upstream_json"}}
	price := billing.Price{RuleID: "rule", Version: "v1", Model: "qwen", Currency: "USD", UnitTokens: 1, InputRate: 1}
	if err := store.Ingest(t.Context(), []billing.Event{event}, func(string) (billing.Price, bool) { return price, true }); err != nil {
		t.Fatal(err)
	}
	generation, err := store.AcquireFence(t.Context(), "settler")
	if err != nil {
		t.Fatal(err)
	}
	if count, err := store.Settle(t.Context(), generation, 100, 100); err != nil || count != 1 {
		t.Fatalf("settlement: %d %v", count, err)
	}
	wallet, err := store.Reconcile(t.Context(), "bob-uid")
	if err != nil || wallet.Balance != -10 || wallet.BillingState != "blocked" {
		encoded, _ := json.Marshal(wallet)
		t.Fatalf("negative wallet: %s %v", encoded, err)
	}
}
