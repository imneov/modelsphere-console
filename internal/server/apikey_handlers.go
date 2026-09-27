package server

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/modelsphere/console/internal/apikey"
)

// apiKeyResource is the RBAC resource guarding key management: list, create,
// delete. Only system:masters has it unless a role grants it.
const apiKeyResource = "apikeys"

// expiryDays are the lifetimes offered, 0 being never.
var expiryDays = map[int]bool{0: true, 7: true, 30: true, 180: true}

type apiKeyView struct {
	ID          string     `json:"id"`
	Name        string     `json:"name"`
	Description string     `json:"description,omitempty"`
	MaskedValue string     `json:"maskedValue"`
	Models      []string   `json:"models,omitempty"`
	CreatedBy   string     `json:"createdBy"`
	CreatedAt   time.Time  `json:"createdAt"`
	ExpiresAt   *time.Time `json:"expiresAt,omitempty"`
	LastUsedAt  *time.Time `json:"lastUsedAt,omitempty"`
	Expired     bool       `json:"expired"`
	// Value is the plaintext key, set only in the response that created it.
	Value string `json:"value,omitempty"`
}

func toAPIKeyView(k apikey.Key, now time.Time) apiKeyView {
	return apiKeyView{
		ID: k.ID, Name: k.Name, Description: k.Description, MaskedValue: k.Masked(),
		Models: k.Models, CreatedBy: k.CreatedBy, CreatedAt: k.CreatedAt,
		ExpiresAt: k.ExpiresAt, LastUsedAt: k.LastUsedAt, Expired: k.Expired(now),
	}
}

func (s *Server) handleListAPIKeys(w http.ResponseWriter, r *http.Request) {
	if !s.authorize(w, r, "list", apiKeyResource, "") {
		return
	}
	keys, err := s.keys.List(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	now := time.Now()
	out := make([]apiKeyView, 0, len(keys))
	for _, k := range keys {
		out = append(out, toAPIKeyView(k, now))
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": out})
}

func (s *Server) handleCreateAPIKey(w http.ResponseWriter, r *http.Request) {
	if !s.authorize(w, r, "create", apiKeyResource, "") {
		return
	}
	var in struct {
		Name          string   `json:"name"`
		Description   string   `json:"description"`
		ExpiresInDays int      `json:"expiresInDays"`
		Models        []string `json:"models"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if !expiryDays[in.ExpiresInDays] {
		writeError(w, http.StatusBadRequest, "expiresInDays must be 7, 30, 180, or 0 for never")
		return
	}
	key, value, err := s.keys.Create(r.Context(), apikey.Input{
		Name: in.Name, Description: in.Description, Models: in.Models,
		ExpiresIn: time.Duration(in.ExpiresInDays) * 24 * time.Hour,
		CreatedBy: identityFrom(r.Context()).Name,
	})
	switch {
	case errors.Is(err, apikey.ErrExists):
		writeError(w, http.StatusConflict, err.Error())
		return
	case errors.Is(err, apikey.ErrBadInput):
		writeError(w, http.StatusBadRequest, err.Error())
		return
	case err != nil:
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	view := toAPIKeyView(key, time.Now())
	view.Value = value
	s.log.Info("api key created", "id", key.ID, "name", key.Name, "by", key.CreatedBy)
	writeJSON(w, http.StatusCreated, view)
}

func (s *Server) handleDeleteAPIKey(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !s.authorize(w, r, "delete", apiKeyResource, id) {
		return
	}
	err := s.keys.Delete(r.Context(), id)
	switch {
	case errors.Is(err, apikey.ErrNotFound):
		writeError(w, http.StatusNotFound, err.Error())
		return
	case err != nil:
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.log.Info("api key deleted", "id", id, "by", identityFrom(r.Context()).Name)
	w.WriteHeader(http.StatusNoContent)
}
