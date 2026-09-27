package server

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httputil"
	"strconv"
	"strings"

	"github.com/modelsphere/console/internal/apikey"
	"github.com/modelsphere/console/internal/config"
)

// inferenceCall is what the handler decided, for the proxy to act on.
type inferenceCall struct {
	key apikey.Key
	// filterModels: a key limited to some models lists only those.
	filterModels bool
}

type inferenceCallKey struct{}

func callFrom(ctx context.Context) *inferenceCall {
	c, _ := ctx.Value(inferenceCallKey{}).(*inferenceCall)
	return c
}

// mountInference serves /v1 for API keys: the caller's key is checked here and
// replaced by the backend's own credential, so the gateway keeps one key and
// needs no change. Errors use the OpenAI envelope, since the callers are SDKs.
func (s *Server) mountInference(mux *http.ServeMux, resolve targetResolver) {
	if resolve == nil {
		s.log.Error("/v1 has no backend: it was skipped at startup", "backend", s.cfg.APIKeys.Backend)
	}
	proxy := s.inferenceProxy()
	mux.HandleFunc("/v1/", func(w http.ResponseWriter, r *http.Request) {
		key, err := s.keys.Verify(r.Context(), apiKeyOf(r))
		switch {
		case errors.Is(err, apikey.ErrExpired):
			openAIError(w, http.StatusUnauthorized, "invalid_request_error", "expired_api_key", "API key has expired")
			return
		case errors.Is(err, apikey.ErrInvalid):
			openAIError(w, http.StatusUnauthorized, "invalid_request_error", "invalid_api_key", "Invalid API key")
			return
		case err != nil:
			s.log.Error("api keys unavailable", "err", err)
			openAIError(w, http.StatusServiceUnavailable, "server_error", "service_unavailable", "API keys cannot be checked right now")
			return
		}

		limit := s.cfg.APIKeys.MaxBodyBytes
		if limit <= 0 {
			limit = config.DefaultMaxBodyBytes
		}
		body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, limit))
		if err != nil {
			var tooLarge *http.MaxBytesError
			if errors.As(err, &tooLarge) {
				openAIError(w, http.StatusRequestEntityTooLarge, "invalid_request_error", "request_too_large",
					fmt.Sprintf("Request body exceeds %d bytes", tooLarge.Limit))
				return
			}
			openAIError(w, http.StatusBadRequest, "invalid_request_error", "", "Request body could not be read")
			return
		}
		r.Body = io.NopCloser(bytes.NewReader(body))
		r.ContentLength = int64(len(body))
		r.Header.Set("Content-Length", strconv.Itoa(len(body)))

		if msg := modelDenied(key, r, body); msg != "" {
			openAIError(w, http.StatusForbidden, "permission_error", "model_not_allowed", msg)
			return
		}
		s.keys.Touch(key.ID)

		if resolve == nil {
			openAIError(w, http.StatusServiceUnavailable, "server_error", "service_unavailable", "No inference backend is configured")
			return
		}
		target, err := resolve(r.Context())
		if err != nil {
			s.log.Warn("inference backend unresolved", "err", err)
			openAIError(w, http.StatusBadGateway, "server_error", "bad_gateway", "Inference gateway is unavailable")
			return
		}
		call := &inferenceCall{key: key, filterModels: len(key.Models) > 0 && r.Method == http.MethodGet && strings.TrimSuffix(r.URL.Path, "/") == "/v1/models"}
		ctx := context.WithValue(withTarget(r.Context(), target), inferenceCallKey{}, call)
		proxy.ServeHTTP(w, r.WithContext(ctx))
	})
}

// modelDenied is why a key limited to some models may not make this request, or
// "". The model is read from a JSON body; a request that names none (multipart,
// files, batches) is outside what such a key can be checked against, so it is
// refused rather than let through.
func modelDenied(key apikey.Key, r *http.Request, body []byte) string {
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
	var req struct {
		Model string `json:"model"`
	}
	if json.Unmarshal(body, &req) != nil || req.Model == "" {
		return "This API key is limited to certain models, and the request names none"
	}
	if !key.Allows(req.Model) {
		return fmt.Sprintf("This API key may not use model %q", req.Model)
	}
	return ""
}

func (s *Server) inferenceProxy() *httputil.ReverseProxy {
	return &httputil.ReverseProxy{
		Rewrite: func(pr *httputil.ProxyRequest) {
			target := targetFrom(pr.In.Context())
			if target == nil {
				target = unresolved
			}
			pr.Out.URL.RawPath = ""
			pr.SetURL(&target.url)
			pr.SetXForwarded()
			for k := range pr.Out.Header {
				if strings.HasPrefix(http.CanonicalHeaderKey(k), "X-Remote-") {
					pr.Out.Header.Del(k)
				}
			}
			pr.Out.Header.Del("Cookie")
			pr.Out.Header.Del("Authorization")
			if target.key != "" {
				pr.Out.Header.Set(target.header, target.key)
			}
			if c := callFrom(pr.In.Context()); c != nil && c.filterModels {
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
			s.log.Warn("inference backend unreachable", "path", r.URL.Path, "err", err)
			openAIError(w, http.StatusBadGateway, "server_error", "bad_gateway", "Inference gateway is unreachable")
		},
	}
}

func filterModelList(resp *http.Response, key apikey.Key) error {
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
