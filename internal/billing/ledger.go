package billing

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"
)

type LedgerEntry struct {
	OperationID string    `json:"operationID"`
	OwnerUID    string    `json:"ownerUserID"`
	Currency    string    `json:"currency"`
	Amount      int64     `json:"amount,string"`
	Kind        string    `json:"kind"`
	Actor       string    `json:"actor"`
	ChargeID    string    `json:"chargeID,omitempty"`
	Revision    int64     `json:"revision"`
	OccurredAt  time.Time `json:"occurredAt"`
}

func (store *Store) Ledger(ctx context.Context, filter Filter) (Page[LedgerEntry], error) {
	where, arguments, err := filter.where()
	if err != nil {
		return Page[LedgerEntry]{}, err
	}
	where = strings.ReplaceAll(where, "r.owner_uid", "l.owner_uid")
	where = strings.ReplaceAll(where, "COALESCE(r.started_at,r.terminal_at)", "l.occurred_at")
	query := " FROM billing_ledger l LEFT JOIN billing_charges c ON l.charge_id=c.charge_id LEFT JOIN billing_requests r ON c.request_id=r.request_id WHERE " + where
	page := Page[LedgerEntry]{Items: []LedgerEntry{}, Page: filter.Page, Limit: filter.Limit, Filters: filter}
	transaction, err := store.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true, Isolation: sql.LevelSerializable})
	if err != nil {
		return page, err
	}
	defer transaction.Rollback()
	if err := transaction.QueryRowContext(ctx, store.bind("SELECT COUNT(*)"+query), arguments...).Scan(&page.TotalItems); err != nil {
		return page, err
	}
	arguments = append(arguments, filter.Limit, (filter.Page-1)*filter.Limit)
	rows, err := transaction.QueryContext(ctx, store.bind("SELECT l.operation_id,l.owner_uid,l.currency,l.amount,l.kind,l.actor,l.charge_id,l.revision,l.occurred_at"+query+" ORDER BY l.revision DESC LIMIT ? OFFSET ?"), arguments...)
	if err != nil {
		return page, err
	}
	defer rows.Close()
	for rows.Next() {
		var entry LedgerEntry
		var charge sql.NullString
		var occurred int64
		if err := rows.Scan(&entry.OperationID, &entry.OwnerUID, &entry.Currency, &entry.Amount, &entry.Kind, &entry.Actor, &charge, &entry.Revision, &occurred); err != nil {
			return page, err
		}
		entry.ChargeID = charge.String
		entry.OccurredAt = time.Unix(0, occurred).UTC()
		page.Items = append(page.Items, entry)
	}
	if err := rows.Err(); err != nil {
		return page, err
	}
	if err := rows.Close(); err != nil {
		return page, err
	}
	if err := transaction.Commit(); err != nil {
		return page, fmt.Errorf("commit ledger query snapshot: %w", err)
	}
	return page, nil
}
