package inferenceauth

import (
	"errors"
	"net/http"
	"slices"
	"strings"

	"github.com/modelsphere/console/internal/iam"
	"github.com/modelsphere/console/internal/router"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
)

func (handler *Handler) check(request *http.Request, path string) (principal, string, *rejection) {
	session := strings.HasPrefix(path, "/api/llm/")
	if !isCatalog(path) && path != "/v1/chat/completions" && path != "/api/llm/v1/chat/completions" {
		return principal{}, "", denied(http.StatusNotFound, "unsupported_path", "Unsupported inference endpoint")
	}
	if (isCatalog(path) && request.Method != http.MethodGet) || (!isCatalog(path) && request.Method != http.MethodPost) {
		return principal{}, "", denied(http.StatusMethodNotAllowed, "unsupported_method", "Unsupported inference method")
	}
	if route := request.Header.Get("X-ModelSphere-Route"); route != "" && route != handler.options.Route {
		return principal{}, "", denied(http.StatusBadRequest, "unknown_route", "Route is not served by this entrypoint")
	}
	var caller principal
	var failure *rejection
	if session {
		caller, failure = handler.session(request)
	} else {
		caller, failure = handler.sdk(request)
	}
	if failure != nil || isCatalog(path) {
		return caller, "", failure
	}
	model, failure := requestModel(request, handler.maxBody)
	if failure != nil {
		return principal{}, "", failure
	}
	if !slices.Contains(handler.options.Models, model) {
		return principal{}, "", denied(http.StatusNotFound, "model_not_found", "Model is not served by this entrypoint")
	}
	if len(caller.models) > 0 && !slices.Contains(caller.models, model) {
		return principal{}, "", denied(http.StatusForbidden, "model_not_allowed", "API key may not use this model")
	}
	return caller, model, nil
}

func (handler *Handler) sdk(request *http.Request) (principal, *rejection) {
	credential := bearer(request)
	if credential == "" {
		return principal{}, denied(http.StatusUnauthorized, "invalid_api_key", "A Bearer API key is required")
	}
	key, err := handler.directory.Verify(request.Context(), credential)
	if err != nil {
		return principal{}, credentialFailure(err)
	}
	if key.PrincipalUID == "" || key.User == "" || key.ID == "" {
		return principal{}, denied(http.StatusForbidden, "unresolved_owner", "API key has no canonical owner")
	}
	return principal{uid: key.PrincipalUID, user: key.User, source: "sdk", keyID: key.ID, models: key.Models}, nil
}

func (handler *Handler) session(request *http.Request) (principal, *rejection) {
	credential, failure := handler.sessionCredential(request)
	if failure != nil {
		return principal{}, failure
	}
	identity, err := handler.signer.Verify(credential)
	if err != nil || identity == nil {
		return principal{}, denied(http.StatusUnauthorized, "invalid_session", "A valid Console session is required")
	}
	user, err := handler.directory.SessionUser(request.Context(), identity.Name)
	if apierrors.IsNotFound(err) {
		return principal{}, denied(http.StatusUnauthorized, "invalid_session", "Session user no longer exists")
	}
	if err != nil {
		return principal{}, denied(http.StatusServiceUnavailable, "identity_unavailable", "User identity cannot be checked")
	}
	resolved, err := iam.ResolveSession(identity, user)
	if err != nil {
		return principal{}, denied(http.StatusUnauthorized, "invalid_session", "Session no longer matches the active user")
	}
	if user.RequiresPasswordReset() {
		return principal{}, denied(http.StatusForbidden, "password_reset_required", "Change the initial password before inference")
	}
	return handler.authorizeSession(request, resolved)
}

func (handler *Handler) authorizeSession(request *http.Request, resolved *iam.Identity) (principal, *rejection) {
	verb := "get"
	if request.Method == http.MethodPost {
		verb = "create"
	}
	allowed, err := handler.authorizer.Authorize(request.Context(), resolved, iam.Attributes{Verb: verb, APIGroup: iam.Group, Resource: "backends", Name: handler.backend})
	if err != nil {
		return principal{}, denied(http.StatusServiceUnavailable, "authorization_unavailable", "User permissions cannot be checked")
	}
	if !allowed {
		return principal{}, denied(http.StatusForbidden, "permission_denied", "User may not access inference")
	}
	if err := handler.directory.Admit(resolved.PrincipalUID); err != nil {
		return principal{}, credentialFailure(err)
	}
	return principal{uid: resolved.PrincipalUID, user: resolved.Name, source: "session"}, nil
}

func (handler *Handler) sessionCredential(request *http.Request) (string, *rejection) {
	if origin := request.Header.Get("Origin"); origin != "" && origin != handler.options.SessionOrigin {
		return "", denied(http.StatusForbidden, "invalid_origin", "Cross-origin inference is not allowed")
	}
	if request.Header.Get("Authorization") != "" {
		if credential := bearer(request); credential != "" {
			return credential, nil
		}
		return "", denied(http.StatusUnauthorized, "invalid_session", "A valid Bearer session is required")
	}
	cookie, err := request.Cookie("token")
	if err != nil || cookie.Value == "" {
		return "", denied(http.StatusUnauthorized, "invalid_session", "A Console session is required")
	}
	if request.Method != http.MethodGet && request.Header.Get("Origin") != handler.options.SessionOrigin {
		return "", denied(http.StatusForbidden, "invalid_origin", "Cookie-authenticated inference requires the Console Origin")
	}
	return cookie.Value, nil
}

func bearer(request *http.Request) string {
	values := request.Header.Values("Authorization")
	if len(values) != 1 {
		return ""
	}
	parts := strings.Fields(values[0])
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return ""
	}
	return parts[1]
}

func credentialFailure(err error) *rejection {
	switch {
	case errors.Is(err, router.ErrBillingBlocked):
		return denied(http.StatusPaymentRequired, "insufficient_balance", "Wallet balance does not allow new calls")
	case errors.Is(err, router.ErrDisabled):
		return denied(http.StatusForbidden, "disabled_api_key", "API key or its user is disabled")
	case errors.Is(err, router.ErrExpired):
		return denied(http.StatusUnauthorized, "expired_api_key", "API key has expired")
	case errors.Is(err, router.ErrInvalid):
		return denied(http.StatusUnauthorized, "invalid_api_key", "Invalid API key")
	default:
		return denied(http.StatusServiceUnavailable, "identity_unavailable", "Inference identity cannot be checked")
	}
}
