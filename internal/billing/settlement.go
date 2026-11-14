package billing

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"math"
	"time"
)

func (store *Store) AcquireFence(ctx context.Context, holder string) (int64, error) {
	if holder == "" {
		return 0, errors.New("settlement holder is required")
	}
	var generation int64
	err := store.transaction(ctx, func(transaction *sql.Tx) error {
		query := "SELECT generation FROM billing_fence WHERE singleton=1"
		if store.dialect == "postgres" {
			query += " FOR UPDATE"
		}
		if err := transaction.QueryRowContext(ctx, query).Scan(&generation); err != nil {
			return err
		}
		if generation == math.MaxInt64 {
			return errors.New("settlement generation exhausted")
		}
		generation++
		_, err := transaction.ExecContext(ctx, store.bind("UPDATE billing_fence SET generation=?,holder=? WHERE singleton=1"), generation, holder)
		return err
	})
	return generation, err
}

func (store *Store) Settle(ctx context.Context, generation int64, maxWallets, maxCharges int) (count int, result error) {
	started := time.Now()
	defer func() { store.Metrics.observe("settlement", started, result) }()
	if generation < 1 || maxWallets < 1 || maxCharges < 1 {
		return 0, errors.New("positive leadership generation and settlement limits are required")
	}
	err := store.transaction(ctx, func(transaction *sql.Tx) error {
		count = 0
		query := "SELECT generation FROM billing_fence WHERE singleton=1"
		if store.dialect == "postgres" {
			query += " FOR UPDATE"
		}
		var current int64
		if err := transaction.QueryRowContext(ctx, query).Scan(&current); err != nil {
			return err
		}
		if current != generation {
			return ErrFenced
		}
		owners, err := store.pendingOwners(ctx, transaction, maxWallets)
		if err != nil {
			return err
		}
		for _, owner := range owners {
			settled, err := store.settleWallet(ctx, transaction, owner, maxCharges)
			if err != nil {
				return err
			}
			count += settled
		}
		return nil
	})
	if err != nil {
		return 0, fmt.Errorf("settle pending charges: %w", err)
	}
	return count, nil
}

func (store *Store) pendingOwners(ctx context.Context, transaction *sql.Tx, limit int) ([]string, error) {
	rows, err := transaction.QueryContext(ctx, store.bind("SELECT DISTINCT owner_uid FROM billing_charges WHERE state='pending' ORDER BY owner_uid LIMIT ?"), limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	owners := []string{}
	for rows.Next() {
		var owner string
		if err := rows.Scan(&owner); err != nil {
			return nil, err
		}
		owners = append(owners, owner)
	}
	return owners, rows.Err()
}

type pendingCharge struct {
	id, currency string
	amount       int64
}

func (store *Store) settleWallet(ctx context.Context, transaction *sql.Tx, owner string, limit int) (int, error) {
	rows, err := transaction.QueryContext(ctx, store.bind("SELECT charge_id,currency,amount FROM billing_charges WHERE owner_uid=? AND state='pending' ORDER BY created_at,charge_id LIMIT ?"), owner, limit)
	if err != nil {
		return 0, err
	}
	charges := []pendingCharge{}
	for rows.Next() {
		var charge pendingCharge
		if err := rows.Scan(&charge.id, &charge.currency, &charge.amount); err != nil {
			_ = rows.Close()
			return 0, err
		}
		charges = append(charges, charge)
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return 0, err
	}
	if err := rows.Close(); err != nil {
		return 0, err
	}
	if len(charges) == 0 {
		return 0, nil
	}
	wallet, err := store.lockWallet(ctx, transaction, owner, charges[0].currency)
	if err != nil {
		return 0, err
	}
	for _, charge := range charges {
		if charge.currency != wallet.Currency {
			return 0, fmt.Errorf("%w: charge currency differs from wallet", ErrConflict)
		}
		credit := Credit{OperationID: "settle/" + charge.id, OwnerUID: owner, Currency: charge.currency, Amount: -charge.amount, Kind: "charge", Actor: "settlement"}
		hash, _, err := fingerprint(credit)
		if err != nil {
			return 0, err
		}
		wallet, err = store.appendLedger(ctx, transaction, wallet, credit, hash, &charge.id)
		if err != nil {
			return 0, err
		}
		if _, err := transaction.ExecContext(ctx, store.bind("UPDATE billing_charges SET state='settled',settled_at=? WHERE charge_id=? AND state='pending'"), nowNanos(), charge.id); err != nil {
			return 0, err
		}
	}
	return len(charges), nil
}
