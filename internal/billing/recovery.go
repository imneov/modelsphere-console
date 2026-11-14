package billing

import (
	"context"
	"encoding/json"
	"errors"
	"regexp"

	"github.com/redis/go-redis/v9"
)

type DeadLetter struct {
	ID        string `json:"id"`
	Reason    string `json:"reason"`
	RequestID string `json:"requestID,omitempty"`
	EventID   string `json:"eventID,omitempty"`
}

type RecoveryQueue interface {
	DeadLetters(context.Context, string, int64) ([]DeadLetter, error)
	ReplayDeadLetter(context.Context, string) error
}

var streamIDPattern = regexp.MustCompile(`^[0-9]{1,20}-[0-9]{1,20}$`)

func ValidStreamID(id string) bool { return streamIDPattern.MatchString(id) }

func (queue *RedisQueue) DeadLetters(ctx context.Context, after string, limit int64) ([]DeadLetter, error) {
	if limit < 1 || limit > 200 || (after != "" && !ValidStreamID(after)) {
		return nil, errors.New("invalid dead letter cursor or limit")
	}
	start := "-"
	if after != "" {
		start = "(" + after
	}
	messages, err := queue.client.XRangeN(ctx, queue.options.Prefix+":dead", start, "+", limit).Result()
	if err != nil {
		return nil, err
	}
	result := make([]DeadLetter, 0, len(messages))
	for _, message := range messages {
		result = append(result, deadLetterView(message))
	}
	return result, nil
}

func deadLetterView(message redis.XMessage) DeadLetter {
	view := DeadLetter{ID: message.ID}
	view.Reason, _ = message.Values["reason"].(string)
	raw, ok := message.Values["event"].(string)
	if !ok {
		return view
	}
	var event Event
	if err := json.Unmarshal([]byte(raw), &event); err == nil {
		view.RequestID, view.EventID = event.RequestID, event.EventID
	}
	return view
}
