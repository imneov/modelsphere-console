package billing

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
)

type Wallet struct {
	AdmissionState    string `json:"admissionState,omitempty"`
	AdmissionRevision int64  `json:"admissionRevision,omitempty"`
	OwnerUID          string `json:"ownerUserID"`
	Currency          string `json:"currency"`
	Balance           int64  `json:"balance,string"`
	LedgerBalance     int64  `json:"ledgerBalance,string"`
	Revision          int64  `json:"revision"`
	BillingState      string `json:"billingState"`
}

type Credit struct {
	OperationID string `json:"operationID"`
	OwnerUID    string `json:"ownerUserID"`
	Currency    string `json:"currency"`
	Amount      int64  `json:"amount,string"`
	Kind        string `json:"kind"`
	Actor       string `json:"actor"`
}

func fingerprint(value any) (string, string, error) {
	encoded, err := json.Marshal(value)
	if err != nil {
		return "", "", err
	}
	digest := sha256.Sum256(encoded)
	return hex.EncodeToString(digest[:]), string(encoded), nil
}

func (store *Store) Wallet(ctx context.Context, ownerUID, currency string) (Wallet, error) {
	wallet := Wallet{OwnerUID: ownerUID, Currency: currency}
	err := store.db.QueryRowContext(ctx, store.bind("SELECT currency,balance,revision FROM billing_wallets WHERE owner_uid=?"), ownerUID).Scan(&wallet.Currency, &wallet.Balance, &wallet.Revision)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return Wallet{}, fmt.Errorf("read wallet: %w", err)
	}
	wallet.BillingState = store.billingState(wallet.Balance)
	return wallet, nil
}

func (store *Store) billingState(balance int64) string {
	if balance <= store.threshold {
		return "blocked"
	}
	return "allowed"
}

func (store *Store) lockWallet(ctx context.Context, transaction *sql.Tx, ownerUID, currency string) (Wallet, error) {
	query := "INSERT INTO billing_wallets(owner_uid,currency) VALUES(?,?) ON CONFLICT(owner_uid) DO NOTHING"
	if _, err := transaction.ExecContext(ctx, store.bind(query), ownerUID, currency); err != nil {
		return Wallet{}, err
	}
	query = "SELECT currency,balance,revision FROM billing_wallets WHERE owner_uid=?"
	if store.dialect == "postgres" {
		query += " FOR UPDATE"
	}
	wallet := Wallet{OwnerUID: ownerUID}
	if err := transaction.QueryRowContext(ctx, store.bind(query), ownerUID).Scan(&wallet.Currency, &wallet.Balance, &wallet.Revision); err != nil {
		return Wallet{}, err
	}
	if wallet.Currency != currency {
		return Wallet{}, fmt.Errorf("%w: wallet currency mismatch", ErrConflict)
	}
	return wallet, nil
}

func (store *Store) Credit(ctx context.Context, credit Credit) (Wallet, error) {
	if credit.OperationID == "" || credit.OwnerUID == "" || credit.Actor == "" || !validCurrency(credit.Currency) || (store.currency != "" && credit.Currency != store.currency) || credit.Amount == 0 || (credit.Kind != "topup" && credit.Kind != "adjustment") || (credit.Kind == "topup" && credit.Amount < 0) {
		return Wallet{}, errors.New("operation ID, owner, actor, currency and a valid nonzero amount are required")
	}
	hash, _, err := fingerprint(credit)
	if err != nil {
		return Wallet{}, err
	}
	var result Wallet
	err = store.transaction(ctx, func(transaction *sql.Tx) error {
		wallet, err := store.lockWallet(ctx, transaction, credit.OwnerUID, credit.Currency)
		if err != nil {
			return err
		}
		var previous string
		err = transaction.QueryRowContext(ctx, store.bind("SELECT payload_hash FROM billing_ledger WHERE operation_id=?"), credit.OperationID).Scan(&previous)
		if err == nil {
			if previous != hash {
				return ErrConflict
			}
			result = wallet
			return nil
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		result, err = store.appendLedger(ctx, transaction, wallet, credit, hash, nil)
		return err
	})
	if err != nil {
		return Wallet{}, fmt.Errorf("credit wallet: %w", err)
	}
	result.BillingState = store.billingState(result.Balance)
	return result, nil
}

func (store *Store) appendLedger(ctx context.Context, transaction *sql.Tx, wallet Wallet, credit Credit, hash string, chargeID *string) (Wallet, error) {
	if (credit.Amount > 0 && wallet.Balance > math.MaxInt64-credit.Amount) || (credit.Amount < 0 && wallet.Balance < math.MinInt64-credit.Amount) || wallet.Revision == math.MaxInt64 {
		return Wallet{}, errors.New("wallet amount or revision overflows")
	}
	wallet.Balance += credit.Amount
	wallet.Revision++
	query := "INSERT INTO billing_ledger(operation_id,owner_uid,currency,amount,kind,actor,charge_id,revision,occurred_at,payload_hash) VALUES(?,?,?,?,?,?,?,?,?,?)"
	if _, err := transaction.ExecContext(ctx, store.bind(query), credit.OperationID, credit.OwnerUID, credit.Currency, credit.Amount, credit.Kind, credit.Actor, chargeID, wallet.Revision, time.Now().UnixNano(), hash); err != nil {
		var postgresError *pgconn.PgError
		if (errors.As(err, &postgresError) && postgresError.Code == "23505") || strings.Contains(err.Error(), "UNIQUE constraint failed: billing_ledger") {
			return Wallet{}, fmt.Errorf("%w: ledger operation already exists", ErrConflict)
		}
		return Wallet{}, err
	}
	if _, err := transaction.ExecContext(ctx, store.bind("UPDATE billing_wallets SET balance=?,revision=? WHERE owner_uid=?"), wallet.Balance, wallet.Revision, wallet.OwnerUID); err != nil {
		return Wallet{}, err
	}
	query = "INSERT INTO billing_projection(owner_uid,revision,state,updated_at) VALUES(?,?,?,?) ON CONFLICT(owner_uid) DO UPDATE SET revision=excluded.revision,state=excluded.state,updated_at=excluded.updated_at"
	if _, err := transaction.ExecContext(ctx, store.bind(query), wallet.OwnerUID, wallet.Revision, store.billingState(wallet.Balance), time.Now().UnixNano()); err != nil {
		return Wallet{}, err
	}
	return wallet, nil
}

// Reconcile compares the query projection with immutable ledger facts without mutating either.
func (store *Store) Reconcile(ctx context.Context, ownerUID string) (Wallet, error) {
	wallet := Wallet{OwnerUID: ownerUID}
	query := "SELECT currency,balance,revision,(SELECT COALESCE(SUM(amount),0) FROM billing_ledger WHERE owner_uid=?) FROM billing_wallets WHERE owner_uid=?"
	err := store.db.QueryRowContext(ctx, store.bind(query), ownerUID, ownerUID).Scan(&wallet.Currency, &wallet.Balance, &wallet.Revision, &wallet.LedgerBalance)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return Wallet{}, fmt.Errorf("reconcile wallet ledger: %w", err)
	}
	wallet.BillingState = store.billingState(wallet.Balance)
	return wallet, nil
}
