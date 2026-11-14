package billing_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strconv"
	"testing"
	"time"

	"github.com/modelsphere/console/internal/billing"
)

func journalEvent() billing.Event {
	return billing.Event{SchemaVersion: 1, EventID: "stable", Type: "request_started", RequestID: "request", OwnerUID: "user", WalletID: "user", IdentitySource: "session", Model: "qwen", AttemptID: "attempt", OccurredAt: time.Now().UTC()}
}

func TestJournalTakeoverTruncatesTornTailAndRejectsConcurrentWriter(t *testing.T) {
	options := billing.JournalOptions{Directory: t.TempDir(), SegmentBytes: 4096, MaxBytes: 16384, SyncMode: "record"}
	journal, err := billing.OpenJournal(t.Context(), options)
	if err != nil {
		t.Fatal(err)
	}
	if concurrent, err := billing.OpenJournal(t.Context(), options); err == nil {
		_ = concurrent.Close()
		t.Fatal("concurrent shard writer accepted")
	}
	if err := journal.Append(t.Context(), journalEvent()); err != nil {
		t.Fatal(err)
	}
	expectedBytes := journal.Bytes()
	if err := journal.Close(); err != nil {
		t.Fatal(err)
	}
	segments, err := filepath.Glob(filepath.Join(options.Directory, "*.wal"))
	if err != nil || len(segments) != 1 {
		t.Fatalf("segments: %v %v", segments, err)
	}
	appendTornJournalTail(t, segments[0])
	journal, err = billing.OpenJournal(t.Context(), options)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := journal.Close(); err != nil {
			t.Error(err)
		}
	})
	if journal.Bytes() != expectedBytes {
		t.Fatalf("torn tail retained: %d != %d", journal.Bytes(), expectedBytes)
	}
	count := 0
	if err := journal.Replay(t.Context(), func(event billing.Event) error {
		count++
		if event.EventID != "stable" {
			t.Error("identity changed")
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("recovered events: %d", count)
	}
}

func TestJournalRejectsCursorOutsideRecoveredFrameBoundary(t *testing.T) {
	for _, offset := range []int64{-1, 1, 1000000} {
		t.Run(strconv.FormatInt(offset, 10), func(t *testing.T) {
			options := billing.JournalOptions{Directory: t.TempDir(), SegmentBytes: 4096, MaxBytes: 16384, SyncMode: "record"}
			journal, err := billing.OpenJournal(t.Context(), options)
			if err != nil {
				t.Fatal(err)
			}
			if err := journal.Append(t.Context(), journalEvent()); err != nil {
				t.Fatal(err)
			}
			if err := journal.Close(); err != nil {
				t.Fatal(err)
			}
			segments, err := filepath.Glob(filepath.Join(options.Directory, "*.wal"))
			if err != nil {
				t.Fatal(err)
			}
			raw, err := json.Marshal(map[string]any{"segment": filepath.Base(segments[0]), "offset": offset})
			if err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(filepath.Join(options.Directory, "delivered.json"), raw, 0600); err != nil {
				t.Fatal(err)
			}
			if opened, err := billing.OpenJournal(t.Context(), options); err == nil {
				_ = opened.Close()
				t.Fatal("invalid cursor accepted")
			}
		})
	}
}

func appendTornJournalTail(t *testing.T, path string) {
	t.Helper()
	file, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := file.Write([]byte{0, 0, 0, 40, 0, 0, 0, 0, 1}); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
}
