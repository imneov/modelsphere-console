package billing

import (
	"errors"
	"fmt"
	"time"
)

type Usage struct {
	InputTokens  int64  `json:"inputTokens"`
	CacheTokens  int64  `json:"cacheTokens"`
	OutputTokens int64  `json:"outputTokens"`
	Complete     bool   `json:"complete"`
	Source       string `json:"source"`
}

func (usage Usage) Validate() error {
	if usage.InputTokens < 0 || usage.CacheTokens < 0 || usage.OutputTokens < 0 || usage.CacheTokens > usage.InputTokens {
		return errors.New("invalid token counts: cached input must be a subset of input")
	}
	if usage.Complete && usage.Source == "" {
		return errors.New("complete usage requires a verifiable source")
	}
	return nil
}

type Event struct {
	Attempts          []Attempt `json:"attempts,omitempty"`
	SchemaVersion     int       `json:"schemaVersion"`
	EventID           string    `json:"eventID"`
	Type              string    `json:"eventType"`
	RequestID         string    `json:"requestID"`
	OwnerUID          string    `json:"ownerUserID"`
	WalletID          string    `json:"walletID"`
	APIKeyID          string    `json:"apiKeyID"`
	IdentitySource    string    `json:"identitySource"`
	Model             string    `json:"model"`
	Upstream          string    `json:"upstream"`
	AttemptID         string    `json:"attemptID"`
	UpstreamRequestID string    `json:"upstreamRequestID,omitempty"`
	OccurredAt        time.Time `json:"occurredAt"`
	Reason            string    `json:"reason,omitempty"`
	Usage             Usage     `json:"usage"`
}

type Attempt struct {
	ID     string `json:"id"`
	Reason string `json:"reason"`
}

func (event Event) Validate() error {
	if !time.Unix(0, event.OccurredAt.UnixNano()).Equal(event.OccurredAt) {
		return errors.New("event timestamp exceeds nanosecond storage range")
	}
	for _, value := range []string{event.EventID, event.Reason, event.Usage.Source, event.RequestID, event.OwnerUID, event.APIKeyID, event.Model, event.Upstream, event.AttemptID, event.UpstreamRequestID} {
		if len(value) > 512 {
			return errors.New("billing event identity exceeds schema limit")
		}
	}
	if event.IdentitySource == "sdk" && event.APIKeyID == "" {
		return errors.New("SDK event requires an API Key identity")
	}
	attemptIDs := map[string]bool{}
	for _, attempt := range event.Attempts {
		if attempt.ID == "" || len(attempt.ID) > 512 || len(attempt.Reason) > 512 || attemptIDs[attempt.ID] {
			return errors.New("attempt identities must be nonempty and unique")
		}
		attemptIDs[attempt.ID] = true
	}
	if len(event.Attempts) > 0 && event.Type != "request_started" && event.Attempts[len(event.Attempts)-1].ID != event.AttemptID {
		return errors.New("terminal attempt must match the final upstream attempt")
	}
	if event.SchemaVersion != 1 || event.EventID == "" || event.RequestID == "" || event.OwnerUID == "" || event.WalletID != event.OwnerUID || event.Model == "" || event.AttemptID == "" || event.OccurredAt.IsZero() {
		return errors.New("invalid billing event envelope or ownership")
	}
	if event.IdentitySource != "sdk" && event.IdentitySource != "session" {
		return errors.New("invalid event identity source")
	}
	if event.IdentitySource == "session" && event.APIKeyID != "" {
		return errors.New("session event must not invent an API Key")
	}
	switch event.Type {
	case "request_started", "request_terminal", "usage_supplement":
	default:
		return fmt.Errorf("unknown event type %q", event.Type)
	}
	if event.Type == "request_started" && (event.Usage.Complete || event.Usage.InputTokens != 0 || event.Usage.CacheTokens != 0 || event.Usage.OutputTokens != 0) {
		return errors.New("request start cannot contain future usage")
	}
	return event.Usage.Validate()
}
