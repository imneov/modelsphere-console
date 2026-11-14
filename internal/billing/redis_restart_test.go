package billing_test

import (
	"context"
	"testing"
	"time"

	"github.com/modelsphere/console/internal/billing"
	"github.com/modelsphere/console/internal/testservices"
)

func TestRetainedJournalRecoversQueueDataLossWithOriginalEvents(t *testing.T) {
	service := testservices.NewRedisService(t)
	queue, err := billing.NewRedisQueue(billing.RedisOptions{URL: service.URL, Prefix: "restart", Partitions: 1, Group: "usage", LeaseDuration: time.Second})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := queue.Close(); err != nil {
			t.Error(err)
		}
	})
	journal, err := billing.OpenJournal(t.Context(), billing.JournalOptions{Directory: t.TempDir(), SegmentBytes: 4096, MaxBytes: 16384, SyncMode: "record", Retention: time.Hour})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := journal.Close(); err != nil {
			t.Error(err)
		}
	})
	event := journalEvent()
	if err := journal.Append(t.Context(), event); err != nil {
		t.Fatal(err)
	}
	if err := journal.Replay(t.Context(), func(event billing.Event) error { return queue.Publish(t.Context(), event) }); err != nil {
		t.Fatal(err)
	}
	service.Stop(t)
	probeContext, cancel := context.WithTimeout(t.Context(), 25*time.Millisecond)
	defer cancel()
	if err := queue.Publish(probeContext, event); err == nil {
		t.Fatal("stopped queue accepted event")
	}
	service.Start(t)
	if err := journal.Rewind(t.Context()); err != nil {
		t.Fatal(err)
	}
	if err := journal.Replay(t.Context(), func(event billing.Event) error { return queue.Publish(t.Context(), event) }); err != nil {
		t.Fatal(err)
	}
	assertRecoveredQueueEvent(t, queue, event)

}

func assertRecoveredQueueEvent(t *testing.T, queue *billing.RedisQueue, event billing.Event) {
	t.Helper()
	batch, err := queue.Consume(t.Context(), "replacement", 10)
	if err != nil {
		batch, err = queue.Consume(t.Context(), "replacement", 10)
	}
	if err != nil {
		t.Fatal(err)
	}
	if len(batch.Messages) != 1 || batch.Messages[0].Event.EventID != event.EventID {
		t.Fatalf("recovery changed original events: %+v", batch)
	}
	if err := queue.Ack(t.Context(), batch); err != nil {
		t.Fatal(err)
	}
	if err := queue.Release(t.Context(), batch); err != nil {
		t.Fatal(err)
	}
}
