package server

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"testing"
	"time"

	"github.com/modelsphere/console/internal/billing"
	"github.com/modelsphere/console/internal/testservices"
)

type redisMeterFixture struct {
	server  *Server
	meter   *billing.Meter
	queue   *billing.RedisQueue
	journal *billing.Journal
}

func redisPrimaryMeter(t *testing.T, url string) redisMeterFixture {
	t.Helper()
	server := crdInferenceServer(t)
	journal := attachDurableMeter(t, server)
	queue, err := billing.NewRedisQueue(billing.RedisOptions{URL: url, Prefix: "redis-primary", Partitions: 1, Group: "usage", LeaseDuration: time.Second})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := queue.Close(); err != nil {
			t.Error(err)
		}
	})
	meter := &billing.Meter{Journal: journal, Queue: queue, FailurePolicy: "reject_new", PublishTimeout: 100 * time.Millisecond, Log: slog.New(slog.DiscardHandler)}
	server.SetMetering(meter)
	return redisMeterFixture{server: server, meter: meter, queue: queue, journal: journal}
}

func TestHealthyRedisRecordsBothEntrypointsWithoutJournalWrites(t *testing.T) {
	fixture := redisPrimaryMeter(t, testservices.RedisURL(t))
	handler := fixture.server.Handler()
	admin := login(t, handler, "admin", "admin-pw")
	key := createKey(t, handler, admin, `{"name":"queue-primary","user":"bob"}`)
	awaitKeyModels(t, handler, key.Value)
	for _, entry := range []struct{ path, token string }{{"/v1/chat/completions", key.Value}, {"/api/llm/v1/chat/completions", admin}} {
		response := do(handler, "POST", entry.path, entry.token, `{"model":"qwen"}`)
		if response.Code != http.StatusOK {
			t.Fatalf("queue-first inference: %d %s", response.Code, response.Body.String())
		}
	}
	stats := fixture.meter.Stats()
	if stats.Published != 4 || stats.Journaled != 0 || fixture.journal.Bytes() != 0 || stats.DeliveryGaps != 0 {
		t.Fatalf("healthy Redis unnecessarily used journal: %+v", stats)
	}
	batch, err := fixture.queue.Consume(t.Context(), "verify", 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(batch.Messages) != 4 {
		t.Fatalf("Redis lifecycle events: %+v", batch)
	}
	counts := map[string]int{}
	for _, message := range batch.Messages {
		counts[message.Event.OwnerUID]++
	}
	if counts["bob-uid"] != 2 || counts["admin-uid"] != 2 {
		t.Fatalf("queue ownership: %+v", counts)
	}
	if err := fixture.queue.Ack(t.Context(), batch); err != nil {
		t.Fatal(err)
	}
	if err := fixture.queue.Release(t.Context(), batch); err != nil {
		t.Fatal(err)
	}
}

func TestRedisOutageBacksUpEventsAndRecoveryReplaysOriginalIdentities(t *testing.T) {
	redis := testservices.NewRedisService(t)
	fixture := redisPrimaryMeter(t, redis.URL)
	fixture.meter.ReplayInterval, fixture.meter.ReplayRate = time.Millisecond, 10000
	handler := fixture.server.Handler()
	admin := login(t, handler, "admin", "admin-pw")
	redis.Stop(t)
	response := do(handler, "POST", "/api/llm/v1/chat/completions", admin, `{"model":"qwen"}`)
	if response.Code != http.StatusOK || fixture.meter.Stats().Journaled != 2 || fixture.meter.Stats().Published != 0 || fixture.journal.Bytes() == 0 {
		t.Fatalf("failed Redis was not backed up: %d %+v", response.Code, fixture.meter.Stats())
	}
	redis.Start(t)
	var original billing.Event
	err := fixture.journal.Replay(t.Context(), func(event billing.Event) error {
		original = event
		if err := fixture.queue.Publish(t.Context(), event); err != nil {
			return err
		}
		return context.DeadlineExceeded
	})
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("lost replay confirmation: %v", err)
	}
	runMeterReplay(t, fixture.meter)
	events := awaitQueuedMeterEvents(t, fixture.queue, 3)
	unique := map[string]billing.Event{}
	duplicates := 0
	for _, event := range events {
		unique[event.EventID] = event
		if event.EventID == original.EventID {
			duplicates++
		}
		if event.RequestID != response.Header().Get("X-Request-ID") || event.OwnerUID != "admin-uid" {
			t.Fatalf("replay changed trusted identity: %+v", event)
		}
	}
	if len(unique) != 2 || duplicates != 2 || fixture.meter.Stats().DeliveryGaps != 0 {
		t.Fatalf("replay changed original facts: %+v", events)
	}
}

func runMeterReplay(t *testing.T, meter *billing.Meter) {
	t.Helper()
	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan error, 1)
	go func() { done <- meter.RunReplay(ctx) }()
	t.Cleanup(func() {
		cancel()
		select {
		case err := <-done:
			if err != nil && !errors.Is(err, context.Canceled) {
				t.Error(err)
			}
		case <-time.After(3 * time.Second):
			t.Error("journal recovery did not stop")
		}
	})
}

func awaitQueuedMeterEvents(t *testing.T, queue *billing.RedisQueue, count int) []billing.Event {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	events := []billing.Event{}
	for len(events) < count {
		batch, err := queue.Consume(t.Context(), "verify-recovery", 10)
		if err != nil {
			t.Fatal(err)
		}
		for _, message := range batch.Messages {
			events = append(events, message.Event)
		}
		if err := queue.Ack(t.Context(), batch); err != nil {
			t.Fatal(err)
		}
		if err := queue.Release(t.Context(), batch); err != nil {
			t.Fatal(err)
		}
		if time.Now().After(deadline) {
			t.Fatalf("replayed events incomplete: %+v", events)
		}
		if len(events) < count {
			time.Sleep(time.Millisecond)
		}
	}
	return events
}
