// Package inferenceauth authorizes Higress requests without forwarding inference traffic.
package inferenceauth

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/modelsphere/console/internal/config"
	"github.com/modelsphere/console/internal/iam"
	"github.com/modelsphere/console/internal/router"
)

type Directory interface {
	Verify(context.Context, string) (router.Key, error)
	SessionUser(context.Context, string) (*iam.User, error)
	Admit(string) error
	WalletAdmission(string) (string, int64)
}

type TokenVerifier interface {
	Verify(string) (*iam.Identity, error)
}

type Authorizer interface {
	Authorize(context.Context, *iam.Identity, iam.Attributes) (bool, error)
}

type Handler struct {
	directory  Directory
	signer     TokenVerifier
	authorizer Authorizer
	options    config.Higress
	backend    string
	maxBody    int64
	log        *slog.Logger
}

type principal struct {
	uid, user, source, keyID string
	models                   []string
}

func New(directory Directory, signer TokenVerifier, authorizer Authorizer, cfg *config.Config, log *slog.Logger) (*Handler, error) {
	if directory == nil || signer == nil || authorizer == nil || log == nil || cfg == nil {
		return nil, fmt.Errorf("inference authorization requires directory, signer, authorizer, configuration and logger")
	}
	if !cfg.Higress.Enabled {
		return nil, fmt.Errorf("inference authorization requires higress.enabled")
	}
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	maxBody := cfg.Router.MaxBodyBytes
	if maxBody == 0 {
		maxBody = config.DefaultMaxBodyBytes
	}
	return &Handler{directory: directory, signer: signer, authorizer: authorizer, options: cfg.Higress,
		backend: cfg.Router.Backend, maxBody: maxBody, log: log}, nil
}

func (handler *Handler) ServeHTTP(writer http.ResponseWriter, request *http.Request) {
	writer.Header().Set("Cache-Control", "no-store")
	if request.URL.Path == "/healthz" || request.URL.Path == "/readyz" {
		writer.WriteHeader(http.StatusOK)
		return
	}
	path, authorization := strings.CutPrefix(request.URL.Path, "/authorize")
	if !authorization {
		path = request.URL.Path
	}
	caller, model, failure := handler.check(request, path)
	if failure != nil {
		handler.reject(writer, failure)
		return
	}
	if !authorization {
		if request.Method != http.MethodGet || !isCatalog(path) {
			handler.reject(writer, denied(http.StatusNotFound, "unsupported_path", "Only authorization and model catalog endpoints are served here"))
			return
		}
		handler.catalog(writer, path, caller)
		return
	}
	if err := handler.identityHeaders(writer.Header(), caller, model); err != nil {
		handler.reject(writer, denied(http.StatusServiceUnavailable, "identity_unavailable", "Could not allocate a request identity"))
		return
	}
	writer.WriteHeader(http.StatusOK)
}

func (handler *Handler) identityHeaders(headers http.Header, caller principal, model string) error {
	requestID, err := uuid.NewRandom()
	if err != nil {
		return err
	}
	_, revision := handler.directory.WalletAdmission(caller.uid)
	headers.Set("X-Console-Principal-Uid", caller.uid)
	headers.Set("X-Console-User", caller.user)
	headers.Set("X-Console-Source", caller.source)
	headers.Set("X-Console-Api-Key-Id", caller.keyID)
	headers.Set("X-Console-Model", model)
	headers.Set("X-Console-Wallet-Revision", strconv.FormatInt(revision, 10))
	headers.Set("X-Console-Request-Id", requestID.String())
	return nil
}

type rejection struct {
	status        int
	code, message string
}

func denied(status int, code, message string) *rejection {
	return &rejection{status: status, code: code, message: message}
}

func (handler *Handler) reject(writer http.ResponseWriter, failure *rejection) {
	handler.log.Warn("inference authorization rejected", "status", failure.status, "code", failure.code)
	handler.writeJSON(writer, failure.status, map[string]any{"error": map[string]string{
		"type": errorType(failure.status), "code": failure.code, "message": failure.message,
	}})
}

func errorType(status int) string {
	switch {
	case status >= http.StatusInternalServerError:
		return "server_error"
	case status == http.StatusPaymentRequired:
		return "insufficient_quota"
	case status == http.StatusForbidden:
		return "permission_error"
	default:
		return "invalid_request_error"
	}
}

func (handler *Handler) writeJSON(writer http.ResponseWriter, status int, body any) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	if err := json.NewEncoder(writer).Encode(body); err != nil {
		handler.log.Warn("authorization response write failed", "status", status)
	}
}
