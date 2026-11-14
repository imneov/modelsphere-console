package server

import (
	"errors"
	"log/slog"
	"net/http"
	"testing"
	"time"

	"github.com/modelsphere/console/internal/billing"
	"github.com/modelsphere/console/internal/testservices"
)

func TestDoubleMeteringFailureUsesConfiguredPolicyAtHTTPBoundary(t *testing.T) {
	for _, policy := range []string{"continue", "reject_new"} {
		t.Run(policy, func(t *testing.T) {
			server := crdInferenceServer(t)
			journal := fullJournal(t)
			redis := testservices.NewRedisService(t)
			queue, err := billing.NewRedisQueue(billing.RedisOptions{URL: redis.URL, Prefix: "failure", Partitions: 1, Group: "usage", LeaseDuration: time.Second})
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() {
				if err := queue.Close(); err != nil {
					t.Error(err)
				}
			})
			redis.Stop(t)
			meter := &billing.Meter{Journal: journal, Queue: queue, FailurePolicy: policy, PublishTimeout: 25 * time.Millisecond, Log: slog.New(slog.DiscardHandler)}
			server.SetMetering(meter)
			handler := server.Handler()
			admin := login(t, handler, "admin", "admin-pw")
			key := createKey(t, handler, admin, `{"name":"fault","user":"bob"}`)
			awaitKeyModels(t, handler, key.Value)
			response := do(handler, "POST", "/v1/chat/completions", key.Value, `{"model":"qwen"}`)
			wantStatus, wantRequests, wantGaps := http.StatusOK, uint64(1), uint64(2)
			if policy == "reject_new" {
				wantStatus, wantRequests, wantGaps = http.StatusServiceUnavailable, 0, 1
			}
			if response.Code != wantStatus || meter.Stats().Requests != wantRequests || meter.Stats().DeliveryGaps != wantGaps {
				t.Fatalf("policy %s: HTTP %d, metering %+v", policy, response.Code, meter.Stats())
			}
		})
	}
}

func fullJournal(t *testing.T) *billing.Journal {
	t.Helper()
	journal, err := billing.OpenJournal(t.Context(), billing.JournalOptions{Directory: t.TempDir(), SegmentBytes: 1024, MaxBytes: 4096, Retention: time.Hour, SyncMode: "record"})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := journal.Close(); err != nil {
			t.Error(err)
		}
	})
	event := billing.Event{SchemaVersion: 1, EventID: "capacity-event", Type: "request_started", RequestID: "capacity-request", OwnerUID: "user", WalletID: "user", IdentitySource: "session", Model: "qwen", AttemptID: "attempt", OccurredAt: time.Now().UTC()}
	for {
		err := journal.Append(t.Context(), event)
		if errors.Is(err, billing.ErrJournalCapacity) {
			return journal
		}
		if err != nil {
			t.Fatal(err)
		}
	}
}
