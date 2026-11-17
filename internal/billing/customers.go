package billing

import (
	"context"
	"errors"
	"fmt"
	"time"
)

// CustomerWallet is one row in the administrator's customer overview.
// Movement totals cover [from, until); balance is the current wallet value.
type CustomerWallet struct {
	OwnerUID     string `json:"ownerUserID"`
	Currency     string `json:"currency"`
	Balance      int64  `json:"balance,string"`
	Revision     int64  `json:"revision"`
	BillingState string `json:"billingState"`
	Topups       int64  `json:"topups,string"`
	Charges      int64  `json:"charges,string"`
	Adjustments  int64  `json:"adjustments,string"`
	Net          int64  `json:"net,string"`
}

func (store *Store) CustomerWallets(ctx context.Context, from, until time.Time) ([]CustomerWallet, error) {
	if from.IsZero() || until.IsZero() || !from.Before(until) {
		return nil, errors.New("customer overview requires a positive time window")
	}
	query := `SELECT w.owner_uid,w.currency,w.balance,w.revision,
 COALESCE(SUM(CASE WHEN l.kind='topup' AND l.occurred_at>=? AND l.occurred_at<? THEN l.amount ELSE 0 END),0),
 COALESCE(SUM(CASE WHEN l.kind='charge' AND l.occurred_at>=? AND l.occurred_at<? THEN l.amount ELSE 0 END),0),
 COALESCE(SUM(CASE WHEN l.kind='adjustment' AND l.occurred_at>=? AND l.occurred_at<? THEN l.amount ELSE 0 END),0),
 COALESCE(SUM(CASE WHEN l.occurred_at>=? AND l.occurred_at<? THEN l.amount ELSE 0 END),0)
 FROM billing_wallets w
 LEFT JOIN billing_ledger l ON l.owner_uid=w.owner_uid
 GROUP BY w.owner_uid,w.currency,w.balance,w.revision
 ORDER BY w.owner_uid`
	rows, err := store.db.QueryContext(ctx, store.bind(query),
		from.UnixNano(), until.UnixNano(),
		from.UnixNano(), until.UnixNano(),
		from.UnixNano(), until.UnixNano(),
		from.UnixNano(), until.UnixNano(),
	)
	if err != nil {
		return nil, fmt.Errorf("list customer wallets: %w", err)
	}
	defer rows.Close()
	result := []CustomerWallet{}
	for rows.Next() {
		var wallet CustomerWallet
		if err := rows.Scan(&wallet.OwnerUID, &wallet.Currency, &wallet.Balance, &wallet.Revision, &wallet.Topups, &wallet.Charges, &wallet.Adjustments, &wallet.Net); err != nil {
			return nil, fmt.Errorf("scan customer wallet: %w", err)
		}
		wallet.BillingState = store.billingState(wallet.Balance)
		result = append(result, wallet)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate customer wallets: %w", err)
	}
	return result, nil
}
