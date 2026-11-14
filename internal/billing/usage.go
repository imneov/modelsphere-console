package billing

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"time"
)

type PriceLookup func(string) (Price, bool)

func nowNanos() int64 { return time.Now().UnixNano() }

func (store *Store) Ingest(ctx context.Context, events []Event, prices PriceLookup) error {
	if len(events) == 0 {
		return nil
	}
	for _, event := range events {
		if err := event.Validate(); err != nil {
			return err
		}
	}
	pending := false
	err := store.transaction(ctx, func(transaction *sql.Tx) error {
		pending = false
		for _, event := range events {
			if err := store.saveEvent(ctx, transaction, event); err != nil {
				return err
			}
			if err := store.updateRequest(ctx, transaction, event); err != nil {
				return err
			}
			if err := store.priceRequest(ctx, transaction, event.RequestID, prices); err != nil {
				if !errors.Is(err, ErrPriceMissing) {
					return err
				}
				pending = true
			}
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("persist usage batch: %w", err)
	}
	if pending {
		return ErrPriceMissing
	}
	return nil
}

func (store *Store) saveEvent(ctx context.Context, transaction *sql.Tx, event Event) error {
	hash, payload, err := fingerprint(event)
	if err != nil {
		return err
	}
	query := "INSERT INTO billing_events(event_id,request_id,owner_uid,event_type,occurred_at,payload_hash,payload) VALUES(?,?,?,?,?,?,?) ON CONFLICT(event_id) DO NOTHING"
	if _, err := transaction.ExecContext(ctx, store.bind(query), event.EventID, event.RequestID, event.OwnerUID, event.Type, event.OccurredAt.UnixNano(), hash, payload); err != nil {
		return err
	}
	var stored string
	if err := transaction.QueryRowContext(ctx, store.bind("SELECT payload_hash FROM billing_events WHERE event_id=?"), event.EventID).Scan(&stored); err != nil {
		return err
	}
	if stored != hash {
		return fmt.Errorf("%w: event %s payload differs", ErrConflict, event.EventID)
	}
	return nil
}

func (store *Store) updateRequest(ctx context.Context, transaction *sql.Tx, event Event) error {
	query := "INSERT INTO billing_requests(request_id,owner_uid,wallet_id,api_key_id,identity_source,model,upstream,attempt_id) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(request_id) DO NOTHING"
	if _, err := transaction.ExecContext(ctx, store.bind(query), event.RequestID, event.OwnerUID, event.WalletID, event.APIKeyID, event.IdentitySource, event.Model, event.Upstream, event.AttemptID); err != nil {
		return err
	}
	request, err := store.requestInTransaction(ctx, transaction, event.RequestID)
	if err != nil {
		return err
	}
	if request.OwnerUID != event.OwnerUID || request.WalletID != event.WalletID || request.APIKeyID != event.APIKeyID || request.IdentitySource != event.IdentitySource || request.Model != event.Model || request.Upstream != event.Upstream {
		return fmt.Errorf("%w: request ownership or model differs", ErrConflict)
	}
	switch event.Type {
	case "request_started":
		_, err = transaction.ExecContext(ctx, store.bind("UPDATE billing_requests SET started_at=COALESCE(started_at,?) WHERE request_id=?"), event.OccurredAt.UnixNano(), event.RequestID)
	case "request_terminal":
		err = store.saveTerminal(ctx, transaction, request, event)
	case "usage_supplement":
		if request.TerminalAt == nil {
			_, err = transaction.ExecContext(ctx, store.bind("UPDATE billing_requests SET terminal_at=?,reason='upstream_reconciled' WHERE request_id=?"), event.OccurredAt.UnixNano(), event.RequestID)
		}
	}
	if err != nil {
		return err
	}
	if event.Usage.Complete {
		if request.Usage.Complete && !sameTokenCounts(request.Usage, event.Usage) {
			return fmt.Errorf("%w: verified usage already exists", ErrConflict)
		}
		if request.Usage.Complete {
			return nil
		}
		_, payload, err := fingerprint(event.Usage)
		if err != nil {
			return err
		}
		_, err = transaction.ExecContext(ctx, store.bind("UPDATE billing_requests SET usage_json=?,complete=1 WHERE request_id=?"), payload, event.RequestID)
		return err
	}
	return nil
}

func sameTokenCounts(left, right Usage) bool {
	return left.InputTokens == right.InputTokens && left.CacheTokens == right.CacheTokens && left.OutputTokens == right.OutputTokens && left.Complete == right.Complete
}

func (store *Store) requestInTransaction(ctx context.Context, transaction *sql.Tx, id string) (Request, error) {
	query := "SELECT owner_uid,wallet_id,api_key_id,identity_source,model,upstream,attempt_id,terminal_at,reason,usage_json,upstream_request_id,attempts_json FROM billing_requests WHERE request_id=?"
	if store.dialect == "postgres" {
		query += " FOR UPDATE"
	}
	request := Request{RequestID: id}
	var terminal sql.NullInt64
	var usage, attempts string
	err := transaction.QueryRowContext(ctx, store.bind(query), id).Scan(&request.OwnerUID, &request.WalletID, &request.APIKeyID, &request.IdentitySource, &request.Model, &request.Upstream, &request.AttemptID, &terminal, &request.Reason, &usage, &request.UpstreamRequestID, &attempts)
	if err != nil {
		return Request{}, err
	}
	if terminal.Valid {
		at := time.Unix(0, terminal.Int64).UTC()
		request.TerminalAt = &at
	}
	if err := json.Unmarshal([]byte(usage), &request.Usage); err != nil {
		return Request{}, err
	}
	if err := json.Unmarshal([]byte(attempts), &request.Attempts); err != nil {
		return Request{}, err
	}
	return request, nil
}

func (store *Store) priceRequest(ctx context.Context, transaction *sql.Tx, id string, prices PriceLookup) error {
	request, err := store.requestInTransaction(ctx, transaction, id)
	if err != nil {
		return err
	}
	if !request.Usage.Complete || request.TerminalAt == nil {
		return nil
	}
	var existing string
	err = transaction.QueryRowContext(ctx, store.bind("SELECT charge_id FROM billing_charges WHERE request_id=? AND charge_revision=1"), id).Scan(&existing)
	if err == nil {
		return nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	price, found := Price{}, false
	if prices != nil {
		price, found = prices(request.Model)
	}
	var walletCurrency string
	walletError := transaction.QueryRowContext(ctx, store.bind("SELECT currency FROM billing_wallets WHERE owner_uid=?"), request.OwnerUID).Scan(&walletCurrency)
	if walletError != nil && !errors.Is(walletError, sql.ErrNoRows) {
		return walletError
	}
	if !found || price.Model != request.Model || (store.currency != "" && price.Currency != store.currency) || (walletCurrency != "" && price.Currency != walletCurrency) {
		if _, err := transaction.ExecContext(ctx, store.bind("UPDATE billing_requests SET pricing_error=? WHERE request_id=?"), ErrPriceMissing.Error(), id); err != nil {
			return err
		}
		return ErrPriceMissing
	}
	if err := store.archivePrice(ctx, transaction, price); err != nil {
		return err
	}
	return store.createCharge(ctx, transaction, request, price)
}

func (store *Store) createCharge(ctx context.Context, transaction *sql.Tx, request Request, price Price) error {
	amount, err := price.Amount(request.Usage)
	if err != nil {
		return err
	}
	_, priceJSON, err := fingerprint(price)
	if err != nil {
		return err
	}
	_, usageJSON, err := fingerprint(request.Usage)
	if err != nil {
		return err
	}
	query := "INSERT INTO billing_charges(charge_id,request_id,owner_uid,currency,amount,price_json,usage_json,state,created_at) VALUES(?,?,?,?,?,?,?,'pending',?) ON CONFLICT(request_id,charge_revision) DO NOTHING"
	if _, err := transaction.ExecContext(ctx, store.bind(query), "charge/"+request.RequestID, request.RequestID, request.OwnerUID, price.Currency, amount, priceJSON, usageJSON, nowNanos()); err != nil {
		return err
	}
	_, err = transaction.ExecContext(ctx, store.bind("UPDATE billing_requests SET pricing_error='' WHERE request_id=?"), request.RequestID)
	return err
}

func (store *Store) saveTerminal(ctx context.Context, transaction *sql.Tx, request Request, event Event) error {
	if request.TerminalAt != nil && request.Reason != "upstream_reconciled" && (!request.TerminalAt.Equal(event.OccurredAt) || request.Reason != event.Reason || request.AttemptID != event.AttemptID || request.UpstreamRequestID != event.UpstreamRequestID || !slices.Equal(request.Attempts, event.Attempts)) {
		return fmt.Errorf("%w: logical request already terminated", ErrConflict)
	}
	_, attemptsJSON, encodeError := fingerprint(event.Attempts)
	if encodeError != nil {
		return encodeError
	}
	_, err := transaction.ExecContext(ctx, store.bind("UPDATE billing_requests SET terminal_at=COALESCE(terminal_at,?),reason=?,upstream_request_id=?,attempt_id=?,attempts_json=? WHERE request_id=?"), event.OccurredAt.UnixNano(), event.Reason, event.UpstreamRequestID, event.AttemptID, attemptsJSON, event.RequestID)
	return err
}
