package billing_test

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/modelsphere/console/internal/billing"
)

func redisURL(t *testing.T) string {
	t.Helper()
	executable, err := exec.LookPath("redis-server")
	if err != nil {
		t.Skip("redis-server is not installed")
	}
	directory, err := os.MkdirTemp("", "billing-redis-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := os.RemoveAll(directory); err != nil {
			t.Error(err)
		}
	})
	socket := filepath.Join(directory, "redis.sock")
	ctx, cancel := context.WithCancel(t.Context())
	process := exec.CommandContext(ctx, executable, "--port", "0", "--unixsocket", socket, "--save", "", "--appendonly", "no")
	process.Env = append(os.Environ(), "LC_ALL=C", "LANG=C")
	if err := process.Start(); err != nil {
		cancel()
		t.Fatal(err)
	}
	t.Cleanup(func() { cancel(); _ = process.Wait() })
	return "unix://" + socket
}

func TestRedisPendingRecoveryPreservesEventsAndSafeTrimming(t *testing.T) {
	queue, err := billing.NewRedisQueue(billing.RedisOptions{URL: redisURL(t), Prefix: "test-billing", Partitions: 2, Group: "usage", LeaseDuration: time.Second * 10})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := queue.Close(); err != nil {
			t.Error(err)
		}
	})
	event := billing.Event{SchemaVersion: 1, EventID: "start-redis", Type: "request_started", RequestID: "request-redis", OwnerUID: "alice", WalletID: "alice", IdentitySource: "session", Model: "qwen", AttemptID: "attempt-redis", OccurredAt: time.Now().UTC()}
	deadline := time.Now().Add(3 * time.Second)
	for {
		err = queue.Publish(t.Context(), event)
		if err == nil {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal(err)
		}
		time.Sleep(time.Millisecond)
	}
	batch, err := queue.Consume(t.Context(), "worker-a", 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(batch.Messages) != 1 {
		t.Fatalf("delivery: %+v", batch)
	}
	if err := queue.Release(t.Context(), batch); err != nil {
		t.Fatal(err)
	}
	batch, err = queue.Consume(t.Context(), "worker-b", 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(batch.Messages) != 1 || batch.Messages[0].Event.EventID != "start-redis" {
		t.Fatalf("pending recovery: %+v", batch)
	}
	if err := queue.Trim(t.Context()); err != nil {
		t.Fatal(err)
	}
	if err := queue.Ack(t.Context(), batch); err != nil {
		t.Fatal(err)
	}
	if err := queue.Release(t.Context(), batch); err != nil {
		t.Fatal(err)
	}
}
