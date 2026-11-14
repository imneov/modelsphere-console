package config

import (
	"fmt"
	"time"
)

type RouterPipeline struct {
	MaxAttempts             int           `yaml:"maxAttempts,omitempty"`
	RetryBackoff            time.Duration `yaml:"retryBackoff,omitempty"`
	MaxSSEFrameBytes        int           `yaml:"maxSSEFrameBytes,omitempty"`
	MaxDuration             time.Duration `yaml:"maxDuration,omitempty"`
	MaxResponseBytes        int64         `yaml:"maxResponseBytes,omitempty"`
	RepeatDeltaLimit        int           `yaml:"repeatDeltaLimit,omitempty"`
	CircuitFailureThreshold int           `yaml:"circuitFailureThreshold,omitempty"`
	CircuitResetAfter       time.Duration `yaml:"circuitResetAfter,omitempty"`
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
}

func (pipeline RouterPipeline) validate() error {
	pipeline.applyDefaults()
	if pipeline.MaxAttempts < 1 || pipeline.RetryBackoff < 0 || pipeline.MaxSSEFrameBytes < 1 || pipeline.MaxDuration < 0 || pipeline.MaxResponseBytes < 0 || pipeline.RepeatDeltaLimit < 0 || pipeline.RepeatDeltaLimit == 1 || pipeline.CircuitFailureThreshold < 0 || pipeline.CircuitResetAfter < 0 || (pipeline.CircuitFailureThreshold > 0 && pipeline.CircuitResetAfter == 0) {
		return fmt.Errorf("invalid router pipeline retry, frame, circuit or generation protection limits")
	}
	return nil
}

func (pipeline RouterPipeline) WithDefaults() RouterPipeline {
	pipeline.applyDefaults()
	return pipeline
}
