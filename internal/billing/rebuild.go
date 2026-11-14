package billing

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

func (store *Store) RebuildWallet(ctx context.Context, owner string) (Wallet, error) {
	var result Wallet
	err := store.transaction(ctx, func(transaction *sql.Tx) error {
		query := "SELECT currency FROM billing_wallets WHERE owner_uid=?"
		if store.dialect == "postgres" {
			query += " FOR UPDATE"
		}
		result = Wallet{OwnerUID: owner}
		if err := transaction.QueryRowContext(ctx, store.bind(query), owner).Scan(&result.Currency); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return ErrNotFound
			}
			return err
		}
		query = "SELECT COALESCE(SUM(amount),0),COALESCE(MAX(revision),0) FROM billing_ledger WHERE owner_uid=?"
		if err := transaction.QueryRowContext(ctx, store.bind(query), owner).Scan(&result.Balance, &result.Revision); err != nil {
			return err
		}
		result.LedgerBalance, result.BillingState = result.Balance, store.billingState(result.Balance)
		if _, err := transaction.ExecContext(ctx, store.bind("UPDATE billing_wallets SET balance=?,revision=? WHERE owner_uid=?"), result.Balance, result.Revision, owner); err != nil {
			return err
		}
		query = "INSERT INTO billing_projection(owner_uid,revision,state,delivered_revision,updated_at) VALUES(?,?,?,-1,?) ON CONFLICT(owner_uid) DO UPDATE SET revision=excluded.revision,state=excluded.state,delivered_revision=-1,updated_at=excluded.updated_at"
		_, err := transaction.ExecContext(ctx, store.bind(query), owner, result.Revision, result.BillingState, time.Now().UnixNano())
		return err
	})
	return result, err
}
