package server

import (
	"errors"
	"net/http"

	"github.com/modelsphere/console/internal/iam"
)

// handleToken is the OAuth2 token endpoint. Only the password grant is served
// -- the community portal has no need for the RSA/OIDC-provider machinery, and
// the token it mints is HS256, wire-compatible with Global.
func (s *Server) handleToken(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		writeOAuthError(w, http.StatusBadRequest, "invalid_request")
		return
	}
	if r.Form.Get("grant_type") != "password" {
		writeOAuthError(w, http.StatusBadRequest, "unsupported_grant_type")
		return
	}
	tok, err := s.authn.Login(r.Context(), r.Form.Get("username"), r.Form.Get("password"))
	if err != nil {
		if errors.Is(err, iam.ErrAuth) {
			writeOAuthError(w, http.StatusUnauthorized, "invalid_grant")
			return
		}
		s.log.Error("token issue", "err", err)
		writeOAuthError(w, http.StatusInternalServerError, "server_error")
		return
	}
	writeJSON(w, http.StatusOK, tok)
}

func writeOAuthError(w http.ResponseWriter, code int, oauthErr string) {
	writeJSON(w, code, map[string]string{"error": oauthErr})
}
