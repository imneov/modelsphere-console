package router

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptrace"
	"slices"
	"strings"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/modelsphere/console/internal/billing"
)

type retryTransport struct {
	router *Router
	base   http.RoundTripper
}

// RoundTrip replays a request only while the upstream cannot have consumed it:
// a transport failure before the body was written, or a status that says no
// completion was produced. An error after the write is the client's answer,
// because the upstream may have generated (and charged) without saying so.
func (transport *retryTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	invocation := callFrom(request.Context())
	if invocation == nil {
		return transport.base.RoundTrip(request)
	}
	options := transport.router.pipeline
	for attempt := 0; attempt < options.MaxAttempts; attempt++ {
		outgoing, err := transport.prepare(request, invocation, attempt)
		if err != nil {
			return nil, err
		}
		var wrote atomic.Bool
		trace := &httptrace.ClientTrace{WroteRequest: func(httptrace.WroteRequestInfo) { wrote.Store(true) }}
		outgoing = outgoing.WithContext(httptrace.WithClientTrace(outgoing.Context(), trace))
		response, err := transport.base.RoundTrip(outgoing)
		if err == nil && response.Request == nil {
			response.Request = outgoing
		}
		received := &invocation.attempts[len(invocation.attempts)-1]

		if err == nil && !slices.Contains(options.FailoverStatuses, response.StatusCode) {
			received.Reason = "response_received"
			return response, nil
		}
		if attempt+1 >= options.MaxAttempts || request.Context().Err() != nil {
			received.Reason = "upstream_error"
			if err == nil {
				received.Reason = "upstream_status"
			}
			return response, err
		}
		if err != nil && wrote.Load() {
			received.Reason = "uncertain_consumption"
			return nil, err
		}
		// The failed route is this attempt's failure; the next attempt picks
		// another route serving the model, skipping routes whose circuit is open.
		transport.router.circuit.record(circuitKey(invocation.target), true, options)
		next, ok := transport.router.nextTarget(invocation)
		if !ok {
			received.Reason = "upstream_error"
			if err == nil {
				received.Reason = "upstream_status"
			}
			return response, err
		}
		if response != nil {
			// This answer is not delivered: drain it so the connection can be reused.
			_ = drainResponse(response)
		}
		received.Reason = "connection_failed"
		if err == nil {
			received.Reason = "upstream_status"
		}
		invocation.target = next
		invocation.info.Upstream = next.URL.Host
		if err := retryDelay(request.Context(), options.RetryBackoff); err != nil {
			return nil, err
		}
	}
	return nil, errors.New("inference retry exhausted")
}

// prepare builds the request for one attempt: a fresh body and attempt identity
// for a replay, and the route this attempt uses.
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
	transport.applyTarget(outgoing, invocation)
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

// applyTarget points an attempt at the route it uses. The first attempt finds
// the URL and credential already applied by the proxy's rewrite; a replay that
// moved to another route swaps both.
func (transport *retryTransport) applyTarget(outgoing *http.Request, invocation *call) {
	target := invocation.target
	if invocation.applied == target {
		return
	}
	if previous := invocation.applied; previous != nil && previous.Header != "" && !strings.EqualFold(previous.Header, target.Header) {
		outgoing.Header.Del(previous.Header)
	}
	outgoing.URL.Scheme, outgoing.URL.Host = target.URL.Scheme, target.URL.Host
	outgoing.URL.Path = joinRoutePath(target.URL.Path, invocation.path)
	outgoing.URL.RawPath = ""
	outgoing.Host = ""
	if target.Header != "" {
		outgoing.Header.Set(target.Header, target.Key)
	}
	invocation.applied = target
}

// joinRoutePath joins a route's base path with the client path, the way the
// proxy's own URL rewrite does.
func joinRoutePath(base, path string) string {
	switch {
	case base == "":
		return path
	case path == "":
		return base
	}
	switch {
	case strings.HasSuffix(base, "/") && strings.HasPrefix(path, "/"):
		return base + path[1:]
	case !strings.HasSuffix(base, "/") && !strings.HasPrefix(path, "/"):
		return base + "/" + path
	}
	return base + path
}

// drainResponse discards an answer that is being replayed. A close error costs
// at most the connection, so it does not stop the replay.
func drainResponse(response *http.Response) error {
	if response.Body == nil {
		return nil
	}
	_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 64<<10))
	return response.Body.Close()
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
