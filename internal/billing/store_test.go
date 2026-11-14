package billing_test

import (
	"errors"
	"path/filepath"
	"testing"

	"github.com/modelsphere/console/internal/billing"
)

func TestWalletCreditIsIdempotentAndRebuildsFromLedger(t *testing.T) {
	store, err := billing.Open(t.Context(), "sqlite", filepath.Join(t.TempDir(), "billing.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := store.Close(); err != nil {
			t.Error(err)
		}
	})
	credit := billing.Credit{OperationID: "topup-1", OwnerUID: "alice-uid", Currency: "USD", Amount: 2000000000, Actor: "admin", Kind: "topup"}
	for range 2 {
		wallet, err := store.Credit(t.Context(), credit)
		if err != nil {
			t.Fatal(err)
		}
		if wallet.Balance != 2000000000 || wallet.Revision != 1 {
			t.Fatalf("duplicate credit changed balance: %+v", wallet)
		}
	}
	credit.Amount = 3000000000
	if _, err := store.Credit(t.Context(), credit); !errors.Is(err, billing.ErrConflict) {
		t.Fatalf("conflicting operation: %v", err)
	}
	wallet, err := store.Reconcile(t.Context(), "alice-uid")
	if err != nil {
		t.Fatal(err)
	}
	if wallet.Balance != 2000000000 || wallet.LedgerBalance != wallet.Balance || wallet.Revision != 1 {
		t.Fatalf("ledger reconciliation: %+v", wallet)
	}
	other, err := store.Wallet(t.Context(), "bob-uid", "USD")
	if err != nil {
		t.Fatal(err)
	}
	if other.Balance != 0 {
		t.Fatalf("wallet isolation: %+v", other)
	}
}
