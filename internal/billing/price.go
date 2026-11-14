package billing

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"math/big"
)

var ErrPriceVersionConflict = errors.New("immutable price version conflicts with archived content")

var ErrPriceMissing = errors.New("usage is persisted but awaits a compatible price")

type Price struct {
	RuleID     string `json:"ruleID"`
	Version    string `json:"priceVersion"`
	Model      string `json:"model"`
	Currency   string `json:"currency"`
	UnitTokens int64  `json:"unitTokens"`
	InputRate  int64  `json:"inputRate,string"`
	CacheRate  int64  `json:"cacheRate,string"`
	OutputRate int64  `json:"outputRate,string"`
}

func (price Price) Validate() error {
	if price.RuleID == "" || price.Version == "" || price.Model == "" || price.UnitTokens <= 0 || price.InputRate < 0 || price.CacheRate < 0 || price.OutputRate < 0 {
		return errors.New("price requires a version, model, positive token unit and nonnegative rates")
	}
	if !validCurrency(price.Currency) {
		return errors.New("price currency must be a three-letter uppercase code")
	}
	return nil
}

// Amount rounds the combined exact charge up once to a currency nanounit.
func (price Price) Amount(usage Usage) (int64, error) {
	if err := price.Validate(); err != nil {
		return 0, err
	}
	if err := usage.Validate(); err != nil {
		return 0, err
	}
	if !usage.Complete {
		return 0, errors.New("incomplete usage cannot be priced")
	}
	total := new(big.Int)
	for _, term := range [][2]int64{{usage.InputTokens - usage.CacheTokens, price.InputRate}, {usage.CacheTokens, price.CacheRate}, {usage.OutputTokens, price.OutputRate}} {
		total.Add(total, new(big.Int).Mul(big.NewInt(term[0]), big.NewInt(term[1])))
	}
	quotient, remainder := new(big.Int), new(big.Int)
	quotient.QuoRem(total, big.NewInt(price.UnitTokens), remainder)
	if remainder.Sign() != 0 {
		quotient.Add(quotient, big.NewInt(1))
	}
	if !quotient.IsInt64() {
		return 0, errors.New("charge amount overflows")
	}
	return quotient.Int64(), nil
}

func (store *Store) SavePrice(ctx context.Context, price Price) error {
	if err := price.Validate(); err != nil {
		return err
	}
	return store.transaction(ctx, func(transaction *sql.Tx) error { return store.archivePrice(ctx, transaction, price) })
}

func (store *Store) archivePrice(ctx context.Context, transaction *sql.Tx, price Price) error {
	hash, payload, err := fingerprint(price)
	if err != nil {
		return err
	}
	query := "INSERT INTO billing_prices(rule_id,version,model,observed_at,payload_hash,payload) VALUES(?,?,?,?,?,?) ON CONFLICT(rule_id,version) DO NOTHING"
	if _, err := transaction.ExecContext(ctx, store.bind(query), price.RuleID, price.Version, price.Model, nowNanos(), hash, payload); err != nil {
		return fmt.Errorf("archive price: %w", err)
	}
	var existing string
	if err := transaction.QueryRowContext(ctx, store.bind("SELECT payload_hash FROM billing_prices WHERE rule_id=? AND version=?"), price.RuleID, price.Version).Scan(&existing); err != nil {
		return err
	}
	if existing != hash {
		return fmt.Errorf("%w: %w: price version %s has different content", ErrPriceVersionConflict, ErrConflict, price.Version)
	}
	return nil
}

func validCurrency(currency string) bool {
	if len(currency) != 3 {
		return false
	}
	for _, character := range currency {
		if character < 'A' || character > 'Z' {
			return false
		}
	}
	return true
}
