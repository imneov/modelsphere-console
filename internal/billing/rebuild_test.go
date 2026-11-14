package billing_test

import (
	"database/sql"
	"path/filepath"
	"testing"

	"github.com/modelsphere/console/internal/billing"
)

func TestRebuildRestoresProjectionWithoutChangingImmutableLedger(t *testing.T) {
	path := filepath.Join(t.TempDir(), "rebuild.db")
	store, err := billing.Open(t.Context(), "sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := store.Close(); err != nil {
			t.Error(err)
		}
	})
	credit := billing.Credit{OperationID: "topup", OwnerUID: "alice", Currency: "USD", Amount: 2000, Actor: "admin", Kind: "topup"}
	if _, err := store.Credit(t.Context(), credit); err != nil {
		t.Fatal(err)
	}
	connection, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := connection.Close(); err != nil {
			t.Error(err)
		}
	})
	if _, err := connection.ExecContext(t.Context(), "UPDATE billing_wallets SET balance=-123,revision=99 WHERE owner_uid='alice'"); err != nil {
		t.Fatal(err)
	}
	for range 2 {
		wallet, err := store.RebuildWallet(t.Context(), "alice")
		if err != nil {
			t.Fatal(err)
		}
		if wallet.Balance != 2000 || wallet.Revision != 1 || wallet.LedgerBalance != 2000 || wallet.BillingState != "allowed" {
			t.Fatalf("rebuilt wallet: %+v", wallet)
		}
	}
	entries, err := store.Ledger(t.Context(), billing.Filter{OwnerUID: "alice", Page: 1, Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if entries.TotalItems != 1 || entries.Items[0].Amount != 2000 {
		t.Fatalf("immutable ledger changed: %+v", entries)
	}
	projections, err := store.Projections(t.Context(), 10)
	if err != nil || len(projections) != 1 || projections[0].Revision != 1 {
		t.Fatalf("rebuild did not queue recovered admission: %+v %v", projections, err)
	}
}

func TestPublicCreditCannotOccupySettlementOperationNamespace(t *testing.T) {
	store, err := billing.Open(t.Context(), "sqlite", filepath.Join(t.TempDir(), "reserved.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := store.Close(); err != nil {
			t.Error(err)
		}
	})
	credit := billing.Credit{OperationID: "settle/future-charge", OwnerUID: "alice", Currency: "USD", Amount: 2000, Actor: "admin", Kind: "topup"}
	if _, err := store.Credit(t.Context(), credit); err == nil {
		t.Fatal("public credit occupied settlement namespace")
	}
	wallet, err := store.Wallet(t.Context(), "alice", "USD")
	if err != nil {
		t.Fatal(err)
	}
	if wallet.Balance != 0 || wallet.Revision != 0 {
		t.Fatalf("invalid credit changed wallet: %+v", wallet)
	}
}
