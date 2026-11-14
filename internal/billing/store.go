package billing

import (
	"context"
	"database/sql"
	_ "embed"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgconn"

	_ "github.com/jackc/pgx/v5/stdlib"
	_ "modernc.org/sqlite"
)

var (
	ErrConflict = errors.New("billing operation conflicts with existing fact")
	ErrNotFound = errors.New("billing fact not found")
	ErrFenced   = errors.New("settlement leadership generation expired")
)

//go:embed schema.sql
var schemaSQL string

type Store struct {
	Metrics   *Telemetry
	db        *sql.DB
	dialect   string
	threshold int64
	currency  string
}

type StoreOptions struct {
	Currency           string
	AdmissionThreshold int64
	MaxConnections     int
}

func Open(ctx context.Context, dialect, dsn string, options ...StoreOptions) (*Store, error) {
	store, err := OpenLazy(dialect, dsn, options...)
	if err != nil {
		return nil, err
	}
	if err := store.Initialize(ctx); err != nil {
		return nil, errors.Join(err, store.Close())
	}
	return store, nil
}

func OpenLazy(dialect, dsn string, options ...StoreOptions) (*Store, error) {
	driver := dialect
	if dialect == "postgres" {
		driver = "pgx"
	}
	if dialect != "postgres" && dialect != "sqlite" {
		return nil, fmt.Errorf("unsupported billing store %q", dialect)
	}
	settings := StoreOptions{MaxConnections: 20}
	if len(options) > 1 {
		return nil, errors.New("only one billing store policy is allowed")
	}
	if len(options) == 1 {
		settings = options[0]
		if settings.MaxConnections == 0 {
			settings.MaxConnections = 20
		}
	}
	if settings.Currency != "" && !validCurrency(settings.Currency) {
		return nil, errors.New("billing currency must be a three-letter uppercase code")
	}
	if settings.MaxConnections < 1 {
		return nil, errors.New("billing connection limit must be positive")
	}
	if dialect == "sqlite" {
		dsn = sqliteConnectionString(dsn)
	}
	database, err := sql.Open(driver, dsn)
	if err != nil {
		return nil, errors.New("open billing database failed")
	}
	database.SetConnMaxLifetime(30 * time.Minute)
	database.SetMaxOpenConns(settings.MaxConnections)
	if dialect == "sqlite" {
		database.SetMaxOpenConns(1)
		database.SetConnMaxLifetime(0)
	}
	return &Store{db: database, dialect: dialect, threshold: settings.AdmissionThreshold, currency: settings.Currency}, nil
}

func sqliteConnectionString(dsn string) string {
	if strings.HasPrefix(dsn, "file:") {
		return dsn
	}
	connection := url.URL{Scheme: "file", Path: dsn}
	query := url.Values{}
	for _, pragma := range []string{"journal_mode(WAL)", "busy_timeout(5000)", "foreign_keys(1)"} {
		query.Add("_pragma", pragma)
	}
	connection.RawQuery = query.Encode()
	return connection.String()
}

func (store *Store) Initialize(ctx context.Context) error { return store.initialize(ctx) }

func (store *Store) initialize(ctx context.Context) error {
	if err := store.db.PingContext(ctx); err != nil {
		var parseError *pgconn.ParseConfigError
		if errors.As(err, &parseError) {
			return errors.New("invalid billing PostgreSQL connection configuration")
		}
		return fmt.Errorf("connect billing database: %w", err)
	}
	if store.dialect == "sqlite" {
		for _, query := range []string{"PRAGMA journal_mode=WAL", "PRAGMA busy_timeout=5000", "PRAGMA foreign_keys=ON"} {
			if _, err := store.db.ExecContext(ctx, query); err != nil {
				return fmt.Errorf("configure SQLite: %w", err)
			}
		}
	}
	transaction, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin billing migration: %w", err)
	}
	defer transaction.Rollback()
	if store.dialect == "postgres" {
		if _, err := transaction.ExecContext(ctx, "SELECT pg_advisory_xact_lock(hashtext('gateway.modelsphere.io/billing-schema'))"); err != nil {
			return fmt.Errorf("lock billing schema migration: %w", err)
		}
	}
	if _, err := transaction.ExecContext(ctx, schemaSQL); err != nil {
		return fmt.Errorf("migrate billing schema: %w", err)
	}
	if err := transaction.Commit(); err != nil {
		return fmt.Errorf("commit billing migration: %w", err)
	}
	return nil
}

func (store *Store) Close() error { return store.db.Close() }

// bind only receives static SQL owned by this package.
func (store *Store) bind(query string) string {
	if store.dialect != "postgres" {
		return query
	}
	position := 0
	var result strings.Builder
	for _, character := range query {
		if character != '?' {
			result.WriteRune(character)
			continue
		}
		position++
		fmt.Fprintf(&result, "$%d", position)
	}
	return result.String()
}

func (store *Store) transaction(ctx context.Context, action func(*sql.Tx) error) (result error) {
	started := time.Now()
	defer func() { store.Metrics.observe("transaction", started, result) }()
	for attempt := 0; attempt < 5; attempt++ {
		transaction, err := store.db.BeginTx(ctx, nil)
		if err != nil {
			return fmt.Errorf("begin billing transaction: %w", err)
		}
		err = action(transaction)
		if err == nil {
			err = transaction.Commit()
		} else {
			_ = transaction.Rollback()
		}
		if err == nil {
			return nil
		}
		_ = transaction.Rollback()
		if !retryable(err) || attempt == 4 {
			return err
		}
		timer := time.NewTimer(time.Duration(attempt+1) * 10 * time.Millisecond)
		select {
		case <-ctx.Done():
			timer.Stop()
			return ctx.Err()
		case <-timer.C:
		}
	}
	return errors.New("billing transaction retry exhausted")
}

func retryable(err error) bool {
	var state interface{ SQLState() string }
	if errors.As(err, &state) {
		return state.SQLState() == "40001" || state.SQLState() == "40P01"
	}
	return strings.Contains(err.Error(), "SQLITE_BUSY") || strings.Contains(err.Error(), "database is locked")
}
