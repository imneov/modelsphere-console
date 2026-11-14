package billing

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
)

type EventJournal interface {
	Append(context.Context, Event) error
	Replay(context.Context, func(Event) error) error
	Bytes() int64
}

type Meter struct {
	Metrics        *Telemetry
	Journal        EventJournal
	Queue          EventQueue
	FailurePolicy  string
	PublishTimeout time.Duration
	ReplayInterval time.Duration
	ReplayRate     int
	Log            *slog.Logger
	journalMu      sync.RWMutex
	requests       atomic.Uint64
	journaled      atomic.Uint64
	gaps           atomic.Uint64
	published      atomic.Uint64
}

type Principal struct {
	OwnerUID string
	WalletID string
	APIKeyID string
	Source   string
}

type Trace struct {
	meter      *Meter
	start      Event
	terminalID string
	once       sync.Once
	// mu guards usage and upstream identity observed while a request is running.
	mu            sync.Mutex
	usageConflict bool
	usage         Usage
	upstreamID    string
}

func (meter *Meter) Start(ctx context.Context, principal Principal, model, upstream string) (*Trace, error) {
	return meter.StartRequest(ctx, principal, model, upstream, "", "")
}

func (meter *Meter) StartRequest(ctx context.Context, principal Principal, model, upstream, requestID, attemptID string) (*Trace, error) {
	if meter.Log == nil || meter.PublishTimeout <= 0 || (meter.FailurePolicy != "continue" && meter.FailurePolicy != "reject_new") {
		return nil, errors.New("invalid metering policy, logger or publish timeout")
	}
	var err error
	if requestID == "" {
		requestID, err = randomIdentity()
		if err != nil {
			return nil, err
		}
	}
	if attemptID == "" {
		attemptID, err = randomIdentity()
		if err != nil {
			return nil, err
		}
	}
	startID, err := randomIdentity()
	if err != nil {
		return nil, err
	}
	terminalID, err := randomIdentity()
	if err != nil {
		return nil, err
	}
	event := Event{SchemaVersion: 1, EventID: startID, RequestID: requestID, Type: "request_started", OwnerUID: principal.OwnerUID, WalletID: principal.WalletID, APIKeyID: principal.APIKeyID, IdentitySource: principal.Source, Model: model, Upstream: upstream, AttemptID: attemptID, OccurredAt: time.Now().UTC()}
	if err := event.Validate(); err != nil {
		return nil, err
	}
	if err := meter.record(ctx, event); err != nil && meter.FailurePolicy == "reject_new" {
		return nil, fmt.Errorf("metering cannot record a new request: %w", err)
	}
	meter.requests.Add(1)
	meter.Metrics.record("logical_request", "accepted")
	return &Trace{meter: meter, start: event, terminalID: terminalID}, nil
}

func randomIdentity() (string, error) {
	identifier, err := uuid.NewRandom()
	if err != nil {
		return "", err
	}
	return identifier.String(), nil
}

func (meter *Meter) record(ctx context.Context, event Event) (result error) {
	started := time.Now()
	defer func() { meter.Metrics.observe("record", started, result) }()
	var journalErr error
	if journal := meter.currentJournal(); journal != nil {
		journalErr = journal.Append(ctx, event)
	} else {
		journalErr = errors.New("journal unavailable")
	}
	if journalErr == nil {
		meter.journaled.Add(1)
		return nil
	}
	meter.Log.Warn("metering journal unavailable", "event_id", event.EventID, "err", journalErr)
	var queueErr error
	if meter.Queue == nil {
		queueErr = errors.New("event queue unavailable")
	} else {
		publishContext, cancel := context.WithTimeout(context.WithoutCancel(ctx), meter.PublishTimeout)
		defer cancel()
		queueErr = meter.Queue.Publish(publishContext, event)
	}
	if queueErr == nil {
		meter.published.Add(1)
		return nil
	}
	meter.gaps.Add(1)
	meter.Metrics.record("delivery", "gap")
	meter.Log.Error("metering event delivery gap", "request_id", event.RequestID, "event_id", event.EventID, "queue_error", queueErr)
	return errors.Join(journalErr, queueErr)
}

