package server

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/modelsphere/console/internal/modeltemplate"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
)

func (s *Server) templateStore() *modeltemplate.Store {
	m := s.cfg.ModelTemplates.WithDefaults()
	return modeltemplate.NewStore(s.kube.Dynamic(), m.Namespace, m.ConfigMap)
}
func (s *Server) mountModelTemplates(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/model-templates", s.handleModelTemplates)
	mux.HandleFunc("POST /api/model-templates/check", s.handleModelTemplateCheck)
	mux.HandleFunc("POST /api/model-templates", s.handleCreateModelTemplate)
	mux.HandleFunc("POST /api/model-templates/publish", s.handlePublishModelTemplates)
}
func (s *Server) TemplateCatalogHandler() http.Handler {
	mux := http.NewServeMux()
	s.mountTemplateCatalog(mux)
	mux.HandleFunc("/", http.NotFound)
	return s.recover(s.logRequests(mux))
}

func (s *Server) mountTemplateCatalog(mux *http.ServeMux) {
	mux.HandleFunc("GET /catalog/console/g/{generation}/index.json", s.handleTemplateCatalog)
	mux.HandleFunc("GET /catalog/console/g/{generation}/models/{model}/{file}", s.handleTemplateCatalog)
	mux.HandleFunc("/catalog/console/", func(w http.ResponseWriter, r *http.Request) { http.NotFound(w, r) })
}

