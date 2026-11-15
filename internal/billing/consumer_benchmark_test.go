package billing

import (
	"context"
	"errors"
	"fmt"
	"os"
	"testing"
	"time"
)

func BenchmarkRedisQueueConsumeAck(b *testing.B) {
	endpoint := os.Getenv("BILLING_BENCH_REDIS_URL")
	if endpoint == "" {
		b.Skip("BILLING_BENCH_REDIS_URL is required")
	}
	benchmarkCases(b, func(b *testing.B, size, parallelism int) {
		queue := benchmarkQueue(b, endpoint, 0, benchmarkPositiveInteger(b, "BILLING_BENCH_PARTITIONS"))
		benchmarkPrefill(b, queue, benchmarkEvents(b, size))
		before := queue.client.PoolStats()
		stages := &benchmarkStages{}
		stages.run(b, size, parallelism, func(index int) error {
			return benchmarkConsumeAck(queue, size, fmt.Sprintf("benchmark-%d", index), stages)
		})
		after := queue.client.PoolStats()
		b.ReportMetric(float64(after.WaitDurationNs-before.WaitDurationNs)/float64(b.N)/1e6, "pool-wait-ms/batch")
		benchmarkDrained(b, queue, b.N*size)
	})
}

func benchmarkConsumeAck(queue *RedisQueue, size int, consumer string, stages *benchmarkStages) (result error) {
	started := time.Now()
	batch, err := queue.Consume(context.Background(), consumer, int64(size))
	stages.consume.Add(time.Since(started).Nanoseconds())
	if err != nil {
		return err
	}
	defer func() {
		started := time.Now()
		result = errors.Join(result, queue.Release(context.Background(), batch))
		stages.release.Add(time.Since(started).Nanoseconds())
	}()
	if len(batch.Messages) != size {
		return fmt.Errorf("incomplete benchmark batch: got %d, want %d", len(batch.Messages), size)
	}
	started = time.Now()
	err = queue.Ack(context.Background(), batch)
	stages.ack.Add(time.Since(started).Nanoseconds())
	return err
}
