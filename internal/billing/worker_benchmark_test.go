package billing

import (
	"context"
	"log/slog"
	"os"
	"runtime"
	"testing"
	"time"
)

func BenchmarkUsageWorkerFlush(b *testing.B) {
	endpoint := os.Getenv("BILLING_BENCH_REDIS_URL")
	if endpoint == "" || os.Getenv("BILLING_BENCH_POSTGRES_DSN") == "" {
		b.Skip("Redis and PostgreSQL benchmark endpoints are required")
	}
	benchmarkCases(b, func(b *testing.B, size, parallelism int) {
		queue := benchmarkQueue(b, endpoint, 0, benchmarkPositiveInteger(b, "BILLING_BENCH_PARTITIONS"))
		store, _ := benchmarkIngestStore(b)
		benchmarkPrefill(b, queue, benchmarkEvents(b, size))
		worker := &UsageWorker{Queue: queue, Store: store, Prices: benchmarkPriceLookup,
			Options: WorkerOptions{Consumer: "benchmark", FlushInterval: 5 * time.Second, PollInterval: 100 * time.Millisecond,
				MaxEvents: int64(size), MaxBytes: 4194304, Concurrency: runtime.GOMAXPROCS(0) * parallelism}, Log: slog.New(slog.NewJSONHandler(os.Stderr, nil))}
		stages := &benchmarkStages{}
		stages.run(b, size, parallelism, func(int) error { return worker.FlushOnce(context.Background()) })
		if worker.committed.Load() != uint64(b.N*size) {
			b.Fatalf("worker committed %d events, want %d", worker.committed.Load(), b.N*size)
		}
		benchmarkDrained(b, queue, b.N*size)
		benchmarkIngestFacts(b, store, b.N*size)
	})
}
