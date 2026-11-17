package router

import (
	"context"
	"fmt"
	"net/http"
	"slices"
	"strings"

	"github.com/google/uuid"

	"github.com/modelsphere/console/internal/billing"
)

func (rt *Router) SetMetering(meter *billing.Meter) { rt.meter = meter }

func (rt *Router) invoke(writer http.ResponseWriter, request *http.Request, key Key, model string, targets []*Target, source string) {
	invocation, err := newInvocation(key, model, targets, source)
	if err != nil {
		rt.reject(writer, "identity_failed", http.StatusInternalServerError, "server_error", "request_identity_failed", "Request identity cannot be created")
		return
	}
	writer.Header().Set("X-Request-ID", invocation.info.RequestID)
	if !rt.preflight(writer, request, invocation) {
		return
	}
	if rt.meter != nil {
		trace, err := rt.meter.StartRequest(request.Context(), invocation.info.Principal, model, invocation.target.URL.Host, invocation.info.RequestID, invocation.info.AttemptID)
		if err != nil {
			rt.reject(writer, "metering_unavailable", http.StatusServiceUnavailable, "server_error", "metering_unavailable", "Usage metering is unavailable")
			return
		}
		invocation.trace = trace
	}
	upstreamContext, cancel := context.WithCancel(request.Context())
	invocation.cancel = cancel
	protectionInfo := invocation.info
	invocation.guard = newGenerationGuard(rt.pipeline, cancel, func(reason string) {
		protectionInfo.Reason = reason
		if err := rt.phase(context.WithoutCancel(request.Context()), PhaseProtection, protectionInfo); err != nil {
			rt.log.Error("generation protection plugin failed", "request_id", protectionInfo.RequestID, "err", err)
		}
	})
	status := &statusWriter{ResponseWriter: writer, status: http.StatusOK}
	defer rt.finishInvocation(request.Context(), invocation, status, source, key)
	rt.proxy.ServeHTTP(status, request.WithContext(context.WithValue(upstreamContext, callKey{}, invocation)))
	if status.status >= 300 && invocation.reason == "" {
		invocation.reason = "upstream_error"
	}
}

func newInvocation(key Key, model string, targets []*Target, source string) (*call, error) {
	requestID, err := uuid.NewRandom()
	if err != nil {
		return nil, err
	}
	attemptID, err := uuid.NewRandom()
	if err != nil {
		return nil, err
	}
	target := targets[0]
	return &call{target: target, targets: targets, info: RequestInfo{RequestID: requestID.String(), AttemptID: attemptID.String(), Principal: billing.Principal{OwnerUID: key.PrincipalUID, WalletID: key.WalletID, APIKeyID: key.ID, Source: source}, Model: model, Upstream: target.URL.Host}}, nil
}

func (rt *Router) preflight(writer http.ResponseWriter, request *http.Request, invocation *call) bool {
	for _, phase := range []Phase{PhaseAuth, PhaseAdmission, PhaseRoute, PhaseMetering} {
		if err := rt.phase(request.Context(), phase, invocation.info); err != nil {
			rt.log.Warn("inference plugin denied request", "request_id", invocation.info.RequestID, "err", err)
			rt.reject(writer, "plugin_denied", http.StatusForbidden, "permission_error", "request_blocked", "Request rejected by gateway policy")
			return false
		}
	}
	target, ok := rt.availableTarget(invocation.targets)
	if !ok {
		rt.reject(writer, "circuit_open", http.StatusServiceUnavailable, "server_error", "circuit_open", "Inference upstream circuit is open")
		return false
	}
	invocation.target = target
	invocation.info.Upstream = target.URL.Host
	return true
}

// availableTarget is the first route whose upstream circuit allows a new
// request, in preference order, or none when every route is open.
func (rt *Router) availableTarget(targets []*Target) (*Target, bool) {
	for _, target := range targets {
		if rt.circuit.allow(circuitKey(target), rt.pipeline) {
			return target, true
		}
	}
	return nil, false
}

// nextTarget is where a replay goes: the next route in preference order whose
// circuit allows it, wrapping around. With one route it replays where it failed,
// which is still useful for a transient 429 or 503.
func (rt *Router) nextTarget(invocation *call) (*Target, bool) {
	targets := invocation.targets
	current := slices.Index(targets, invocation.target)
	if current < 0 {
		current = 0
	}
	for offset := 1; offset <= len(targets); offset++ {
		target := targets[(current+offset)%len(targets)]
		if rt.circuit.allow(circuitKey(target), rt.pipeline) {
			return target, true
		}
	}
	return nil, false
}

func (rt *Router) finishInvocation(ctx context.Context, invocation *call, status *statusWriter, source string, key Key) {
	invocation.guard.close()
	if invocation.cancel != nil {
		invocation.cancel()
	}
	reason := invocation.guard.Reason()
	if reason == "" {
		reason = invocation.reason
		if ctx.Err() != nil {
			reason = "cancelled"
		}
	}
	if reason == "" {
		reason = "completed"
	}
	invocation.info.Reason, invocation.info.Status = reason, status.status
	if invocation.trace != nil {
		invocation.trace.FinishAttempts(context.WithoutCancel(ctx), reason, invocation.attempts)
		invocation.info.Usage = invocation.trace.Usage()
	}
	failed := !strings.HasPrefix(reason, "generation_") && (invocation.upstreamStatus >= 500 || ((reason == "upstream_error" || reason == "upstream_disconnect") && ctx.Err() == nil))
	rt.circuit.record(circuitKey(invocation.target), failed, rt.pipeline)
	if err := rt.phase(context.WithoutCancel(ctx), PhaseTerminal, invocation.info); err != nil {
		rt.log.Error("terminal plugin failed", "request_id", invocation.info.RequestID, "err", err)
	}
	if source == "sdk" {
		model := invocation.info.Model
		if status.status >= 300 {
			model = ""
		}
		rt.metrics.requests.WithLabelValues(key.ID, key.Name, model, httpStatus(status.status)).Inc()
	}
}

func circuitKey(target *Target) string { return fmt.Sprintf("%s%s", target.URL.Host, target.URL.Path) }

func (rt *Router) ServeSession(writer http.ResponseWriter, request *http.Request, user, principalUID, prefix string, target *Target) {
	store, ok := rt.keys.(*CRDStore)
	if !ok {
		openAIError(writer, http.StatusServiceUnavailable, "server_error", "identity_unavailable", "Session metering requires CRD keys")
		return
	}
	uid, err := store.owner(user, principalUID)
	if err != nil {
		openAIError(writer, http.StatusForbidden, "permission_error", "inactive_user", "User identity is inactive or unavailable")
		return
	}
	if err := store.Admit(uid); err != nil {
		openAIError(writer, http.StatusPaymentRequired, "insufficient_quota", "insufficient_balance", "Wallet balance does not allow new calls")
		return
	}
	forwarded := request.Clone(request.Context())
	forwarded.URL.Path = strings.TrimPrefix(request.URL.Path, prefix)
	body, err := rt.requestBody(writer, forwarded)
	if err != nil {
		return
	}
	model := modelOf(body)
	if model == "" {
		openAIError(writer, http.StatusBadRequest, "invalid_request_error", "missing_model", "The request names no model")
		return
	}
	rt.invoke(writer, forwarded, Key{User: user, PrincipalKind: "User", PrincipalUID: uid, WalletID: uid}, model, []*Target{target}, "session")
}
