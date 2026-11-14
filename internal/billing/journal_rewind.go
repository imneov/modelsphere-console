package billing

import (
	"context"
	"os"
)

func (journal *Journal) Rewind(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	journal.replayMu.Lock()
	defer journal.replayMu.Unlock()
	journal.mu.Lock()
	defer journal.mu.Unlock()
	if journal.closed {
		return os.ErrClosed
	}
	segments, err := journal.segments()
	if err != nil {
		return err
	}
	if len(segments) == 0 {
		return nil
	}
	cursor := journalCursor{Segment: segments[0].name}
	if err := journal.saveCursor(cursor); err != nil {
		return err
	}
	journal.cursor = cursor
	return nil
}
