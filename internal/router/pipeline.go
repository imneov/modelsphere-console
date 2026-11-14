package router

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/modelsphere/console/internal/billing"
)

type Phase string

const (
	PhaseAuth       Phase = "auth"
	PhaseAdmission  Phase = "admission"
	PhaseRoute      Phase = "route"
	PhaseMetering   Phase = "metering"
	PhaseAttempt    Phase = "attempt"
	PhaseResponse   Phase = "response"
	PhaseProtection Phase = "protection"
	PhaseTerminal   Phase = "terminal"
)

type RequestInfo struct {
	RequestID string
	AttemptID string
	Principal billing.Principal
	Model     string
	Upstream  string
	Status    int
	Reason    string
	Usage     billing.Usage
}

type Plugin interface {
	Name() string
	Handle(context.Context, Phase, RequestInfo) error
}

type PipelineOptions struct {
	MaxAttempts             int
	RetryBackoff            time.Duration
	MaxSSEFrameBytes        int
	MaxDuration             time.Duration
	MaxResponseBytes        int64
	RepeatDeltaLimit        int
	CircuitFailureThreshold int
	CircuitResetAfter       time.Duration
	Transport               http.RoundTripper
	Plugins                 []Plugin
}

func (rt *Router) ConfigurePipeline(options PipelineOptions) error {
	if options.MaxAttempts < 1 || options.RetryBackoff < 0 || options.MaxSSEFrameBytes < 1 || options.MaxDuration < 0 || options.MaxResponseBytes < 0 || options.RepeatDeltaLimit < 0 || options.RepeatDeltaLimit == 1 || options.CircuitFailureThreshold < 0 || (options.CircuitFailureThreshold > 0 && options.CircuitResetAfter <= 0) {
		return errors.New("invalid inference retry, circuit or generation protection configuration")
	}
	if options.Transport == nil {
		options.Transport = http.DefaultTransport
	}
	for _, plugin := range options.Plugins {
		if plugin == nil || plugin.Name() == "" {
			return errors.New("gateway plugins must have a name")
		}
	}
	rt.pipeline = options
	rt.circuit = &circuitBreaker{states: map[string]circuitState{}}
	rt.proxy.Transport = &retryTransport{router: rt, base: options.Transport}
	return nil
}

func (rt *Router) phase(ctx context.Context, phase Phase, info RequestInfo) error {
	for _, plugin := range rt.pipeline.Plugins {
		if err := plugin.Handle(ctx, phase, info); err != nil {
			return fmt.Errorf("gateway plugin %s at %s: %w", plugin.Name(), phase, err)
		}
	}
	return nil
}

type circuitState struct {
	failures int
	opened   time.Time
}
type circuitBreaker struct {
	// mu guards circuit state shared by independent inference requests.
	mu     sync.Mutex
	states map[string]circuitState
}

func (circuit *circuitBreaker) allow(key string, options PipelineOptions) bool {
	if options.CircuitFailureThreshold == 0 {
		return true
	}
	circuit.mu.Lock()
	defer circuit.mu.Unlock()
	state := circuit.states[key]
	if state.opened.IsZero() {
		return true
	}
	if time.Since(state.opened) < options.CircuitResetAfter {
		return false
	}
	delete(circuit.states, key)
	return true
}

func (circuit *circuitBreaker) record(key string, failed bool, options PipelineOptions) {
	if options.CircuitFailureThreshold == 0 {
		return
	}
	circuit.mu.Lock()
	defer circuit.mu.Unlock()
	if !failed {
		delete(circuit.states, key)
		return
	}
	state := circuit.states[key]
	state.failures++
	if state.failures >= options.CircuitFailureThreshold && state.opened.IsZero() {
		state.opened = time.Now()
	}
	circuit.states[key] = state
}
