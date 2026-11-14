package billing

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"hash/crc32"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/sys/unix"
)

var ErrJournalCapacity = errors.New("metering journal capacity exceeded")

const frameHeaderBytes = 8
const maxEventBytes = 1 << 20

type JournalOptions struct {
	Metrics      *Telemetry
	Directory    string
	SegmentBytes int64
	MaxBytes     int64
	Retention    time.Duration
	SyncMode     string
	SyncInterval time.Duration
	MinFreeBytes uint64
}

type journalCursor struct {
	Segment string `json:"segment"`
	Offset  int64  `json:"offset"`
}
type journalSegment struct {
	name     string
	size     int64
	modified time.Time
}

type Journal struct {
	// mu guards the current append file, byte accounting and closed state.
	mu         sync.Mutex
	replayMu   sync.Mutex
	options    JournalOptions
	lock       *os.File
	file       *os.File
	current    string
	totalBytes int64
	cursor     journalCursor
	closed     bool
	cancel     context.CancelFunc
	done       chan struct{}
	syncErr    error
	pending    map[string]uint64
}

func OpenJournal(ctx context.Context, options JournalOptions) (*Journal, error) {
	if !filepath.IsAbs(options.Directory) || options.SegmentBytes <= frameHeaderBytes || options.MaxBytes < options.SegmentBytes || options.Retention < 0 || (options.SyncMode != "record" && options.SyncMode != "interval") || (options.SyncMode == "interval" && options.SyncInterval <= 0) {
		return nil, errors.New("invalid journal directory, capacity, retention or sync policy")
	}
	if err := os.MkdirAll(options.Directory, 0700); err != nil {
		return nil, fmt.Errorf("create journal directory: %w", err)
	}
	lock, err := os.OpenFile(filepath.Join(options.Directory, "writer.lock"), os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, err
	}
	if err := unix.Flock(int(lock.Fd()), unix.LOCK_EX|unix.LOCK_NB); err != nil {
		_ = lock.Close()
		return nil, fmt.Errorf("journal shard already owned: %w", err)
	}
	journal := &Journal{options: options, lock: lock, done: make(chan struct{}), pending: map[string]uint64{}}
	if err := journal.recover(); err != nil {
		if journal.file != nil {
			_ = journal.file.Close()
		}
		_ = lock.Close()
		return nil, err
	}
	flushContext, cancel := context.WithCancel(ctx)
	journal.cancel = cancel
	go journal.syncLoop(flushContext)
	return journal, nil
}

func (journal *Journal) recover() error {
	raw, err := os.ReadFile(filepath.Join(journal.options.Directory, "delivered.json"))
	if err == nil {
		if err := json.Unmarshal(raw, &journal.cursor); err != nil {
			return fmt.Errorf("decode journal delivery cursor: %w", err)
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}
	segments, err := journal.segments()
	if err != nil {
		return err
	}
	for index, segment := range segments {
		path := filepath.Join(journal.options.Directory, segment.name)
		size, err := recoverSegment(path, index == len(segments)-1)
		if err != nil {
			return fmt.Errorf("recover journal segment %s: %w", segment.name, err)
		}
		segments[index].size = size
		journal.totalBytes += size
	}
	if len(segments) > 0 {
		journal.current = segments[len(segments)-1].name
	}
	if journal.cursor.Segment != "" {
		cursorFound := false
		for _, segment := range segments {
			if segment.name == journal.cursor.Segment {
				cursorFound = true
				if journal.cursor.Offset < 0 || journal.cursor.Offset > segment.size {
					return errors.New("journal delivery cursor is outside recovered segment")
				}
				if err := validateCursorBoundary(filepath.Join(journal.options.Directory, segment.name), journal.cursor.Offset); err != nil {
					return err
				}
			}
		}
		if !cursorFound {
			return errors.New("journal delivery cursor references a missing segment")
		}
	}
	return journal.openAppend()
}

func recoverSegment(path string, last bool) (int64, error) {
	file, err := os.OpenFile(path, os.O_RDWR, 0600)
	if err != nil {
		return 0, err
	}
	defer file.Close()
	offset := int64(0)
	for {
		_, bytes, err := readFrame(file)
		if err == io.EOF {
			return offset, nil
		}
		if errors.Is(err, io.ErrUnexpectedEOF) && last {
			if err := file.Truncate(offset); err != nil {
				return 0, err
			}
			if err := file.Sync(); err != nil {
				return 0, err
			}
			return offset, nil
		}
		if err != nil {
			return 0, err
		}
		offset += bytes
	}
}

func (journal *Journal) openAppend() error {
	if journal.current == "" {
		journal.current = fmt.Sprintf("%020d.wal", time.Now().UnixNano())
	}
	file, err := os.OpenFile(filepath.Join(journal.options.Directory, journal.current), os.O_CREATE|os.O_APPEND|os.O_RDWR, 0600)
	if err != nil {
		return err
	}
	journal.file = file
	return syncDirectory(journal.options.Directory)
}

func (journal *Journal) segments() ([]journalSegment, error) {
	entries, err := os.ReadDir(journal.options.Directory)
	if err != nil {
		return nil, err
	}
	segments := []journalSegment{}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".wal") {
			continue
		}
		if _, err := strconv.ParseInt(strings.TrimSuffix(entry.Name(), ".wal"), 10, 64); err != nil {
			return nil, errors.New("invalid journal segment identity")
		}
		info, err := entry.Info()
		if err != nil {
			return nil, err
		}
		segments = append(segments, journalSegment{entry.Name(), info.Size(), info.ModTime()})
	}
	sort.Slice(segments, func(left, right int) bool { return segments[left].name < segments[right].name })
	return segments, nil
}

