package billing

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
)

func (store *Store) PriceHistory(ctx context.Context, filter Filter) (Page[Price], error) {
	result := Page[Price]{Items: []Price{}, Page: filter.Page, Limit: filter.Limit, Filters: filter}
	if filter.Page < 1 || filter.Page > 10000000 || filter.Limit < 1 || filter.Limit > 200 {
		return result, errors.New("invalid price history pagination")
	}
	query, arguments := " FROM billing_prices", []any{}
	if filter.Model != "" {
		query += " WHERE model=?"
		arguments = append(arguments, filter.Model)
	}
	transaction, err := store.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true, Isolation: sql.LevelSerializable})
	if err != nil {
		return result, err
	}
	defer transaction.Rollback()
	if err := transaction.QueryRowContext(ctx, store.bind("SELECT COUNT(*)"+query), arguments...).Scan(&result.TotalItems); err != nil {
		return result, err
	}
	arguments = append(arguments, filter.Limit, (filter.Page-1)*filter.Limit)
	rows, err := transaction.QueryContext(ctx, store.bind("SELECT payload"+query+" ORDER BY observed_at DESC,rule_id,version LIMIT ? OFFSET ?"), arguments...)
	if err != nil {
		return result, err
	}
	for rows.Next() {
		var payload string
		var price Price
		if err := rows.Scan(&payload); err != nil {
			_ = rows.Close()
			return result, err
		}
		if err := json.Unmarshal([]byte(payload), &price); err != nil {
			_ = rows.Close()
			return result, err
		}
		result.Items = append(result.Items, price)
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return result, err
	}
	if err := rows.Close(); err != nil {
		return result, err
	}
	return result, transaction.Commit()
}