func (s *Server) authorizeTemplates(w http.ResponseWriter, r *http.Request, verb string) bool {
	w.Header().Set("Cache-Control", "no-store")
	m := s.cfg.ModelTemplates.WithDefaults()
	if !s.authorize(w, r, verb, "modeltemplates", m.CatalogName) || !s.authorize(w, r, "get", backendResource, m.Backend) {
		return false
	}
	if verb != "get" && !s.authorize(w, r, "update", backendResource, m.Backend) {
		return false
	}
	return true
}
func (s *Server) enabledTemplates(w http.ResponseWriter) bool {
	if !s.cfg.ModelTemplates.Enabled {
		writeError(w, http.StatusNotFound, "model templates are disabled")
		return false
	}
	return s.haveKube(w)
}
func templateInput(w http.ResponseWriter, r *http.Request) (modeltemplate.Input, *modeltemplate.Recipe, bool) {
	var in modeltemplate.Input
	_ = http.NewResponseController(w).SetReadDeadline(time.Now().Add(10 * time.Second))
	defer http.NewResponseController(w).SetReadDeadline(time.Time{})
	r.Body = http.MaxBytesReader(w, r.Body, 192<<10)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if dec.Decode(&in) != nil || dec.Decode(new(any)) != io.EOF {
		writeError(w, http.StatusBadRequest, "invalid template request")
		return in, nil, false
	}
	recipe, err := modeltemplate.Validate(in)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return in, nil, false
	}
	return in, recipe, true
}
func (s *Server) handleModelTemplates(w http.ResponseWriter, r *http.Request) {
	if !s.authorizeTemplates(w, r, "get") {
		return
	}
	m := s.cfg.ModelTemplates.WithDefaults()
	ctx, cancel := context.WithTimeout(r.Context(), templateOperationTimeout)
	defer cancel()
	state := modeltemplate.Empty()
	if m.Enabled {
		if !s.haveKube(w) {
			return
		}
		var err error
		state, err = s.templateStore().Read(ctx)
		if err != nil {
			writeTemplateStorageError(w, err)
			return
		}
	}
	index, err := state.Index(state.Generation)
	if err != nil {
		writeTemplateStorageError(w, err)
		return
	}
	var registered *int64
	reason := ""
	if m.Enabled {
		registered, reason = s.templateRegistration(ctx, r, state)
	}
	generations := map[string]int64{}
	for _, record := range state.Records {
		generations[record.Metadata.Name] = record.CreationGen
	}
	result := map[string]any{"enabled": m.Enabled, "catalogName": m.CatalogName, "catalogURL": s.templateCatalogURL(state.Generation), "generation": state.Generation, "index": index, "registeredGeneration": registered, "modelGenerations": generations}
	if reason != "" {
		result["registrationError"] = reason
	}
	writeJSON(w, http.StatusOK, result)
}
func (s *Server) handleModelTemplateCheck(w http.ResponseWriter, r *http.Request) {
	if !s.authorizeTemplates(w, r, "create") || !s.enabledTemplates(w) {
		return
	}
	_, recipe, ok := templateInput(w, r)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"valid": true, "model": recipe.Name, "version": recipe.Version, "variantCount": len(recipe.Variants)})
}
func (s *Server) handleCreateModelTemplate(w http.ResponseWriter, r *http.Request) {
	if !s.authorizeTemplates(w, r, "create") || !s.enabledTemplates(w) {
		return
	}
	in, recipe, ok := templateInput(w, r)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), templateOperationTimeout)
	defer cancel()
	state, err := s.templateStore().Create(ctx, in, identityFrom(r.Context()).Name)
	if err != nil {
		writeTemplateStorageError(w, err)
		return
	}
	registered, reason := s.publishTemplates(ctx, r)
	ready := registered != nil && *registered >= state.Generation && reason == ""
	status := http.StatusAccepted
	if ready {
		status = http.StatusCreated
	}
	result := s.templatePublishResult(state.Generation, registered, reason)
	result["created"] = true
	result["model"] = recipe.Name
	result["version"] = recipe.Version
	writeJSON(w, status, result)
}
func (s *Server) templatePublishResult(generation int64, registered *int64, reason string) map[string]any {
	result := map[string]any{"catalogName": s.cfg.ModelTemplates.WithDefaults().CatalogName, "generation": generation, "catalogURL": s.templateCatalogURL(generation), "ready": registered != nil && *registered >= generation && reason == "", "registeredGeneration": registered}
	if reason != "" {
		result["reason"] = reason
	}
	return result
}
func (s *Server) handlePublishModelTemplates(w http.ResponseWriter, r *http.Request) {
	if !s.authorizeTemplates(w, r, "update") || !s.enabledTemplates(w) {
		return
	}
	_ = http.NewResponseController(w).SetReadDeadline(time.Now().Add(10 * time.Second))
	defer http.NewResponseController(w).SetReadDeadline(time.Time{})
	r.Body = http.MaxBytesReader(w, r.Body, 1024)
	raw, err := io.ReadAll(r.Body)
	var payload map[string]json.RawMessage
	if err != nil || len(bytes.TrimSpace(raw)) > 0 && (json.Unmarshal(raw, &payload) != nil || len(payload) != 0) {
		writeError(w, http.StatusBadRequest, "publish accepts no template payload")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), templateOperationTimeout)
	defer cancel()
	registered, reason := s.publishTemplates(ctx, r)
	state, err := s.templateStore().Read(ctx)
	if err != nil {
		writeTemplateStorageError(w, err)
		return
	}
	status := http.StatusOK
	if registered == nil || *registered < state.Generation || reason != "" {
		status = http.StatusAccepted
	}
	writeJSON(w, status, s.templatePublishResult(state.Generation, registered, reason))
}
func (s *Server) handleTemplateCatalog(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if !s.cfg.ModelTemplates.Enabled {
		http.NotFound(w, r)
		return
	}
	digits := r.PathValue("generation")
	generation, err := strconv.ParseInt(digits, 10, 64)
	if err != nil || generation < 0 || generation > 1000 || strconv.FormatInt(generation, 10) != digits {
		http.NotFound(w, r)
		return
	}
	if s.kube == nil {
		writeError(w, http.StatusServiceUnavailable, "template storage is unavailable")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	state, err := s.templateStore().Read(ctx)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "template storage is unavailable")
		return
	}
	var body []byte
	if r.PathValue("model") == "" {
		index, err := state.Index(generation)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		body, err = json.Marshal(index)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "cannot encode catalog")
			return
		}
		w.Header().Set("Content-Type", "application/json")
	} else {
		var ok bool
		body, ok = state.Recipe(generation, r.PathValue("model"), r.PathValue("file"))
		if !ok {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/yaml")
	}
	if len(body) > 2<<20 {
		writeError(w, http.StatusServiceUnavailable, "catalog exceeds response limit")
		return
	}
	w.Header().Set("Content-Length", strconv.Itoa(len(body)))
	if r.Method != http.MethodHead {
		_, _ = w.Write(body)
	}
}
func writeTemplateStorageError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, modeltemplate.ErrDuplicate), apierrors.IsConflict(err):
		writeError(w, http.StatusConflict, "template name or storage revision conflicts; refresh and retry")
	case errors.Is(err, modeltemplate.ErrTooLarge):
		writeError(w, http.StatusRequestEntityTooLarge, err.Error())
	default:
		writeError(w, http.StatusBadGateway, "model template storage is unavailable or invalid")
	}
}
