package router

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strconv"
	"strings"

	"github.com/modelsphere/console/internal/billing"
	"github.com/prometheus/client_golang/prometheus"
)

// Target is where /v1 goes and the credential it carries there.
type Target struct {
	URL    url.URL
	Header string
	Key    string
}

// Backend is what /v1 forwards to: the models it serves, and where a request for
// one of them goes. A gateway with one route per model answers per model.
type Backend interface {
	Models(ctx context.Context) ([]string, error)
	// Target for model; "" is a request that names none.
	Target(ctx context.Context, model string) (*Target, error)
}

// FailoverBackend is a Backend that can name every place a request for a model
// may go, preferred first: two routes may serve one model, and a failed one can
// hand its request to another without the caller seeing the failure.
type FailoverBackend interface {
	Backend
	Targets(ctx context.Context, model string) ([]*Target, error)
}

var (
	ErrUnknownModel = errors.New("model not served")
	ErrNoModel      = errors.New("request names no model")
)

// Router serves /v1: the caller's API key is checked here and replaced by the
// backend's own credential, so the gateway keeps one key and needs no change.
// Errors use the OpenAI envelope, since the callers are SDKs.
type Router struct {
	importer *CRDStore
	pipeline PipelineOptions
	circuit  *circuitBreaker
	meter    *billing.Meter
	legacy   *Store
	keys     KeyStore
	backend  Backend
	maxBody  int64
	log      *slog.Logger
	metrics  *metrics
	proxy    *httputil.ReverseProxy
}

// New builds a router; a nil backend answers 503 for every call.
func New(keys KeyStore, backend Backend, maxBody int64, log *slog.Logger, reg prometheus.Registerer) *Router {
	rt := &Router{keys: keys, backend: backend, maxBody: maxBody, log: log, metrics: newMetrics(reg)}
	rt.proxy = rt.newProxy()
	rt.pipeline = PipelineOptions{MaxAttempts: 1, MaxSSEFrameBytes: 1 << 20, Transport: http.DefaultTransport}
	rt.circuit = &circuitBreaker{states: map[string]circuitState{}}
	rt.proxy.Transport = &retryTransport{router: rt, base: http.DefaultTransport}
	return rt
}

// call is what the handler decided, for the proxy to act on.
type call struct {
	upstreamStatus int
	guard          *generationGuard
	cancel         context.CancelFunc
	info           RequestInfo
	attempts       []billing.Attempt
	trace          *billing.Trace
	reason         string
	// target is where the current attempt goes; targets are the routes serving
	// the model, preferred first, so a retry can move to another one.
	target  *Target
	targets []*Target
	// applied is the target whose URL and credential the outgoing request
	// already carries; path is the client path the rewrite joined onto it.
	applied *Target
	path    string
}

type callKey struct{}

func callFrom(ctx context.Context) *call {
	c, _ := ctx.Value(callKey{}).(*call)
	return c
}

func (rt *Router) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	key, ok := rt.verifyKey(w, r)
	if !ok {
		return
	}

	body, err := rt.requestBody(w, r)
	if err != nil {
		return
	}

	if rt.backend == nil {
		rt.reject(w, "no_backend", http.StatusServiceUnavailable, "server_error", "service_unavailable", "No inference backend is configured")
		return
	}
	if r.Method == http.MethodGet || r.Method == http.MethodHead {
		if id, ok := modelPath(r.URL.Path); ok {
			rt.serveModels(w, r, key, id)
			return
		}
	}

	model := modelOf(body)
	if msg := modelDenied(key, model); msg != "" {
		rt.reject(w, "model_not_allowed", http.StatusForbidden, "permission_error", "model_not_allowed", msg)
		return
	}
	targets, err := rt.targets(r.Context(), model)
	switch {
	case errors.Is(err, ErrUnknownModel):
		rt.reject(w, "unknown_model", http.StatusNotFound, "invalid_request_error", "model_not_found", fmt.Sprintf("The model %q does not exist", model))
		return
	case errors.Is(err, ErrNoModel):
		rt.reject(w, "no_model", http.StatusBadRequest, "invalid_request_error", "", "The request names no model")
		return
	case err != nil:
		rt.log.Warn("inference backend unresolved", "err", err)
		rt.reject(w, "no_backend", http.StatusBadGateway, "server_error", "bad_gateway", "Inference gateway is unavailable")
		return
	}

	rt.invoke(w, r, key, model, targets, "sdk")
}

// targets is every route a request for model may use, preferred first. A backend
// with one route per model answers with that one.
func (rt *Router) targets(ctx context.Context, model string) ([]*Target, error) {
	if backend, ok := rt.backend.(FailoverBackend); ok {
		targets, err := backend.Targets(ctx, model)
		if err != nil {
			return nil, err
		}
		if len(targets) == 0 {
			if model == "" {
				return nil, ErrNoModel
			}
			return nil, ErrUnknownModel
		}
		return targets, nil
	}
	target, err := rt.backend.Target(ctx, model)
	if err != nil {
		return nil, err
	}
	return []*Target{target}, nil
}

