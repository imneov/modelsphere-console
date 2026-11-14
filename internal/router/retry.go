package router

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/http/httptrace"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/modelsphere/console/internal/billing"
)

type retryTransport struct {
	router *Router
	base   http.RoundTripper
}

func (transport *retryTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	invocation := callFrom(request.Context())
	if invocation == nil {
		return transport.base.RoundTrip(request)
	}
	for attempt := 0; attempt < transport.router.pipeline.MaxAttempts; attempt++ {
		outgoing, err := transport.prepare(request, invocation, attempt)
		if err != nil {
			return nil, err
		}
		var wrote atomic.Bool
		trace := &httptrace.ClientTrace{WroteRequest: func(httptrace.WroteRequestInfo) { wrote.Store(true) }}
		outgoing = outgoing.WithContext(httptrace.WithClientTrace(outgoing.Context(), trace))
		response, err := transport.base.RoundTrip(outgoing)
		if err == nil {
			invocation.attempts[len(invocation.attempts)-1].Reason = "response_received"
			if response.Request == nil {
				response.Request = outgoing
			}
			return response, nil
		}
		invocation.attempts[len(invocation.attempts)-1].Reason = "upstream_error"
		var operation *net.OpError
		// A failed dial before writing is the only automatically recoverable consumption boundary.
		safe := !wrote.Load() && errors.As(err, &operation) && operation.Op == "dial"
		if !safe || attempt+1 >= transport.router.pipeline.MaxAttempts || request.Context().Err() != nil {
			return nil, err
		}
		invocation.attempts[len(invocation.attempts)-1].Reason = "connection_failed"
		if response != nil && response.Body != nil {
			if closeError := response.Body.Close(); closeError != nil {
				return nil, errors.Join(err, closeError)
			}
		}
		if err := retryDelay(request.Context(), transport.router.pipeline.RetryBackoff); err != nil {
			return nil, err
		}
	}
	return nil, errors.New("inference retry exhausted")
}

func (transport *retryTransport) prepare(request *http.Request, invocation *call, index int) (*http.Request, error) {
	outgoing := request.Clone(request.Context())
	attemptID := invocation.info.AttemptID
	if index > 0 {
		identifier, err := uuid.NewRandom()
		if err != nil {
			return nil, err
		}
		attemptID = identifier.String()
		if request.GetBody == nil {
			return nil, errors.New("inference body cannot be replayed")
		}
		body, err := request.GetBody()
		if err != nil {
			return nil, err
		}
		outgoing.Body = body
	}
	invocation.info.AttemptID = attemptID
	invocation.attempts = append(invocation.attempts, billing.Attempt{ID: attemptID, Reason: "started"})
	outgoing.Header.Set("X-Request-ID", invocation.info.RequestID)
	outgoing.Header.Set("X-ModelSphere-Attempt-ID", attemptID)
	if err := transport.router.phase(outgoing.Context(), PhaseAttempt, invocation.info); err != nil {
		invocation.reason = "plugin_rejected"
		return nil, err
	}
	return outgoing, nil
}

func retryDelay(ctx context.Context, duration time.Duration) error {
	if duration == 0 {
		return ctx.Err()
	}
	timer := time.NewTimer(duration)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}
