package billing

import (
	"context"
	"time"
)

type Message struct {
	Raw         string
	DecodeError string
	ID          string
	Event       Event
}
type Batch struct {
	Partition int
	Token     string
	Messages  []Message
}
type QueueHealth struct {
	Queued      int64 `json:"queued"`
	Pending     int64 `json:"pending"`
	DeadLetters int64 `json:"deadLetters"`
}

type EventQueue interface {
	Publish(context.Context, Event) error
	Consume(context.Context, string, int64) (Batch, error)
	Poll(context.Context, Batch, string, int64) ([]Message, error)
	Ack(context.Context, Batch) error
	Renew(context.Context, Batch) error
	Release(context.Context, Batch) error
	DeadLetter(context.Context, Batch, string) error
	Trim(context.Context) error
	Health(context.Context) (QueueHealth, error)
	Close() error
	LeaseDuration() time.Duration
}
