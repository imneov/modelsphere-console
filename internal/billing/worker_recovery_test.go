package billing_test

import (
	"errors"
	"log/slog"
	"path/filepath"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/modelsphere/console/internal/billing"
	"github.com/modelsphere/console/internal/testservices"
	"github.com/redis/go-redis/v9"
)

type recoveryFixture struct {
	store  *billing.Store
	queue  *billing.RedisQueue
	client *redis.Client
	worker *billing.UsageWorker
	prefix string
}

func recoveryWorker(t *testing.T) recoveryFixture {
	t.Helper()
	url, prefix := testservices.RedisURL(t), "recovery-"+uuid.NewString()
	queue, err := billing.NewRedisQueue(billing.RedisOptions{URL: url, Prefix: prefix, Partitions: 1, Group: "usage", LeaseDuration: 10 * time.Second})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := queue.Close(); err != nil {
			t.Error(err)
		}
	})
	store, err := billing.Open(t.Context(), "sqlite", filepath.Join(t.TempDir(), "recovery.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := store.Close(); err != nil {
			t.Error(err)
		}
	})
	connection, err := redis.ParseURL(url)
	if err != nil {
		t.Fatal(err)
	}
	client := redis.NewClient(connection)
	t.Cleanup(func() {
		if err := client.Close(); err != nil {
			t.Error(err)
		}
	})
	worker := &billing.UsageWorker{Queue: queue, Store: store, Prices: func(string) (billing.Price, bool) { return billing.Price{}, false }, Log: slog.New(slog.DiscardHandler), Options: billing.WorkerOptions{Consumer: "worker", FlushInterval: time.Second, PollInterval: time.Millisecond, MaxEvents: 10, MaxBytes: 100000, Concurrency: 1}}
	return recoveryFixture{store: store, queue: queue, client: client, worker: worker, prefix: prefix}
}

func TestWorkerQuarantinesPoisonWithoutBlockingOtherRequests(t *testing.T) {
	fixture := recoveryWorker(t)
	original := journalEvent()
	if err := fixture.store.Ingest(t.Context(), []billing.Event{original}, nil); err != nil {
		t.Fatal(err)
	}
	conflict := original
	conflict.Model = "conflicting-model"
	if err := fixture.queue.Publish(t.Context(), conflict); err != nil {
		t.Fatal(err)
	}
	if err := fixture.client.XAdd(t.Context(), &redis.XAddArgs{Stream: fixture.prefix + ":events:0", Values: map[string]any{"event": "malformed"}}).Err(); err != nil {
		t.Fatal(err)
	}
	good := original
	good.EventID, good.RequestID = "good-event", "good-request"
	if err := fixture.queue.Publish(t.Context(), good); err != nil {
		t.Fatal(err)
	}
	if err := fixture.worker.FlushOnce(t.Context()); err != nil {
		t.Fatal(err)
	}
	assertRecoveryHealth(t, fixture.queue, 0, 2)
	page, err := fixture.store.Requests(t.Context(), billing.Filter{OwnerUID: "user", Page: 1, Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if page.TotalItems != 2 {
		t.Fatalf("healthy event lost: %+v", page)
	}
}

func TestWorkerKeepsValidUsagePendingWhenPriceVersionConflicts(t *testing.T) {
	fixture := recoveryWorker(t)
	price := billing.Price{RuleID: "rule", Version: "v1", Model: "qwen", Currency: "USD", UnitTokens: 1, InputRate: 1}
	if err := fixture.store.SavePrice(t.Context(), price); err != nil {
		t.Fatal(err)
	}
	event := terminalRecoveryEvent("request", "qwen")
	if err := fixture.queue.Publish(t.Context(), event); err != nil {
		t.Fatal(err)
	}
	conflicting := price
	conflicting.InputRate = 2
	fixture.worker.Prices = func(string) (billing.Price, bool) { return conflicting, true }
	if err := fixture.worker.FlushOnce(t.Context()); !errors.Is(err, billing.ErrPriceVersionConflict) {
		t.Fatalf("price conflict: %v", err)
	}
	assertRecoveryHealth(t, fixture.queue, 1, 0)
	fixture.worker.Prices = func(string) (billing.Price, bool) { return price, true }
	if err := fixture.worker.FlushOnce(t.Context()); err != nil {
		t.Fatal(err)
	}
	assertRecoveryHealth(t, fixture.queue, 0, 0)
}

func TestWorkerAcknowledgesPricedSiblingsAndDefersMissingPrices(t *testing.T) {
	fixture := recoveryWorker(t)
	price := billing.Price{RuleID: "rule", Version: "v1", Model: "qwen", Currency: "USD", UnitTokens: 1, InputRate: 1}
	fixture.worker.Prices = func(model string) (billing.Price, bool) { return price, model == "qwen" }
	for _, model := range []string{"qwen", "unpriced"} {
		if err := fixture.queue.Publish(t.Context(), terminalRecoveryEvent(model, model)); err != nil {
			t.Fatal(err)
		}
	}
	if err := fixture.worker.FlushOnce(t.Context()); !errors.Is(err, billing.ErrPriceMissing) {
		t.Fatalf("missing price was not deferred: %v", err)
	}
	assertRecoveryHealth(t, fixture.queue, 1, 0)
	page, err := fixture.store.Requests(t.Context(), billing.Filter{OwnerUID: "user", Model: "qwen", Page: 1, Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if page.TotalItems != 1 || page.Items[0].Charge == nil {
		t.Fatal("priced sibling did not commit")
	}
}

func terminalRecoveryEvent(requestID, model string) billing.Event {
	event := journalEvent()
	event.RequestID, event.EventID, event.Model = requestID, requestID+"-terminal", model
	event.Type, event.Reason = "request_terminal", "completed"
	event.Usage = billing.Usage{InputTokens: 1, Complete: true, Source: "upstream_json"}
	return event
}

func assertRecoveryHealth(t *testing.T, queue *billing.RedisQueue, pending, dead int64) {
	t.Helper()
	health, err := queue.Health(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	if health.Pending != pending || health.DeadLetters != dead {
		t.Fatalf("recovery queue: %+v", health)
	}
}
