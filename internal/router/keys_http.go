package router

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"
)

// Key management over HTTP. The caller has already been authorized.

// expiryDays are the lifetimes offered, 0 being never.
var expiryDays = map[int]bool{0: true, 7: true, 30: true, 180: true}

type keyView struct {
	ID          string     `json:"id"`
	Name        string     `json:"name"`
	Description string     `json:"description,omitempty"`
	MaskedValue string     `json:"maskedValue"`
	Models      []string   `json:"models,omitempty"`
	CreatedBy   string     `json:"createdBy"`
	CreatedAt   time.Time  `json:"createdAt"`
	ExpiresAt   *time.Time `json:"expiresAt,omitempty"`
	Expired     bool       `json:"expired"`
	// Value is the plaintext key, set only in the response that created it.
	Value string `json:"value,omitempty"`
}

func toView(k Key, now time.Time) keyView {
	return keyView{
		ID: k.ID, Name: k.Name, Description: k.Description, MaskedValue: k.Masked(),
		Models: k.Models, CreatedBy: k.CreatedBy, CreatedAt: k.CreatedAt,
		ExpiresAt: k.ExpiresAt, Expired: k.Expired(now),
	}
}

func (rt *Router) ListKeys(w http.ResponseWriter, r *http.Request) {
	keys, err := rt.keys.List(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	now := time.Now()
	out := make([]keyView, 0, len(keys))
	for _, k := range keys {
		out = append(out, toView(k, now))
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": out})
}

func (rt *Router) CreateKey(w http.ResponseWriter, r *http.Request, createdBy string) {
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
	key, value, err := rt.keys.Create(r.Context(), Input{
		Name: in.Name, Description: in.Description, Models: in.Models,
		ExpiresIn: time.Duration(in.ExpiresInDays) * 24 * time.Hour,
		CreatedBy: createdBy,
	})
	switch {
	case errors.Is(err, ErrExists):
		writeError(w, http.StatusConflict, err.Error())
		return
	case errors.Is(err, ErrBadInput):
		writeError(w, http.StatusBadRequest, err.Error())
		return
	case err != nil:
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	view := toView(key, time.Now())
	view.Value = value
	rt.log.Info("api key created", "id", key.ID, "name", key.Name, "by", createdBy)
	writeJSON(w, http.StatusCreated, view)
}

func (rt *Router) DeleteKey(w http.ResponseWriter, r *http.Request, id, deletedBy string) {
	err := rt.keys.Delete(r.Context(), id)
	switch {
	case errors.Is(err, ErrNotFound):
		writeError(w, http.StatusNotFound, err.Error())
		return
	case err != nil:
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	rt.metrics.forget(id)
	rt.log.Info("api key deleted", "id", id, "by", deletedBy)
	w.WriteHeader(http.StatusNoContent)
}
