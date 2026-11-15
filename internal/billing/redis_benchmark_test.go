package billing

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
)

func BenchmarkRedisQueuePublish(b *testing.B) {
	endpoint := os.Getenv("BILLING_BENCH_REDIS_URL")
	if endpoint == "" {
		b.Skip("BILLING_BENCH_REDIS_URL is required")
	}
	parallelism := benchmarkPositiveInteger(b, "BILLING_BENCH_PARALLELISM")
	partitions := benchmarkPositiveInteger(b, "BILLING_BENCH_PARTITIONS")
	for _, text := range strings.Split(os.Getenv("BILLING_BENCH_POOL_SIZES"), ",") {
		poolSize, err := strconv.Atoi(text)
		if err != nil || poolSize < 0 || poolSize > 4096 {
			b.Fatal("BILLING_BENCH_POOL_SIZES must contain comma-separated sizes from 0 through 4096")
		}
		b.Run(fmt.Sprintf("pool=%d", poolSize), func(b *testing.B) {
			benchmarkQueuePublish(b, endpoint, poolSize, parallelism, partitions)
		})
	}
}

func benchmarkPositiveInteger(b *testing.B, name string) int {
	b.Helper()
	value, err := strconv.Atoi(os.Getenv(name))
	if err != nil || value < 1 || value > 4096 {
		b.Fatalf("%s must be between 1 and 4096", name)
	}
	return value
}

func benchmarkQueue(b *testing.B, endpoint string, poolSize, partitions int) *RedisQueue {
	b.Helper()
	parsed, err := url.Parse(endpoint)
	if err != nil {
		b.Fatal("invalid benchmark Redis URL")
	}
	if poolSize > 0 {
		query := parsed.Query()
		query.Set("pool_size", strconv.Itoa(poolSize))
		parsed.RawQuery = query.Encode()
	}
	identifier, err := uuid.NewRandom()
	if err != nil {
		b.Fatal(err)
	}
	queue, err := NewRedisQueue(RedisOptions{URL: parsed.String(), Prefix: "staging:queuebench:" + identifier.String(),
		Partitions: partitions, Group: "benchmark", LeaseDuration: 30 * time.Second})
	if err != nil {
		b.Fatal(err)
	}
	b.Cleanup(func() {
		keys := []string{queue.options.Prefix + ":partitions", queue.options.Prefix + ":dead"}
		for partition := range partitions {
			keys = append(keys, queue.stream(partition), queue.lease(partition),
				fmt.Sprintf("%s:reclaim:%s:%d", queue.options.Prefix, queue.options.Group, partition))
		}
		if err := queue.client.Del(context.Background(), keys...).Err(); err != nil {
			b.Errorf("clean benchmark streams: %v", err)
		}
		if err := queue.Close(); err != nil {
			b.Errorf("close benchmark queue: %v", err)
		}
	})
	if err := queue.initialize(context.Background()); err != nil {
		b.Fatal(err)
	}
	return queue
}

func benchmarkQueuePublish(b *testing.B, endpoint string, poolSize, parallelism, partitions int) {
	queue := benchmarkQueue(b, endpoint, poolSize, partitions)
	identifier, err := uuid.NewRandom()
	if err != nil {
		b.Fatal(err)
	}
	// A fixed valid envelope isolates publication from identity generation and consumers.
	event := Event{SchemaVersion: 1, EventID: identifier.String(), RequestID: identifier.String(),
		Type: "request_started", OwnerUID: "benchmark", WalletID: "benchmark", APIKeyID: "benchmark",
		IdentitySource: "sdk", Model: "benchmark", Upstream: "benchmark", AttemptID: identifier.String(), OccurredAt: time.Now().UTC()}
	var latency atomic.Int64
	var failures atomic.Uint64
	var firstError error
	var recordError sync.Once
	before := queue.client.PoolStats()
	b.SetParallelism(parallelism)
	b.ResetTimer()
	b.RunParallel(func(worker *testing.PB) {
		for worker.Next() {
			started := time.Now()
			if err := queue.Publish(context.Background(), event); err != nil {
				failures.Add(1)
				recordError.Do(func() { firstError = err })
			}
			latency.Add(time.Since(started).Nanoseconds())
		}
	})
	b.StopTimer()
	after := queue.client.PoolStats()
	b.ReportMetric(float64(b.N)/b.Elapsed().Seconds(), "events/s")
	b.ReportMetric(float64(latency.Load())/float64(b.N)/1e6, "publish-ms/op")
	b.ReportMetric(float64(after.WaitDurationNs-before.WaitDurationNs)/float64(b.N)/1e6, "pool-wait-ms/op")
	b.ReportMetric(float64(after.WaitCount-before.WaitCount)/float64(b.N), "pool-waits/op")
	b.ReportMetric(float64(queue.client.Options().PoolSize), "pool-size")
	b.ReportMetric(float64(after.TotalConns), "connections")
	b.ReportMetric(float64(runtime.GOMAXPROCS(0)*parallelism), "workers")
	if failures.Load() != 0 {
		b.Fatalf("%d publication failures: %v", failures.Load(), firstError)
	}
}
