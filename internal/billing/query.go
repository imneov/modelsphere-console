package billing

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

type Charge struct {
	Revision  int64      `json:"chargeRevision"`
	ID        string     `json:"id"`
	Amount    int64      `json:"amount,string"`
	Currency  string     `json:"currency"`
	Price     Price      `json:"price"`
	Usage     Usage      `json:"usage"`
	State     string     `json:"state"`
	CreatedAt time.Time  `json:"createdAt"`
	SettledAt *time.Time `json:"settledAt,omitempty"`
}

type Request struct {
	Attempts          []Attempt  `json:"attempts,omitempty"`
	RequestID         string     `json:"requestID"`
	OwnerUID          string     `json:"ownerUserID"`
	WalletID          string     `json:"walletID"`
	APIKeyID          string     `json:"apiKeyID"`
	IdentitySource    string     `json:"identitySource"`
	Model             string     `json:"model"`
	Upstream          string     `json:"upstream"`
	AttemptID         string     `json:"attemptID"`
	UpstreamRequestID string     `json:"upstreamRequestID,omitempty"`
	StartedAt         *time.Time `json:"startedAt,omitempty"`
	TerminalAt        *time.Time `json:"terminalAt,omitempty"`
	Reason            string     `json:"reason"`
	Usage             Usage      `json:"usage"`
	PricingError      string     `json:"pricingError,omitempty"`
	Charge            *Charge    `json:"charge,omitempty"`
}

type Filter struct {
	OwnerUID  string     `json:"ownerUserID"`
	Model     string     `json:"model,omitempty"`
	APIKeyID  string     `json:"apiKeyID,omitempty"`
	RequestID string     `json:"requestID,omitempty"`
	State     string     `json:"state,omitempty"`
	From      *time.Time `json:"from,omitempty"`
	Until     *time.Time `json:"until,omitempty"`
	Page      int        `json:"page"`
	Limit     int        `json:"limit"`
}

// States a usage filter can select. They mirror what the request row shows:
// a charge's state when there is one, otherwise started (no terminal time) or
// failed (terminated without a charge).
var usageStates = map[string]bool{"": true, "settled": true, "pending": true, "started": true, "failed": true}

// ValidUsageState reports whether a request filter can select that state.
func ValidUsageState(state string) bool {
	return usageStates[state]
}

func chargeExists(state string) string {
	query := "EXISTS (SELECT 1 FROM billing_charges sc WHERE sc.request_id=r.request_id AND sc.charge_revision=1"
	if state != "" {
		query += " AND sc.state='" + state + "'"
	}
	return query + ")"
}

type Page[T any] struct {
	Items      []T    `json:"items"`
	TotalItems int64  `json:"totalItems"`
	Page       int    `json:"page"`
	Limit      int    `json:"limit"`
	Filters    Filter `json:"filters"`
}

func (filter Filter) where() (string, []any, error) {
	return filter.whereWithState(true)
}

// whereWithState builds the request predicates. Summaries need the same scope
// without the selected state so every tab still gets a count.
func (filter Filter) whereWithState(withState bool) (string, []any, error) {
	if filter.OwnerUID == "" || filter.Page < 1 || filter.Limit < 1 || filter.Limit > 200 || filter.Page > 10000000 {
		return "", nil, errors.New("owner, positive page and limit between 1 and 200 are required")
	}
	if !usageStates[filter.State] {
		return "", nil, fmt.Errorf("unsupported state %q", filter.State)
	}
	clauses := []string{"r.owner_uid=?"}
	arguments := []any{filter.OwnerUID}
	for _, field := range []struct{ column, value string }{{"r.model", filter.Model}, {"r.api_key_id", filter.APIKeyID}, {"r.request_id", filter.RequestID}} {
		if field.value != "" {
			clauses = append(clauses, field.column+"=?")
			arguments = append(arguments, field.value)
		}
	}
	if withState && filter.State != "" {
		switch filter.State {
		case "settled", "pending":
			clauses = append(clauses, chargeExists(filter.State))
		case "started":
			clauses = append(clauses, "NOT "+chargeExists("")+" AND r.terminal_at IS NULL")
		case "failed":
			clauses = append(clauses, "NOT "+chargeExists("")+" AND r.terminal_at IS NOT NULL")
		}
	}
	if filter.From != nil {
		clauses = append(clauses, "COALESCE(r.started_at,r.terminal_at)>=?")
		arguments = append(arguments, filter.From.UnixNano())
	}
	if filter.Until != nil {
		clauses = append(clauses, "COALESCE(r.started_at,r.terminal_at)<?")
		arguments = append(arguments, filter.Until.UnixNano())
	}
	if filter.From != nil && filter.Until != nil && !filter.From.Before(*filter.Until) {
		return "", nil, errors.New("from must precede until")
	}
	return strings.Join(clauses, " AND "), arguments, nil
}