func (rt *Router) verifyKey(w http.ResponseWriter, r *http.Request) (Key, bool) {
	key, err := rt.keys.Verify(r.Context(), apiKeyOf(r))
	switch {
	case errors.Is(err, ErrBillingBlocked):
		rt.reject(w, "billing_blocked", http.StatusPaymentRequired, "insufficient_quota", "insufficient_balance", "Wallet balance does not allow new calls")
		return Key{}, false
	case errors.Is(err, ErrDisabled):
		rt.reject(w, "disabled", http.StatusForbidden, "permission_error", "disabled_api_key", "API key is disabled")
		return Key{}, false
	case errors.Is(err, ErrExpired):
		rt.reject(w, "expired", http.StatusUnauthorized, "invalid_request_error", "expired_api_key", "API key has expired")
		return Key{}, false
	case errors.Is(err, ErrInvalid):
		rt.reject(w, "invalid_key", http.StatusUnauthorized, "invalid_request_error", "invalid_api_key", "Invalid API key")
		return Key{}, false
	case err != nil:
		rt.log.Error("api keys unavailable", "err", err)
		rt.reject(w, "keys_unavailable", http.StatusServiceUnavailable, "server_error", "service_unavailable", "API keys cannot be checked right now")
		return Key{}, false
	}
	rt.metrics.lastRequest.WithLabelValues(key.ID, key.Name).SetToCurrentTime()

	return key, true
}

func (rt *Router) reject(w http.ResponseWriter, reason string, status int, typ, code, message string) {
	rt.metrics.rejected.WithLabelValues(reason).Inc()
	openAIError(w, status, typ, code, message)
}

func modelOf(body []byte) string {
	var req struct {
		Model string `json:"model"`
	}
	_ = json.Unmarshal(body, &req)
	return req.Model
}

// modelDenied is why a key limited to some models may not make this request, or
// "". A request that names no model (multipart, files, batches) is outside what
// such a key can be checked against, so it is refused rather than let through.
func modelDenied(key Key, model string) string {
	switch {
	case len(key.Models) == 0:
		return ""
	case model == "":
		return "This API key is limited to certain models, and the request names none"
	case !key.Allows(model):
		return fmt.Sprintf("This API key may not use model %q", model)
	}
	return ""
}

// modelPath matches /v1/models and /v1/models/<id>, which the router answers
// itself: the models may live on several routes, none of which lists them all.
func modelPath(path string) (id string, ok bool) {
	rest, ok := strings.CutPrefix(path, "/v1/models")
	switch {
	case !ok:
		return "", false
	case rest == "" || rest == "/":
		return "", true
	case strings.HasPrefix(rest, "/"):
		return strings.TrimPrefix(rest, "/"), true
	}
	return "", false
}

// serveModels lists the models the key may use, or describes one.
func (rt *Router) serveModels(w http.ResponseWriter, r *http.Request, key Key, id string) {
	models, err := rt.backend.Models(r.Context())
	if err != nil {
		rt.log.Warn("model list unavailable", "err", err)
		rt.reject(w, "no_backend", http.StatusBadGateway, "server_error", "bad_gateway", "Inference gateway is unavailable")
		return
	}
	var visible []map[string]string
	for _, m := range models {
		if key.Allows(m) {
			visible = append(visible, map[string]string{"id": m, "object": "model", "owned_by": "modelsphere"})
		}
	}
	if id == "" {
		if visible == nil {
			visible = []map[string]string{}
		}
		writeJSON(w, http.StatusOK, map[string]any{"object": "list", "data": visible})
		rt.metrics.requests.WithLabelValues(key.ID, key.Name, "", "200").Inc()
		return
	}
	for _, m := range visible {
		if m["id"] == id {
			writeJSON(w, http.StatusOK, m)
			rt.metrics.requests.WithLabelValues(key.ID, key.Name, id, "200").Inc()
			return
		}
	}
	if !key.Allows(id) {
		rt.reject(w, "model_not_allowed", http.StatusForbidden, "permission_error", "model_not_allowed", fmt.Sprintf("This API key may not use model %q", id))
		return
	}
	rt.reject(w, "unknown_model", http.StatusNotFound, "invalid_request_error", "model_not_found", fmt.Sprintf("The model %q does not exist", id))
}

// unresolved stands in for a request that reached the proxy without a target: it
// has to fail to connect rather than go anywhere.
var unresolved = &Target{URL: url.URL{Scheme: "http", Host: "router-without-target.invalid"}}

