package server

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"
)

func TestWalletShowsObservedAdmissionSeparatelyFromCreditedBalance(t *testing.T) {
	server, _, projector := billingServer(t)
	handler := server.Handler()
	admin, bob := login(t, handler, "admin", "admin-pw"), login(t, handler, "bob", "bob-pw")
	creditBob(t, handler, admin, "admission-lag", "1000000000")
	before := readWalletAdmission(t, handler, bob)
	if before.Balance != "1000000000" || before.BillingState != "allowed" || before.AdmissionState != "unknown" {
		t.Fatalf("desired balance was mistaken for observed admission: %+v", before)
	}
	if err := projector.ProjectPending(t.Context(), 100); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(3 * time.Second)
	for {
		wallet := readWalletAdmission(t, handler, bob)
		if wallet.AdmissionState == "allowed" && wallet.AdmissionRevision == 1 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("observed admission did not update: %+v", wallet)
		}
		time.Sleep(time.Millisecond)
	}
}

type walletAdmissionView struct {
	Balance           string `json:"balance"`
	BillingState      string `json:"billingState"`
	AdmissionState    string `json:"admissionState"`
	AdmissionRevision int64  `json:"admissionRevision"`
}

func readWalletAdmission(t *testing.T, handler http.Handler, token string) walletAdmissionView {
	t.Helper()
	response := do(handler, "GET", "/api/billing/wallet", token, "")
	if response.Code != http.StatusOK {
		t.Fatalf("wallet: %d %s", response.Code, response.Body.String())
	}
	var wallet walletAdmissionView
	if err := json.Unmarshal(response.Body.Bytes(), &wallet); err != nil {
		t.Fatal(err)
	}
	return wallet
}
