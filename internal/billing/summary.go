package billing

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
)

// UsageStates counts the rows behind each settlement tab. They are computed
// without the selected state so every tab keeps a count while one is active.
type UsageStates struct {
	Settled int64 `json:"settled"`
	Pending int64 `json:"pending"`
	Started int64 `json:"started"`
	Failed  int64 `json:"failed"`
}

// UsageSummary is the aggregate behind the request page's stat cards.
type UsageSummary struct {
	Requests     int64       `json:"requests"`
	InputTokens  int64       `json:"inputTokens"`
	CacheTokens  int64       `json:"cacheTokens"`
	OutputTokens int64       `json:"outputTokens"`
	States       UsageStates `json:"states"`
}

// LedgerSummary is the aggregate behind the wallet page's stat cards. Amounts
// are nanounits, string-encoded like every other money field on the wire;
// charges are negative because they leave the wallet.
type LedgerSummary struct {
	Topups      int64 `json:"topups,string"`
	Charges     int64 `json:"charges,string"`
	Adjustments int64 `json:"adjustments,string"`
	Net         int64 `json:"net,string"`
}

// SummarizeUsage aggregates the same filtered scope as Requests. Token totals
// come from the usage JSON, which both supported stores can extract.
func (store *Store) SummarizeUsage(ctx context.Context, filter Filter) (UsageSummary, error) {
	where, arguments, err := filter.where()
	if err != nil {
		return UsageSummary{}, err
	}
	baseWhere, baseArguments, err := filter.whereWithState(false)
	if err != nil {
		return UsageSummary{}, err
	}
	transaction, err := store.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true, Isolation: sql.LevelSerializable})
	if err != nil {
		return UsageSummary{}, err
	}
	defer transaction.Rollback()
	var result UsageSummary
	query := "SELECT COUNT(*)," + store.jsonIntSum("r.usage_json", "inputTokens") + "," +
		store.jsonIntSum("r.usage_json", "cacheTokens") + "," + store.jsonIntSum("r.usage_json", "outputTokens") +
		" FROM billing_requests r WHERE " + where
	if err := transaction.QueryRowContext(ctx, store.bind(query), arguments...).
		Scan(&result.Requests, &result.InputTokens, &result.CacheTokens, &result.OutputTokens); err != nil {
		return UsageSummary{}, err
	}
	states := "SELECT" +
		" COALESCE(SUM(CASE WHEN " + chargeExists("settled") + " THEN 1 ELSE 0 END),0)," +
		" COALESCE(SUM(CASE WHEN " + chargeExists("pending") + " THEN 1 ELSE 0 END),0)," +
		" COALESCE(SUM(CASE WHEN NOT " + chargeExists("") + " AND r.terminal_at IS NULL THEN 1 ELSE 0 END),0)," +
		" COALESCE(SUM(CASE WHEN NOT " + chargeExists("") + " AND r.terminal_at IS NOT NULL THEN 1 ELSE 0 END),0)" +
		" FROM billing_requests r WHERE " + baseWhere
	if err := transaction.QueryRowContext(ctx, store.bind(states), baseArguments...).
		Scan(&result.States.Settled, &result.States.Pending, &result.States.Started, &result.States.Failed); err != nil {
		return UsageSummary{}, err
	}
	if err := transaction.Commit(); err != nil {
		return UsageSummary{}, fmt.Errorf("commit usage summary snapshot: %w", err)
	}
	return result, nil
}

// SummarizeLedger totals wallet movements for the same filters the ledger table
// accepts. Request-scoped filters reach the ledger through its charge join.
func (store *Store) SummarizeLedger(ctx context.Context, filter Filter) (LedgerSummary, error) {
	filter.State = ""
	where, arguments, err := filter.where()
	if err != nil {
		return LedgerSummary{}, err
	}
	where = strings.ReplaceAll(where, "r.owner_uid", "l.owner_uid")
	where = strings.ReplaceAll(where, "COALESCE(r.started_at,r.terminal_at)", "l.occurred_at")
	query := "SELECT" +
		" COALESCE(SUM(CASE WHEN l.kind='topup' THEN l.amount ELSE 0 END),0)," +
		" COALESCE(SUM(CASE WHEN l.kind='charge' THEN l.amount ELSE 0 END),0)," +
		" COALESCE(SUM(CASE WHEN l.kind='adjustment' THEN l.amount ELSE 0 END),0)," +
		" COALESCE(SUM(l.amount),0)" +
		" FROM billing_ledger l LEFT JOIN billing_charges c ON l.charge_id=c.charge_id" +
		" LEFT JOIN billing_requests r ON c.request_id=r.request_id WHERE " + where
	var result LedgerSummary
	if err := store.db.QueryRowContext(ctx, store.bind(query), arguments...).
		Scan(&result.Topups, &result.Charges, &result.Adjustments, &result.Net); err != nil {
		return LedgerSummary{}, err
	}
	return result, nil
}

// jsonIntSum totals a nonnegative integer field across the filtered rows. The
// key is a package constant, never request input.
func (store *Store) jsonIntSum(column, key string) string {
	if store.dialect == "postgres" {
		return fmt.Sprintf("COALESCE(SUM((%s::jsonb->>'%s')::bigint),0)", column, key)
	}
	return fmt.Sprintf("COALESCE(SUM(json_extract(%s,'$.%s')),0)", column, key)
}
