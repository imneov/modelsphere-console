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
	User           string     `json:"user,omitempty"`
	PrincipalKind  string     `json:"principalKind,omitempty"`
	PrincipalUID   string     `json:"principalUID,omitempty"`
	WalletID       string     `json:"walletID,omitempty"`
	Creator        string     `json:"creator,omitempty"`
	KeyMasked      string     `json:"keyMasked"`
	Status         string     `json:"status"`
	Disabled       bool       `json:"disabled"`
	DisabledReason string     `json:"disabledReason,omitempty"`
	From           string     `json:"from,omitempty"`
	BillingState   string     `json:"billingState,omitempty"`
	Key            string     `json:"key,omitempty"`
	ID             string     `json:"id"`
	Name           string     `json:"name"`
	Description    string     `json:"description,omitempty"`
	MaskedValue    string     `json:"maskedValue"`
	Models         []string   `json:"models,omitempty"`
	CreatedBy      string     `json:"createdBy"`
	CreatedAt      time.Time  `json:"createdAt"`
	ExpiresAt      *time.Time `json:"expiresAt,omitempty"`
	Expired        bool       `json:"expired"`
	// Value is the plaintext key, set only in the response that created it.
	Value string `json:"value,omitempty"`
}

func toView(k Key, now time.Time) keyView {
	status, reason := k.EffectiveStatus, k.DisabledReason
	if status == "" {
		status = "enabled"
	}
	if k.Disabled {
		status, reason = "disabled", "admin"
	} else if k.Expired(now) {
		status, reason = "system-disabled", "expired"
	} else if k.BillingState == "blocked" {
		status, reason = "system-disabled", "insufficient-balance"
	}
	return keyView{
		User: k.User, PrincipalKind: k.PrincipalKind, PrincipalUID: k.PrincipalUID, WalletID: k.WalletID,
		Creator: k.Creator, KeyMasked: k.Masked(), Status: status, From: k.From, BillingState: k.BillingState,
		Disabled: k.Disabled, DisabledReason: reason,
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
	source := "secret"
	if _, ok := rt.keys.(*CRDStore); ok {
		source = "crd"
	}
	migration, err := rt.migrationInfo(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "read migration state failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": out, "keySource": source, "migrationAvailable": rt.importer != nil, "migration": migration})
}

func (rt *Router) CreateKey(w http.ResponseWriter, r *http.Request, createdBy string) {
	var in struct {
		User          string     `json:"user"`
		PrincipalUID  string     `json:"principalUID"`
		ExpiresAt     *time.Time `json:"expiresAt"`
		Name          string     `json:"name"`
		Description   string     `json:"description"`
		ExpiresInDays int        `json:"expiresInDays"`
		Models        []string   `json:"models"`
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
		User: in.User, PrincipalUID: in.PrincipalUID, ExpiresAt: in.ExpiresAt,
		Name: in.Name, Description: in.Description, Models: in.Models,
		ExpiresIn: time.Duration(in.ExpiresInDays) * 24 * time.Hour,
		CreatedBy: createdBy,
	})
	switch {
	case errors.Is(err, ErrExists):
		writeError(w, http.StatusConflict, err.Error())
		return
	case errors.Is(err, ErrMigrationFrozen):
		writeError(w, http.StatusConflict, err.Error())
		return
	case errors.Is(err, ErrBadInput):
		writeError(w, http.StatusBadRequest, err.Error())
		return
	case errors.Is(err, ErrDisabled):
		writeError(w, http.StatusBadRequest, "key owner is inactive")
		return
	case err != nil:
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	view := toView(key, time.Now())
	view.Value = value
	view.Key = value
	rt.log.Info("api key created", "id", key.ID, "name", key.Name, "by", createdBy)
	writeJSON(w, http.StatusCreated, view)
}

func (rt *Router) DeleteKey(w http.ResponseWriter, r *http.Request, id, deletedBy string) {
	err := rt.keys.Delete(r.Context(), id)
	switch {
	case errors.Is(err, ErrMigrationFrozen):
		writeError(w, http.StatusConflict, err.Error())
		return
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
