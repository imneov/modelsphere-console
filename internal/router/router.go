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

	"github.com/prometheus/client_golang/prometheus"
)

// Target is where /v1 goes and the credential it carries there.
type Target struct {
	URL    url.URL
	Header string
	Key    string
}

type Resolver func(context.Context) (*Target, error)

// Router serves /v1: the caller's API key is checked here and replaced by the
// backend's own credential, so the gateway keeps one key and needs no change.
// Errors use the OpenAI envelope, since the callers are SDKs.
type Router struct {
	keys    *Store
	resolve Resolver
	maxBody int64
	log     *slog.Logger
	metrics *metrics
	proxy   *httputil.ReverseProxy
}

// New builds a router; a nil resolve answers 503 for every call.
func New(keys *Store, resolve Resolver, maxBody int64, log *slog.Logger, reg prometheus.Registerer) *Router {
	rt := &Router{keys: keys, resolve: resolve, maxBody: maxBody, log: log, metrics: newMetrics(reg)}
	rt.proxy = rt.newProxy()
	return rt
}

// call is what the handler decided, for the proxy to act on.
type call struct {
	key    Key
	target *Target
	// filterModels: a key limited to some models lists only those.
	filterModels bool
}

type callKey struct{}

func callFrom(ctx context.Context) *call {
	c, _ := ctx.Value(callKey{}).(*call)
	return c
}

func (rt *Router) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	key, err := rt.keys.Verify(r.Context(), apiKeyOf(r))
	switch {
	case errors.Is(err, ErrExpired):
		rt.reject(w, "expired", http.StatusUnauthorized, "invalid_request_error", "expired_api_key", "API key has expired")
		return
	case errors.Is(err, ErrInvalid):
		rt.reject(w, "invalid_key", http.StatusUnauthorized, "invalid_request_error", "invalid_api_key", "Invalid API key")
		return
	case err != nil:
		rt.log.Error("api keys unavailable", "err", err)
		rt.reject(w, "keys_unavailable", http.StatusServiceUnavailable, "server_error", "service_unavailable", "API keys cannot be checked right now")
		return
	}
	rt.metrics.lastRequest.WithLabelValues(key.ID, key.Name).SetToCurrentTime()

	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, rt.maxBody))
	if err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			rt.reject(w, "too_large", http.StatusRequestEntityTooLarge, "invalid_request_error", "request_too_large",
				fmt.Sprintf("Request body exceeds %d bytes", tooLarge.Limit))
			return
		}
		rt.reject(w, "unreadable", http.StatusBadRequest, "invalid_request_error", "", "Request body could not be read")
		return
	}
	r.Body = io.NopCloser(bytes.NewReader(body))
	r.ContentLength = int64(len(body))
	r.Header.Set("Content-Length", strconv.Itoa(len(body)))

	model := modelOf(body)
	if msg := modelDenied(key, r, model); msg != "" {
		rt.reject(w, "model_not_allowed", http.StatusForbidden, "permission_error", "model_not_allowed", msg)
		return
	}

	if rt.resolve == nil {
		rt.reject(w, "no_backend", http.StatusServiceUnavailable, "server_error", "service_unavailable", "No inference backend is configured")
		return
	}
	target, err := rt.resolve(r.Context())
	if err != nil {
		rt.log.Warn("inference backend unresolved", "err", err)
		rt.reject(w, "no_backend", http.StatusBadGateway, "server_error", "bad_gateway", "Inference gateway is unavailable")
		return
	}

	c := &call{key: key, target: target, filterModels: len(key.Models) > 0 && r.Method == http.MethodGet && strings.TrimSuffix(r.URL.Path, "/") == "/v1/models"}
	sw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
	rt.proxy.ServeHTTP(sw, r.WithContext(context.WithValue(r.Context(), callKey{}, c)))
	// The model label comes from a request the gateway accepted, so a caller
	// cannot mint series by naming models that do not exist.
	if sw.status >= 300 {
		model = ""
	}
	rt.metrics.requests.WithLabelValues(key.ID, key.Name, model, strconv.Itoa(sw.status)).Inc()
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
func modelDenied(key Key, r *http.Request, model string) string {
	if len(key.Models) == 0 {
		return ""
	}
	if r.Method == http.MethodGet || r.Method == http.MethodHead {
		switch id, _ := strings.CutPrefix(r.URL.Path, "/v1/models"); {
		case id == "" || id == "/":
			return ""
		case strings.HasPrefix(id, "/") && key.Allows(strings.TrimPrefix(id, "/")):
			return ""
		}
		return "This API key is limited to certain models"
	}
	if model == "" {
		return "This API key is limited to certain models, and the request names none"
	}
	if !key.Allows(model) {
		return fmt.Sprintf("This API key may not use model %q", model)
	}
	return ""
}

// unresolved stands in for a request that reached the proxy without a target: it
// has to fail to connect rather than go anywhere.
var unresolved = &Target{URL: url.URL{Scheme: "http", Host: "router-without-target.invalid"}}

func (rt *Router) newProxy() *httputil.ReverseProxy {
	return &httputil.ReverseProxy{
		Rewrite: func(pr *httputil.ProxyRequest) {
			target := unresolved
			c := callFrom(pr.In.Context())
			if c != nil && c.target != nil {
				target = c.target
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
			pr.Out.Header.Del("Authorization")
			if target.Key != "" {
				pr.Out.Header.Set(target.Header, target.Key)
			}
			if c != nil && c.filterModels {
				// Plain bytes back, so the list can be rewritten.
				pr.Out.Header.Del("Accept-Encoding")
			}
		},
		FlushInterval: -1,
		ModifyResponse: func(resp *http.Response) error {
			c := callFrom(resp.Request.Context())
			if resp.StatusCode != http.StatusOK || c == nil || !c.filterModels {
				return nil
			}
			return filterModelList(resp, c.key)
		},
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			rt.log.Warn("inference backend unreachable", "path", r.URL.Path, "err", err)
			openAIError(w, http.StatusBadGateway, "server_error", "bad_gateway", "Inference gateway is unreachable")
		},
	}
}

func filterModelList(resp *http.Response, key Key) error {
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	resp.Body.Close()
	if err != nil {
		return err
	}
	var list map[string]json.RawMessage
	if err := json.Unmarshal(raw, &list); err != nil {
		return fmt.Errorf("model list is not JSON: %w", err)
	}
	var models []json.RawMessage
	if err := json.Unmarshal(list["data"], &models); err != nil {
		return fmt.Errorf("model list has no data array: %w", err)
	}
	kept := []json.RawMessage{}
	for _, m := range models {
		var id struct {
			ID string `json:"id"`
		}
		if json.Unmarshal(m, &id) == nil && key.Allows(id.ID) {
			kept = append(kept, m)
		}
	}
	if list["data"], err = json.Marshal(kept); err != nil {
		return err
	}
	if raw, err = json.Marshal(list); err != nil {
		return err
	}
	resp.Body = io.NopCloser(bytes.NewReader(raw))
	resp.ContentLength = int64(len(raw))
	resp.Header.Set("Content-Length", strconv.Itoa(len(raw)))
	resp.Header.Del("Content-Encoding")
	return nil
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
