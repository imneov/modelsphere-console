package billing

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

type benchmarkStages struct {
	consume  atomic.Int64
	ack      atomic.Int64
	release  atomic.Int64
	ingest   atomic.Int64
	total    atomic.Int64
	failures atomic.Int64
	once     sync.Once
	err      error
}

func benchmarkCases(b *testing.B, action func(*testing.B, int, int)) {
	for _, size := range benchmarkIntegerList(b, "BILLING_BENCH_BATCH_SIZES") {
		if size%2 != 0 {
			b.Fatal("benchmark batches must contain complete started/terminal pairs")
		}
		for _, parallelism := range benchmarkIntegerList(b, "BILLING_BENCH_PARALLELISMS") {
			b.Run(fmt.Sprintf("batch=%d/parallel=%d", size, parallelism), func(b *testing.B) {
				action(b, size, parallelism)
			})
		}
	}
}

func benchmarkIntegerList(b *testing.B, name string) []int {
	b.Helper()
	var values []int
	for _, text := range strings.Split(os.Getenv(name), ",") {
		value, err := strconv.Atoi(text)
		if err != nil || value < 1 || value > 4096 {
			b.Fatalf("%s must contain comma-separated values between 1 and 4096", name)
		}
		values = append(values, value)
	}
	return values
}

func benchmarkEvents(b *testing.B, size int) [][]Event {
	b.Helper()
	limit, err := strconv.Atoi(os.Getenv("BILLING_BENCH_EVENTS_LIMIT"))
	if err != nil || limit < 1 || b.N > limit/size {
		b.Fatal("benchmark fixture limit exceeded or invalid; use a bounded -test.benchtime=Nx")
	}
	identifier, err := uuid.NewRandom()
	if err != nil {
		b.Fatal(err)
	}
	batches := make([][]Event, b.N)
	at := time.Now().UTC()
	for batchIndex := range batches {
		batches[batchIndex] = make([]Event, size)
		for index := 0; index < size; index += 2 {
			request := fmt.Sprintf("%s-%d", identifier, batchIndex*size+index)
			start := Event{SchemaVersion: 1, EventID: "start/" + request, Type: "request_started", RequestID: request,
				OwnerUID: "benchmark", WalletID: "benchmark", APIKeyID: "benchmark", IdentitySource: "sdk",
				Model: "benchmark", Upstream: "benchmark", AttemptID: request, OccurredAt: at}
			terminal := start
			terminal.EventID, terminal.Type, terminal.Reason = "terminal/"+request, "request_terminal", "completed"
			terminal.OccurredAt = at.Add(time.Millisecond)
			terminal.Usage = Usage{InputTokens: 1000, CacheTokens: 200, OutputTokens: 500, Complete: true, Source: "upstream_json"}
			batches[batchIndex][index], batches[batchIndex][index+1] = start, terminal
		}
	}
	return batches
}

func benchmarkPrefill(b *testing.B, queue *RedisQueue, batches [][]Event) {
	b.Helper()
	for index, events := range batches {
		pipeline := queue.client.Pipeline()
		for _, event := range events {
			encoded, err := json.Marshal(event)
			if err != nil {
				b.Fatal(err)
			}
			pipeline.XAdd(context.Background(), &redis.XAddArgs{Stream: queue.stream(index % queue.options.Partitions),
				Values: map[string]any{"event": string(encoded)}})
		}
		if _, err := pipeline.Exec(context.Background()); err != nil {
			b.Fatal(err)
		}
	}
}

func (stages *benchmarkStages) run(b *testing.B, size, parallelism int, action func(int) error) {
	var index atomic.Int64
	b.SetParallelism(parallelism)
	b.ResetTimer()
	b.RunParallel(func(worker *testing.PB) {
		for worker.Next() {
			started := time.Now()
			if err := action(int(index.Add(1) - 1)); err != nil {
				stages.failures.Add(1)
				stages.once.Do(func() { stages.err = err })
			}
			stages.total.Add(time.Since(started).Nanoseconds())
		}
	})
	b.StopTimer()
	if stages.failures.Load() > 0 {
		b.Fatalf("%d batch failures: %v", stages.failures.Load(), stages.err)
	}
	b.ReportMetric(float64(b.N*size)/b.Elapsed().Seconds(), "events/s")
	b.ReportMetric(float64(size), "events/batch")
	b.ReportMetric(float64(runtime.GOMAXPROCS(0)*parallelism), "workers")
	for name, duration := range map[string]*atomic.Int64{"consume-ms/batch": &stages.consume, "ack-ms/batch": &stages.ack,
		"release-ms/batch": &stages.release, "ingest-ms/batch": &stages.ingest, "total-ms/batch": &stages.total} {
		if duration.Load() > 0 {
			b.ReportMetric(float64(duration.Load())/float64(b.N)/1e6, name)
		}
	}
}

func benchmarkDrained(b *testing.B, queue *RedisQueue, expected int) {
	b.Helper()
	health, err := queue.Health(context.Background())
	if err != nil || health.Pending != 0 || health.Queued != 0 || health.DeadLetters != 0 {
		b.Fatalf("benchmark queue did not drain: %+v, %v", health, err)
	}
	var length int64
	for partition := 0; partition < queue.options.Partitions; partition++ {
		count, err := queue.client.XLen(context.Background(), queue.stream(partition)).Result()
		if err != nil {
			b.Fatal(err)
		}
		length += count
		count, err = queue.client.Exists(context.Background(), queue.lease(partition)).Result()
		if err != nil || count != 0 {
			b.Fatalf("benchmark left a partition lease: %v", err)
		}
	}
	if length != int64(expected) {
		b.Fatalf("benchmark stream facts: got %d, want %d", length, expected)
	}
}
