package billing_test

import (
	"log/slog"
	"testing"
	"time"

	"github.com/modelsphere/console/internal/billing"
	"github.com/prometheus/client_golang/prometheus"
)

func TestIntervalJournalCountsDurabilityOnlyAfterFsync(t *testing.T) {
	registry := prometheus.NewRegistry()
	metrics, err := billing.NewTelemetry(registry)
	if err != nil {
		t.Fatal(err)
	}
	journal, err := billing.OpenJournal(t.Context(), billing.JournalOptions{Directory: t.TempDir(), SegmentBytes: 4096, MaxBytes: 16384, SyncMode: "interval", SyncInterval: time.Hour, Metrics: metrics})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := journal.Close(); err != nil {
			t.Error(err)
		}
	})
	if err := journal.Append(t.Context(), journalEvent()); err != nil {
		t.Fatal(err)
	}
	if value := metricCounter(t, registry, "billing_operations_total", "durable_event"); value != 0 {
		t.Fatalf("unsynced event advertised as durable: %v", value)
	}
	if err := journal.Close(); err != nil {
		t.Fatal(err)
	}
	if value := metricCounter(t, registry, "billing_operations_total", "durable_event"); value != 1 {
		t.Fatalf("synced event not recorded: %v", value)
	}
}

func TestConflictingConfirmedUsageRemainsUnresolved(t *testing.T) {
	journal, err := billing.OpenJournal(t.Context(), billing.JournalOptions{Directory: t.TempDir(), SegmentBytes: 4096, MaxBytes: 16384, SyncMode: "record"})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := journal.Close(); err != nil {
			t.Error(err)
		}
	})
	meter := &billing.Meter{Journal: journal, FailurePolicy: "continue", PublishTimeout: time.Second, Log: slog.New(slog.DiscardHandler)}
	trace, err := meter.Start(t.Context(), billing.Principal{OwnerUID: "user", WalletID: "user", Source: "session"}, "qwen", "upstream")
	if err != nil {
		t.Fatal(err)
	}
	trace.Observe(billing.Usage{InputTokens: 10, Complete: true, Source: "upstream_sse"}, "request")
	trace.Observe(billing.Usage{InputTokens: 20, Complete: true, Source: "upstream_sse"}, "request")
	trace.Finish(t.Context(), "completed")
	count := 0
	if err := journal.Replay(t.Context(), func(event billing.Event) error {
		count++
		if event.Type == "request_terminal" && (event.Usage.Complete || event.Usage.Source != "conflicting_upstream_usage") {
			t.Errorf("conflicting usage charged: %+v", event.Usage)
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	if count != 2 {
		t.Fatalf("logical request facts: %d", count)
	}
}

func metricCounter(t *testing.T, registry *prometheus.Registry, name, stage string) float64 {
	t.Helper()
	families, err := registry.Gather()
	if err != nil {
		t.Fatal(err)
	}
	total := 0.
	for _, family := range families {
		if family.GetName() != name {
			continue
		}
		for _, metric := range family.Metric {
			for _, label := range metric.Label {
				if label.GetName() == "stage" && label.GetValue() == stage {
					total += metric.GetCounter().GetValue()
				}
			}
		}
	}
	return total
}