func (rt *Router) newProxy() *httputil.ReverseProxy {
	return &httputil.ReverseProxy{
		Rewrite: rt.rewriteProxy,
		ModifyResponse: func(response *http.Response) error {
			invocation := callFrom(response.Request.Context())
			if invocation != nil {
				invocation.upstreamStatus = response.StatusCode
				invocation.info.Status = response.StatusCode
				if err := rt.phase(response.Request.Context(), PhaseResponse, invocation.info); err != nil {
					invocation.reason = "plugin_rejected"
					return err
				}
			}
			if invocation != nil && (invocation.trace != nil || invocation.guard != nil) {
				if invocation.trace != nil {
					invocation.trace.Observe(billing.Usage{}, response.Header.Get("X-Request-ID"))
				}
				response.Body = observeBody(response.Body, invocation.trace, response.Header.Get("Content-Type"), func(error) { invocation.reason = "upstream_disconnect" }, invocation.guard, rt.pipeline.MaxSSEFrameBytes)
			}
			return nil
		},
		FlushInterval: -1,
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			if invocation := callFrom(r.Context()); invocation != nil {
				if invocation.reason == "" {
					invocation.reason = "upstream_error"
				}
				if reason := invocation.guard.Reason(); reason != "" {
					openAIError(w, http.StatusGatewayTimeout, "server_error", "generation_protection", "Generation stopped: "+reason)
					return
				}
			}
			rt.log.Warn("inference backend unreachable", "path", r.URL.Path, "err", err)
			openAIError(w, http.StatusBadGateway, "server_error", "bad_gateway", "Inference gateway is unreachable")
		},
	}
}

func (rt *Router) rewriteProxy(pr *httputil.ProxyRequest) {
	target := unresolved
	c := callFrom(pr.In.Context())
	if c != nil && c.target != nil {
		target = c.target
		c.path, c.applied = pr.In.URL.Path, target
	}
	pr.Out.URL.RawPath = ""
	pr.SetURL(&target.URL)
	pr.SetXForwarded()
	for k := range pr.Out.Header {
		if strings.HasPrefix(http.CanonicalHeaderKey(k), "X-Remote-") {
			pr.Out.Header.Del(k)
		}
	}
	pr.Out.Header.Del("Cookie")
	pr.Out.Header.Del("Accept-Encoding")
	for _, header := range []string{"Idempotency-Key", "X-Idempotency-Key", "X-Api-Key", "Api-Key", "Proxy-Authorization"} {
		pr.Out.Header.Del(header)
	}
	pr.Out.Header.Del("Authorization")
	if target.Key != "" {
		pr.Out.Header.Set(target.Header, target.Key)
	}
}

func apiKeyOf(r *http.Request) string {
	scheme, value, ok := strings.Cut(r.Header.Get("Authorization"), " ")
	if !ok || !strings.EqualFold(scheme, "Bearer") {
		return ""
	}
	return strings.TrimSpace(value)
}

func openAIError(w http.ResponseWriter, status int, typ, code, message string) {
	body := map[string]any{"message": message, "type": typ, "code": nil}
	if code != "" {
		body["code"] = code
	}
	writeJSON(w, status, map[string]any{"error": body})
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(v)
}

func writeError(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}

// statusWriter records the status the proxy answered with; Unwrap keeps the
// proxy's flushes reaching the connection.
type statusWriter struct {
	http.ResponseWriter
	status int
	wrote  bool
}

func (w *statusWriter) WriteHeader(code int) {
	if !w.wrote {
		w.status, w.wrote = code, true
	}
	w.ResponseWriter.WriteHeader(code)
}

func (w *statusWriter) Write(b []byte) (int, error) {
	w.wrote = true
	return w.ResponseWriter.Write(b)
}

func (w *statusWriter) Flush() {
	if f, ok := w.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

func (w *statusWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

func (rt *Router) requestBody(w http.ResponseWriter, r *http.Request) ([]byte, error) {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, rt.maxBody))
	if err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			rt.reject(w, "too_large", http.StatusRequestEntityTooLarge, "invalid_request_error", "request_too_large", fmt.Sprintf("Request body exceeds %d bytes", tooLarge.Limit))
		} else {
			rt.reject(w, "unreadable", http.StatusBadRequest, "invalid_request_error", "", "Request body could not be read")
		}
		return nil, err
	}
	r.Body = io.NopCloser(bytes.NewReader(body))
	r.GetBody = func() (io.ReadCloser, error) { return io.NopCloser(bytes.NewReader(body)), nil }
	r.ContentLength = int64(len(body))
	r.Header.Set("Content-Length", strconv.Itoa(len(body)))
	return body, nil
}

func httpStatus(status int) string { return strconv.Itoa(status) }
