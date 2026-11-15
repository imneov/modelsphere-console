package billing

import (
	"context"
	"net/url"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
)

type benchmarkQueryKey struct{}
type benchmarkQueryStart struct {
	at     time.Time
	commit bool
}
type benchmarkQueryTrace struct {
	queries     atomic.Int64
	nanos       atomic.Int64
	commits     atomic.Int64
	commitNanos atomic.Int64
}

func (trace *benchmarkQueryTrace) TraceQueryStart(ctx context.Context, _ *pgx.Conn, data pgx.TraceQueryStartData) context.Context {
	return context.WithValue(ctx, benchmarkQueryKey{}, benchmarkQueryStart{at: time.Now(), commit: strings.EqualFold(strings.TrimSpace(data.SQL), "commit")})
}

func (trace *benchmarkQueryTrace) TraceQueryEnd(ctx context.Context, _ *pgx.Conn, _ pgx.TraceQueryEndData) {
	started := ctx.Value(benchmarkQueryKey{}).(benchmarkQueryStart)
	elapsed := time.Since(started.at).Nanoseconds()
	trace.queries.Add(1)
	trace.nanos.Add(elapsed)
	if started.commit {
		trace.commits.Add(1)
		trace.commitNanos.Add(elapsed)
	}
}

func benchmarkSchema(b *testing.B, endpoint string) (string, string) {
	b.Helper()
	configuration, err := pgx.ParseConfig(endpoint)
	if err != nil {
		b.Fatal("invalid benchmark PostgreSQL DSN")
	}
	admin := stdlib.OpenDB(*configuration)
	b.Cleanup(func() {
		if err := admin.Close(); err != nil {
			b.Errorf("close schema connection: %v", err)
		}
	})
	identifier, err := uuid.NewRandom()
	if err != nil {
		b.Fatal(err)
	}
	schema := "staging_bench_" + strings.ReplaceAll(identifier.String(), "-", "")
	quoted := pgx.Identifier{schema}.Sanitize()
	if _, err := admin.ExecContext(context.Background(), "CREATE SCHEMA "+quoted); err != nil {
		b.Fatal(err)
	}
	b.Cleanup(func() {
		if _, err := admin.ExecContext(context.Background(), "DROP SCHEMA "+quoted+" CASCADE"); err != nil {
			b.Errorf("drop benchmark schema: %v", err)
		}
	})
	connection, err := url.Parse(endpoint)
	if err != nil || (connection.Scheme != "postgres" && connection.Scheme != "postgresql") {
		b.Fatal("benchmark PostgreSQL DSN must be a URL")
	}
	query := connection.Query()
	query.Set("search_path", schema)
	connection.RawQuery = query.Encode()
	return connection.String(), schema
}

func benchmarkIngestStore(b *testing.B) (*Store, *benchmarkQueryTrace) {
	b.Helper()
	endpoint, schema := benchmarkSchema(b, os.Getenv("BILLING_BENCH_POSTGRES_DSN"))
	configuration, err := pgx.ParseConfig(endpoint)
	if err != nil {
		b.Fatal("invalid isolated PostgreSQL DSN")
	}
	trace := &benchmarkQueryTrace{}
	configuration.Tracer = trace
	registered := stdlib.RegisterConnConfig(configuration)
	b.Cleanup(func() { stdlib.UnregisterConnConfig(registered) })
	store, err := Open(context.Background(), "postgres", registered, StoreOptions{Currency: "USD",
		MaxConnections: benchmarkPositiveInteger(b, "BILLING_BENCH_DB_CONNECTIONS")})
	if err != nil {
		b.Fatal(err)
	}
	b.Cleanup(func() {
		if err := store.Close(); err != nil {
			b.Errorf("close isolated benchmark store: %v", err)
		}
	})
	var actual, fsync, synchronous, fullPages string
	err = store.db.QueryRowContext(context.Background(), "SELECT current_schema(),current_setting('fsync'),current_setting('synchronous_commit'),current_setting('full_page_writes')").Scan(&actual, &fsync, &synchronous, &fullPages)
	if err != nil || actual != schema || fsync != "on" || synchronous != "on" || fullPages != "on" {
		b.Fatalf("isolated schema or durability check failed: %v", err)
	}
	if err := store.SavePrice(context.Background(), benchmarkPrice()); err != nil {
		b.Fatal(err)
	}
	return store, trace
}

func benchmarkPrice() Price {
	return Price{RuleID: "benchmark", Version: "v1", Model: "benchmark", Currency: "USD", UnitTokens: 1000000,
		InputRate: 1000000000, CacheRate: 250000000, OutputRate: 2000000000}
}

func benchmarkPriceLookup(string) (Price, bool) { return benchmarkPrice(), true }

func benchmarkIngestFacts(b *testing.B, store *Store, events int) {
	b.Helper()
	var count, requests, complete, charges, amount, ledger int64
	query := `SELECT (SELECT count(*) FROM billing_events),(SELECT count(*) FROM billing_requests),
 (SELECT count(*) FROM billing_requests WHERE complete=1 AND started_at IS NOT NULL AND terminal_at IS NOT NULL),
 (SELECT count(*) FROM billing_charges),(SELECT coalesce(sum(amount),0) FROM billing_charges),
 (SELECT count(*) FROM billing_ledger)`
	if err := store.db.QueryRowContext(context.Background(), query).Scan(&count, &requests, &complete, &charges, &amount, &ledger); err != nil {
		b.Fatal(err)
	}
	cost, err := benchmarkPrice().Amount(Usage{InputTokens: 1000, CacheTokens: 200, OutputTokens: 500, Complete: true, Source: "upstream_json"})
	if err != nil || count != int64(events) || requests != int64(events/2) || complete != requests || charges != requests || amount != charges*cost || ledger != 0 {
		b.Fatalf("incorrect isolated ingestion facts: events=%d requests=%d complete=%d charges=%d amount=%d ledger=%d err=%v", count, requests, complete, charges, amount, ledger, err)
	}
}

func BenchmarkPostgresIngest(b *testing.B) {
	if os.Getenv("BILLING_BENCH_POSTGRES_DSN") == "" {
		b.Skip("BILLING_BENCH_POSTGRES_DSN is required")
	}
	benchmarkCases(b, func(b *testing.B, size, parallelism int) {
		store, trace := benchmarkIngestStore(b)
		batches := benchmarkEvents(b, size)
		queries, queryNanos := trace.queries.Load(), trace.nanos.Load()
		commits, commitNanos := trace.commits.Load(), trace.commitNanos.Load()
		before := store.db.Stats()
		stages := &benchmarkStages{}
		stages.run(b, size, parallelism, func(index int) error {
			started := time.Now()
			err := store.Ingest(context.Background(), batches[index], benchmarkPriceLookup)
			stages.ingest.Add(time.Since(started).Nanoseconds())
			return err
		})
		if trace.queries.Load() == queries || trace.commits.Load() == commits {
			b.Fatal("PostgreSQL query tracing was inactive")
		}
		b.ReportMetric(float64(trace.queries.Load()-queries)/float64(b.N*size), "sql-calls/event")
		b.ReportMetric(float64(trace.nanos.Load()-queryNanos)/float64(b.N)/1e6, "sql-ms/batch")
		b.ReportMetric(float64(trace.commitNanos.Load()-commitNanos)/float64(trace.commits.Load()-commits)/1e6, "commit-ms/transaction")
		b.ReportMetric(float64(store.db.Stats().WaitDuration-before.WaitDuration)/float64(b.N)/1e6, "db-pool-wait-ms/batch")
		benchmarkIngestFacts(b, store, b.N*size)
	})
}
