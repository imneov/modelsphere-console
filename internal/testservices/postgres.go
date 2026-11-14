package testservices

import (
	"context"
	"database/sql"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
)

// PostgresDSN isolates every contract test in its own schema without changing other data.
func PostgresDSN(test *testing.T) string {
	test.Helper()
	dsn := os.Getenv("BILLING_TEST_POSTGRES_DSN")
	if dsn == "" {
		test.Skip("set BILLING_TEST_POSTGRES_DSN to run the real PostgreSQL contract")
	}
	configuration, err := pgx.ParseConfig(dsn)
	if err != nil {
		test.Fatal("invalid PostgreSQL test configuration")
	}
	database, err := sql.Open("pgx", dsn)
	if err != nil {
		test.Fatal("open PostgreSQL test connection failed")
	}
	schema := "billing_test_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	quoted := pgx.Identifier{schema}.Sanitize()
	if _, err := database.ExecContext(test.Context(), "CREATE SCHEMA "+quoted); err != nil {
		_ = database.Close()
		test.Fatal(err)
	}
	test.Cleanup(func() {
		if _, err := database.ExecContext(context.Background(), "DROP SCHEMA "+quoted+" CASCADE"); err != nil {
			test.Error(err)
		}
		if err := database.Close(); err != nil {
			test.Error(err)
		}
	})
	configuration.RuntimeParams["search_path"] = schema
	registered := stdlib.RegisterConnConfig(configuration)
	test.Cleanup(func() { stdlib.UnregisterConnConfig(registered) })
	return registered
}
