package server

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"path/filepath"
	"testing"
	"time"

	"github.com/modelsphere/console/internal/billing"
)

func billingServer(t *testing.T) (*Server, *billing.Store, *billing.AdmissionProjector) {
	t.Helper()
	server := crdInferenceServer(t)
	store, err := billing.Open(t.Context(), "sqlite", filepath.Join(t.TempDir(), "billing.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := store.Close(); err != nil {
			t.Error(err)
		}
	})
	journal, err := billing.OpenJournal(t.Context(), billing.JournalOptions{Directory: t.TempDir(), SegmentBytes: 4096, MaxBytes: 65536, SyncMode: "record"})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := journal.Close(); err != nil {
			t.Error(err)
		}
	})
	log := slog.New(slog.DiscardHandler)
	service := &billing.Service{Store: store, Meter: &billing.Meter{Journal: journal, FailurePolicy: "continue", PublishTimeout: time.Second, Log: log}, Client: server.kube.Dynamic(), Namespace: "console", Currency: "USD"}
	if err := server.EnableBilling(service); err != nil {
		t.Fatal(err)
	}
	projector, err := billing.NewAdmissionProjector(t.Context(), server.kube.Dynamic(), "console", store, log)
	if err != nil {
		t.Fatal(err)
	}
	return server, store, projector
}

func TestBillingCreditAndQueriesEnforceCanonicalOwnerIsolation(t *testing.T) {
	server, _, projector := billingServer(t)
	handler := server.Handler()
	admin, bob := login(t, handler, "admin", "admin-pw"), login(t, handler, "bob", "bob-pw")
	body := `{"operationID":"topup-1","user":"bob","principalUID":"bob-uid","currency":"USD","amount":"2000000000","kind":"topup"}`
	if response := do(handler, "POST", "/api/billing/credits", bob, body); response.Code != http.StatusForbidden {
		t.Fatalf("self credit: %d", response.Code)
	}
	for range 2 {
		if response := do(handler, "POST", "/api/billing/credits", admin, body); response.Code != http.StatusOK {
			t.Fatalf("credit: %d %s", response.Code, response.Body.String())
		}
	}
	response := do(handler, "GET", "/api/billing/wallet", bob, "")
	var wallet billing.Wallet
	if err := json.Unmarshal(response.Body.Bytes(), &wallet); err != nil {
		t.Fatal(err)
	}
	if response.Code != http.StatusOK || wallet.Balance != 2000000000 || wallet.OwnerUID != "bob-uid" {
		t.Fatalf("wallet: %d %+v", response.Code, wallet)
	}
	if response := do(handler, "GET", "/api/billing/wallet?ownerUserID=admin-uid", bob, ""); response.Code != http.StatusForbidden {
		t.Fatalf("cross-user query: %d", response.Code)
	}
	if err := projector.ProjectPending(t.Context(), 100); err != nil {
		t.Fatal(err)
	}
	key := createKey(t, handler, admin, `{"name":"bob","user":"bob"}`)
	awaitKeyResponse(t, handler, key.Value, "qwen", http.StatusOK)
	if response := do(handler, "POST", "/api/llm/v1/chat/completions", admin, `{"model":"qwen"}`); response.Code != http.StatusPaymentRequired {
		t.Fatalf("session bypassed its empty wallet: %d", response.Code)
	}
}
