package billing

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"time"
)

func (journal *Journal) Replay(ctx context.Context, publish func(Event) error) error {
	journal.replayMu.Lock()
	defer journal.replayMu.Unlock()
	journal.mu.Lock()
	if journal.closed {
		journal.mu.Unlock()
		return os.ErrClosed
	}
	segments, err := journal.segments()
	journal.mu.Unlock()
	if err != nil {
		return err
	}
	for _, segment := range segments {
		if segment.name < journal.cursor.Segment {
			continue
		}
		offset := int64(0)
		if segment.name == journal.cursor.Segment {
			offset = journal.cursor.Offset
		}
		if err := journal.replaySegment(ctx, segment, offset, publish); err != nil {
			return err
		}
	}
	return journal.cleanDelivered()
}

func (journal *Journal) replaySegment(ctx context.Context, segment journalSegment, offset int64, publish func(Event) error) error {
	file, err := os.Open(filepath.Join(journal.options.Directory, segment.name))
	if err != nil {
		return err
	}
	defer file.Close()
	reader := io.NewSectionReader(file, offset, segment.size-offset)
	for offset < segment.size {
		if err := ctx.Err(); err != nil {
			return err
		}
		event, bytes, err := readFrame(reader)
		if err != nil {
			return err
		}
		if err := publish(event); err != nil {
			return err
		}
		offset += bytes
		cursor := journalCursor{Segment: segment.name, Offset: offset}
		if err := journal.saveCursor(cursor); err != nil {
			return err
		}
		journal.mu.Lock()
		journal.cursor = cursor
		journal.mu.Unlock()
	}
	return nil
}

func (journal *Journal) saveCursor(cursor journalCursor) error {
	raw, err := json.Marshal(cursor)
	if err != nil {
		return err
	}
	temporary := filepath.Join(journal.options.Directory, "delivered.next")
	file, err := os.OpenFile(temporary, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	if _, err := file.Write(raw); err != nil {
		_ = file.Close()
		return err
	}
	if err := file.Sync(); err != nil {
		_ = file.Close()
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	if err := os.Rename(temporary, filepath.Join(journal.options.Directory, "delivered.json")); err != nil {
		return err
	}
	return syncDirectory(journal.options.Directory)
}

func syncDirectory(path string) error {
	directory, err := os.Open(path)
	if err != nil {
		return err
	}
	defer directory.Close()
	return directory.Sync()
}

func (journal *Journal) cleanDelivered() error {
	journal.mu.Lock()
	defer journal.mu.Unlock()
	segments, err := journal.segments()
	if err != nil {
		return err
	}
	for _, segment := range segments {
		// Keep the cursor segment so recovery can validate its durable offset.
		if segment.name >= journal.cursor.Segment || segment.name == journal.current || time.Since(segment.modified) < journal.options.Retention {
			continue
		}
		if err := os.Remove(filepath.Join(journal.options.Directory, segment.name)); err != nil {
			return err
		}
		journal.totalBytes -= segment.size
	}
	return syncDirectory(journal.options.Directory)
}

func (journal *Journal) syncLoop(ctx context.Context) {
	defer close(journal.done)
	if journal.options.SyncMode == "record" {
		<-ctx.Done()
		return
	}
	ticker := time.NewTicker(journal.options.SyncInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			journal.mu.Lock()
			if !journal.closed {
				journal.syncErr = journal.syncFile()
			}
			journal.mu.Unlock()
		}
	}
}

func (journal *Journal) Close() error {
	journal.cancel()
	<-journal.done
	journal.replayMu.Lock()
	defer journal.replayMu.Unlock()
	journal.mu.Lock()
	defer journal.mu.Unlock()
	if journal.closed {
		return nil
	}
	journal.closed = true
	return errors.Join(journal.syncFile(), journal.file.Close(), journal.lock.Close())
}

func (journal *Journal) Bytes() int64 {
	journal.mu.Lock()
	defer journal.mu.Unlock()
	return journal.totalBytes
}

func (journal *Journal) PendingBytes() (int64, error) {
	journal.mu.Lock()
	defer journal.mu.Unlock()
	segments, err := journal.segments()
	if err != nil {
		return 0, err
	}
	pending := int64(0)
	for _, segment := range segments {
		if segment.name > journal.cursor.Segment {
			pending += segment.size
		} else if segment.name == journal.cursor.Segment {
			pending += max(0, segment.size-journal.cursor.Offset)
		}
	}
	return pending, nil
}
