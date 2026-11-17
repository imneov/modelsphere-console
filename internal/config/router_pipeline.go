package config

import (
	"fmt"
	"net/http"
	"slices"
	"time"
)

// defaultFailoverStatuses are upstream answers that mean no completion was
// produced, so replaying the request on another route cannot bill twice.
var defaultFailoverStatuses = []int{
	http.StatusTooManyRequests,
	http.StatusInternalServerError,
	http.StatusBadGateway,
	http.StatusServiceUnavailable,
	http.StatusGatewayTimeout,
}

type RouterPipeline struct {
	MaxAttempts             int           `yaml:"maxAttempts,omitempty"`
	RetryBackoff            time.Duration `yaml:"retryBackoff,omitempty"`
	MaxSSEFrameBytes        int           `yaml:"maxSSEFrameBytes,omitempty"`
	MaxDuration             time.Duration `yaml:"maxDuration,omitempty"`
	MaxResponseBytes        int64         `yaml:"maxResponseBytes,omitempty"`
	RepeatDeltaLimit        int           `yaml:"repeatDeltaLimit,omitempty"`
	CircuitFailureThreshold int           `yaml:"circuitFailureThreshold,omitempty"`
	CircuitResetAfter       time.Duration `yaml:"circuitResetAfter,omitempty"`
	// FailoverStatuses: answers replayed on another route. Left empty in the
	// file, the defaults apply; an explicit empty list disables status failover.
	FailoverStatuses []int `yaml:"failoverStatuses,omitempty"`
}

func (pipeline *RouterPipeline) applyDefaults() {
	if pipeline.MaxAttempts == 0 {
		pipeline.MaxAttempts = 1
	}
	if pipeline.MaxSSEFrameBytes == 0 {
		pipeline.MaxSSEFrameBytes = 1 << 20
	}
	if pipeline.CircuitResetAfter == 0 {
		pipeline.CircuitResetAfter = 30 * time.Second
	}
	if pipeline.FailoverStatuses == nil {
		pipeline.FailoverStatuses = slices.Clone(defaultFailoverStatuses)
	}
}

func (pipeline RouterPipeline) validate() error {
	pipeline.applyDefaults()
	if pipeline.MaxAttempts < 1 || pipeline.RetryBackoff < 0 || pipeline.MaxSSEFrameBytes < 1 || pipeline.MaxDuration < 0 || pipeline.MaxResponseBytes < 0 || pipeline.RepeatDeltaLimit < 0 || pipeline.RepeatDeltaLimit == 1 || pipeline.CircuitFailureThreshold < 0 || pipeline.CircuitResetAfter < 0 || (pipeline.CircuitFailureThreshold > 0 && pipeline.CircuitResetAfter == 0) {
		return fmt.Errorf("invalid router pipeline retry, frame, circuit or generation protection limits")
	}
	for _, status := range pipeline.FailoverStatuses {
		if status < 100 || status > 599 {
			return fmt.Errorf("invalid router pipeline failover status %d", status)
		}
	}
	return nil
}

func (pipeline RouterPipeline) WithDefaults() RouterPipeline {
	pipeline.applyDefaults()
	return pipeline
}