func (journal *Journal) Append(ctx context.Context, event Event) (result error) {
	started := time.Now()
	defer func() {
		journal.options.Metrics.observe("journal_append", started, result)
		if result == nil {
			journal.options.Metrics.record("journal_event", event.Type)
		}
	}()
	if err := ctx.Err(); err != nil {
		return err
	}
	frame, err := eventFrame(event)
	if err != nil {
		return err
	}
	journal.mu.Lock()
	defer journal.mu.Unlock()
	err = journal.appendFrame(frame)
	if err == nil {
		if journal.options.SyncMode == "record" {
			journal.options.Metrics.record("durable_event", event.Type)
		} else {
			journal.pending[event.Type]++
		}
	}
	return err
}

func eventFrame(event Event) ([]byte, error) {
	if err := event.Validate(); err != nil {
		return nil, err
	}
	payload, err := json.Marshal(event)
	if err != nil {
		return nil, err
	}
	if len(payload) > maxEventBytes {
		return nil, errors.New("metering event exceeds journal frame limit")
	}
	frame := make([]byte, frameHeaderBytes+len(payload))
	binary.BigEndian.PutUint32(frame[:4], uint32(len(payload)))
	binary.BigEndian.PutUint32(frame[4:8], crc32.ChecksumIEEE(payload))
	copy(frame[8:], payload)
	return frame, nil
}

func (journal *Journal) appendFrame(frame []byte) error {
	if journal.closed {
		return os.ErrClosed
	}
	if journal.syncErr != nil {
		return journal.syncErr
	}
	if journal.totalBytes+int64(len(frame)) > journal.options.MaxBytes {
		return ErrJournalCapacity
	}
	if err := journal.checkFreeSpace(); err != nil {
		return err
	}
	info, err := journal.file.Stat()
	if err != nil {
		return err
	}
	if info.Size() > 0 && info.Size()+int64(len(frame)) > journal.options.SegmentBytes {
		if err := journal.rotate(); err != nil {
			return err
		}
	}
	offset, err := journal.file.Seek(0, io.SeekEnd)
	if err != nil {
		return err
	}
	count, err := journal.file.Write(frame)
	if err != nil || count != len(frame) {
		truncateErr := journal.file.Truncate(offset)
		if err == nil {
			err = io.ErrShortWrite
		}
		return errors.Join(err, truncateErr)
	}
	journal.totalBytes += int64(count)
	if journal.options.SyncMode == "record" {
		if err := journal.syncFile(); err != nil {
			journal.syncErr = err
			return err
		}
	}
	return nil
}

func (journal *Journal) checkFreeSpace() error {
	if journal.options.MinFreeBytes == 0 {
		return nil
	}
	var stats unix.Statfs_t
	if err := unix.Statfs(journal.options.Directory, &stats); err != nil {
		return err
	}
	if stats.Bavail*uint64(stats.Bsize) < journal.options.MinFreeBytes {
		return ErrJournalCapacity
	}
	return nil
}

func (journal *Journal) rotate() error {
	if err := journal.syncFile(); err != nil {
		return err
	}
	if err := journal.file.Close(); err != nil {
		return err
	}
	previous, err := strconv.ParseInt(strings.TrimSuffix(journal.current, ".wal"), 10, 64)
	if err != nil {
		return err
	}
	sequence := max(time.Now().UnixNano(), previous+1)
	journal.current = fmt.Sprintf("%020d.wal", sequence)
	return journal.openAppend()
}

func readFrame(reader io.Reader) (Event, int64, error) {
	var header [frameHeaderBytes]byte
	count, err := io.ReadFull(reader, header[:])
	if err != nil {
		if count > 0 && err == io.EOF {
			err = io.ErrUnexpectedEOF
		}
		return Event{}, 0, err
	}
	length := binary.BigEndian.Uint32(header[:4])
	if length == 0 || length > maxEventBytes {
		return Event{}, 0, errors.New("corrupt journal frame length")
	}
	payload := make([]byte, length)
	if _, err := io.ReadFull(reader, payload); err != nil {
		if err == io.EOF {
			err = io.ErrUnexpectedEOF
		}
		return Event{}, 0, err
	}
	if crc32.ChecksumIEEE(payload) != binary.BigEndian.Uint32(header[4:8]) {
		return Event{}, 0, errors.New("journal checksum mismatch")
	}
	var event Event
	if err := json.Unmarshal(payload, &event); err != nil {
		return Event{}, 0, fmt.Errorf("decode journal event: %w", err)
	}
	if err := event.Validate(); err != nil {
		return Event{}, 0, err
	}
	return event, int64(frameHeaderBytes) + int64(length), nil
}

func validateCursorBoundary(path string, offset int64) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()
	boundary := int64(0)
	for boundary < offset {
		_, size, err := readFrame(file)
		if err != nil {
			return fmt.Errorf("validate journal cursor: %w", err)
		}
		boundary += size
	}
	if boundary != offset {
		return errors.New("journal delivery cursor is not a frame boundary")
	}
	return nil
}

func (journal *Journal) syncFile() (result error) {
	started := time.Now()
	defer func() { journal.options.Metrics.observe("journal_fsync", started, result) }()
	result = journal.file.Sync()
	if result == nil {
		if journal.options.Metrics != nil {
			for kind, count := range journal.pending {
				journal.options.Metrics.operations.WithLabelValues("durable_event", kind).Add(float64(count))
			}
		}
		clear(journal.pending)
	}
	return result
}

func (journal *Journal) FreeBytes() (uint64, error) {
	var stats unix.Statfs_t
	if err := unix.Statfs(journal.options.Directory, &stats); err != nil {
		return 0, err
	}
	return stats.Bavail * uint64(stats.Bsize), nil
}
