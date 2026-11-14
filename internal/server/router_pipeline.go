package server

import (
	"github.com/modelsphere/console/internal/config"
	"github.com/modelsphere/console/internal/router"
)

func inferencePipeline(settings config.RouterPipeline) router.PipelineOptions {
	settings = settings.WithDefaults()
	return router.PipelineOptions{MaxAttempts: settings.MaxAttempts, RetryBackoff: settings.RetryBackoff, MaxSSEFrameBytes: settings.MaxSSEFrameBytes, MaxDuration: settings.MaxDuration, MaxResponseBytes: settings.MaxResponseBytes, RepeatDeltaLimit: settings.RepeatDeltaLimit, CircuitFailureThreshold: settings.CircuitFailureThreshold, CircuitResetAfter: settings.CircuitResetAfter}
}