func (trace *Trace) RequestID() string { return trace.start.RequestID }
func (trace *Trace) AttemptID() string { return trace.start.AttemptID }

func (trace *Trace) Observe(usage Usage, upstreamID string) {
	trace.mu.Lock()
	defer trace.mu.Unlock()
	if usage.Complete && usage.Validate() == nil && !trace.usageConflict {
		if trace.usage.Complete && !sameTokenCounts(trace.usage, usage) {
			trace.usageConflict = true
			trace.usage = Usage{Source: "conflicting_upstream_usage"}
		} else {
			trace.usage = usage
		}
	}
	if upstreamID != "" && len(upstreamID) <= 512 {
		trace.upstreamID = upstreamID
	}
}

func (trace *Trace) Finish(ctx context.Context, reason string) {
	trace.FinishAttempts(ctx, reason, nil)
}

func (trace *Trace) FinishAttempts(ctx context.Context, reason string, attempts []Attempt) {
	trace.once.Do(func() {
		event := trace.start
		event.EventID = trace.terminalID
		event.Type = "request_terminal"
		event.OccurredAt = time.Now().UTC()
		event.Reason = reason
		event.Attempts = append([]Attempt(nil), attempts...)
		if len(event.Attempts) > 0 {
			last := len(event.Attempts) - 1
			event.AttemptID = event.Attempts[last].ID
			event.Attempts[last].Reason = reason
		}
		trace.mu.Lock()
		event.Usage = trace.usage
		event.UpstreamRequestID = trace.upstreamID
		trace.mu.Unlock()
		trace.meter.Metrics.observe("generation", trace.start.OccurredAt, nil)
		if !event.Usage.Complete {
			trace.meter.Metrics.record("terminal_usage", "missing")
		} else {
			trace.meter.Metrics.record("terminal_usage", "complete")
		}
		if err := trace.meter.record(context.WithoutCancel(ctx), event); err != nil {
			trace.meter.Log.Error("terminal usage delivery failed", "request_id", event.RequestID, "err", err)
		}
	})
}

func (trace *Trace) Usage() Usage { trace.mu.Lock(); defer trace.mu.Unlock(); return trace.usage }

func (meter *Meter) RunReplay(ctx context.Context) error {
	journal := meter.currentJournal()
	if journal == nil || meter.Queue == nil || meter.ReplayInterval <= 0 || meter.ReplayRate < 1 || meter.ReplayRate > 1000000 {
		return errors.New("journal, queue, replay interval and rate are required")
	}
	ticker := time.NewTicker(meter.ReplayInterval)
	defer ticker.Stop()
	limiter := time.NewTicker(time.Second / time.Duration(meter.ReplayRate))
	defer limiter.Stop()
	for {
		err := journal.Replay(ctx, func(event Event) error {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-limiter.C:
			}
			publishContext, cancel := context.WithTimeout(ctx, meter.PublishTimeout)
			defer cancel()
			if err := meter.Queue.Publish(publishContext, event); err != nil {
				return err
			}
			meter.published.Add(1)
			return nil
		})
		if err != nil && ctx.Err() == nil {
			meter.Log.Warn("journal replay deferred", "err", err)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
		}
	}
}

type MeterStats struct {
	Requests     uint64 `json:"requests"`
	Journaled    uint64 `json:"journaled"`
	Published    uint64 `json:"published"`
	DeliveryGaps uint64 `json:"deliveryGaps"`
	JournalBytes int64  `json:"journalBytes"`
}

func (meter *Meter) Stats() MeterStats {
	result := MeterStats{Requests: meter.requests.Load(), Journaled: meter.journaled.Load(), Published: meter.published.Load(), DeliveryGaps: meter.gaps.Load()}
	if journal := meter.currentJournal(); journal != nil {
		result.JournalBytes = journal.Bytes()
	}
	return result
}

func (meter *Meter) SetJournal(journal EventJournal) {
	meter.journalMu.Lock()
	meter.Journal = journal
	meter.journalMu.Unlock()
}

func (meter *Meter) currentJournal() EventJournal {
	meter.journalMu.RLock()
	defer meter.journalMu.RUnlock()
	return meter.Journal
}
