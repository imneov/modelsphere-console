package billing_test

import (
	"errors"
	"testing"
	"time"

	"github.com/modelsphere/console/internal/billing"
)

func TestJournalRecoversOriginalEventAfterLostPublishConfirmation(t *testing.T) {
	options := billing.JournalOptions{Directory: t.TempDir(), SegmentBytes: 4096, MaxBytes: 16384, SyncMode: "record", Retention: time.Hour}
	journal, err := billing.OpenJournal(t.Context(), options)
	if err != nil {
		t.Fatal(err)
	}
	event := billing.Event{SchemaVersion: 1, EventID: "stable-event", Type: "request_started", RequestID: "stable-request", OwnerUID: "alice-uid", WalletID: "alice-uid", APIKeyID: "key-1", IdentitySource: "sdk", Model: "qwen", AttemptID: "attempt-1", OccurredAt: time.Now().UTC()}
	if err := journal.Append(t.Context(), event); err != nil {
		t.Fatal(err)
	}
	count := 0
	if err := journal.Replay(t.Context(), func(received billing.Event) error {
		count++
		if received.EventID != "stable-event" {
			t.Fatal("event identity changed")
		}
		return errors.New("publish acknowledgement lost")
	}); err == nil {
		t.Fatal("lost confirmation was hidden")
	}
	if err := journal.Close(); err != nil {
		t.Fatal(err)
	}
	journal, err = billing.OpenJournal(t.Context(), options)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := journal.Close(); err != nil {
			t.Error(err)
		}
	})
	if err := journal.Replay(t.Context(), func(received billing.Event) error {
		count++
		if received.EventID != "stable-event" {
			t.Fatal("recovery replaced event identity")
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	if err := journal.Replay(t.Context(), func(billing.Event) error { t.Fatal("acknowledged event replayed"); return nil }); err != nil {
		t.Fatal(err)
	}
	if count != 2 {
		t.Fatalf("delivery attempts: %d", count)
	}
}