func (store *Store) Requests(ctx context.Context, filter Filter) (Page[Request], error) {
	where, arguments, err := filter.where()
	if err != nil {
		return Page[Request]{}, err
	}
	result := Page[Request]{Items: []Request{}, Page: filter.Page, Limit: filter.Limit, Filters: filter}
	transaction, err := store.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true, Isolation: sql.LevelSerializable})
	if err != nil {
		return result, err
	}
	defer transaction.Rollback()
	if err := transaction.QueryRowContext(ctx, store.bind("SELECT COUNT(*) FROM billing_requests r WHERE "+where), arguments...).Scan(&result.TotalItems); err != nil {
		return result, err
	}
	query := `SELECT r.request_id,r.owner_uid,r.wallet_id,r.api_key_id,r.identity_source,r.model,r.upstream,r.attempt_id,r.upstream_request_id,r.started_at,r.terminal_at,r.reason,r.usage_json,r.pricing_error,r.attempts_json,
 c.charge_id,c.charge_revision,c.amount,c.currency,c.price_json,c.usage_json,c.state,c.created_at,c.settled_at FROM billing_requests r LEFT JOIN billing_charges c ON r.request_id=c.request_id AND c.charge_revision=1 WHERE ` + where + ` ORDER BY COALESCE(r.started_at,r.terminal_at) DESC,r.request_id LIMIT ? OFFSET ?`
	arguments = append(arguments, filter.Limit, (filter.Page-1)*filter.Limit)
	rows, err := transaction.QueryContext(ctx, store.bind(query), arguments...)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		request, err := scanRequest(rows)
		if err != nil {
			return result, err
		}
		result.Items = append(result.Items, request)
	}
	if err := rows.Err(); err != nil {
		return result, err
	}
	if err := rows.Close(); err != nil {
		return result, err
	}
	if err := transaction.Commit(); err != nil {
		return result, err
	}
	return result, nil
}

func scanRequest(row *sql.Rows) (Request, error) {
	var request Request
	var start, terminal, amount, created, settled, revision sql.NullInt64
	var chargeID, currency, priceJSON, chargeUsage, state sql.NullString
	var usageJSON, attemptsJSON string
	err := row.Scan(&request.RequestID, &request.OwnerUID, &request.WalletID, &request.APIKeyID, &request.IdentitySource, &request.Model, &request.Upstream, &request.AttemptID, &request.UpstreamRequestID, &start, &terminal, &request.Reason, &usageJSON, &request.PricingError, &attemptsJSON, &chargeID, &revision, &amount, &currency, &priceJSON, &chargeUsage, &state, &created, &settled)
	if err != nil {
		return Request{}, err
	}
	request.StartedAt, request.TerminalAt = optionalTime(start), optionalTime(terminal)
	if err := json.Unmarshal([]byte(attemptsJSON), &request.Attempts); err != nil {
		return Request{}, err
	}
	if err := json.Unmarshal([]byte(usageJSON), &request.Usage); err != nil {
		return Request{}, fmt.Errorf("decode request usage: %w", err)
	}
	if chargeID.Valid {
		request.Charge = &Charge{ID: chargeID.String, Revision: revision.Int64, Amount: amount.Int64, Currency: currency.String, State: state.String, CreatedAt: time.Unix(0, created.Int64).UTC(), SettledAt: optionalTime(settled)}
		if err := json.Unmarshal([]byte(priceJSON.String), &request.Charge.Price); err != nil {
			return Request{}, err
		}
		if err := json.Unmarshal([]byte(chargeUsage.String), &request.Charge.Usage); err != nil {
			return Request{}, err
		}
	}
	return request, nil
}

func optionalTime(value sql.NullInt64) *time.Time {
	if !value.Valid {
		return nil
	}
	at := time.Unix(0, value.Int64).UTC()
	return &at
}
