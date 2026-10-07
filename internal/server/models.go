package server

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/modelsphere/console/internal/config"
	"github.com/modelsphere/console/internal/router"
)

// modelIndex answers which models a backend serves and which of its routes serves
// each, by asking every route for /v1/models. A gateway fed by autoconfig has one
// plain route per model and no route that lists them all, so the list and the
// choice of route have to be made here.
type modelIndex struct {
	client *http.Client
	log    *slog.Logger
	now    func() time.Time

	mu       sync.Mutex
	backends map[string]*catalog
}

type catalog struct {
	sig    string
	at     time.Time
	models []string
	route  map[string]string
	// routes is every route in the order asked, with what it answered: the
	// Playground lists deployments by route, and two routes may serve one name.
	routes     []routeModels
	refreshing bool
	// partial: a route did not answer. openresty loads a new route up to a
	// minute after autoconfig writes it, so such a list is re-asked sooner.
	partial bool
}

const (
	catalogTTL = 30 * time.Second
	// catalogMissRefresh rate-limits the re-ask an unknown model triggers, so a
	// model deployed a moment ago works at once without every typo costing a
	// round of probes.
	catalogMissRefresh = 2 * time.Second
	probeTimeout       = 5 * time.Second
)

func newModelIndex(log *slog.Logger) *modelIndex {
	return &modelIndex{
		client:   &http.Client{Timeout: probeTimeout},
		log:      log,
		now:      time.Now,
		backends: map[string]*catalog{},
	}
}

// get returns the backend's catalog. A stale one is served while a refresh runs
// behind it; one that does not know want is re-asked first.
func (ix *modelIndex) get(ctx context.Context, name string, t *backendTarget, want string) (*catalog, error) {
	sig := t.url.String() + "|" + strings.Join(t.routes, ",") + "|" + t.key
	ix.mu.Lock()
	c := ix.backends[name]
	ix.mu.Unlock()

	now := ix.now()
	switch {
	case c == nil || c.sig != sig:
		return ix.refresh(ctx, name, t, sig)
	case want != "" && !c.serves(want) && now.Sub(c.at) >= catalogMissRefresh:
		if fresh, err := ix.refresh(ctx, name, t, sig); err == nil {
			return fresh, nil
		}
	case now.Sub(c.at) >= c.ttl():
		ix.mu.Lock()
		if !c.refreshing {
			c.refreshing = true
			go func() {
				bg, cancel := context.WithTimeout(context.WithoutCancel(ctx), probeTimeout+time.Second)
				defer cancel()
				if _, err := ix.refresh(bg, name, t, sig); err != nil {
					ix.log.Warn("model list not refreshed, keeping the last one", "backend", name, "err", err)
					ix.mu.Lock()
					c.refreshing = false
					ix.mu.Unlock()
				}
			}()
		}
		ix.mu.Unlock()
	}
	return c, nil
}

func (ix *modelIndex) refresh(ctx context.Context, name string, t *backendTarget, sig string) (*catalog, error) {
	c, err := ix.probe(ctx, name, t)
	if err != nil {
		return nil, err
	}
	c.sig, c.at = sig, ix.now()
	ix.mu.Lock()
	ix.backends[name] = c
	ix.mu.Unlock()
	return c, nil
}

// probe asks every route at once. The first route listing a model serves it, and
// routes come aggregate-first, so a hand-written aggregate route wins over the
// per-model routes beside it. A route that does not answer is left out rather
// than failing the rest; only no answer at all is an error.
func (ix *modelIndex) probe(ctx context.Context, name string, t *backendTarget) (*catalog, error) {
	routes := t.routes
	if len(routes) == 0 {
		routes = []string{""}
	}
	lists := make([][]string, len(routes))
	errs := make([]error, len(routes))
	var wg sync.WaitGroup
	for i, route := range routes {
		wg.Add(1)
		go func() {
			defer wg.Done()
			lists[i], errs[i] = ix.list(ctx, routeURL(t, route)+"/v1/models", t)
		}()
	}
	wg.Wait()

	c := &catalog{route: map[string]string{}}
	answered := 0
	for i, route := range routes {
		rm := routeModels{Route: route, Models: lists[i]}
		if errs[i] != nil {
			rm.Error = errs[i].Error()
		}
		c.routes = append(c.routes, rm)
		if errs[i] != nil {
			ix.log.Warn("route did not list its models", "backend", name, "route", route, "err", errs[i])
			continue
		}
		answered++
		for _, m := range lists[i] {
			if _, seen := c.route[m]; !seen {
				c.route[m] = route
				c.models = append(c.models, m)
			}
		}
	}
	if answered == 0 {
		return nil, fmt.Errorf("no route listed its models: %w", errors.Join(errs...))
	}
	c.partial = answered < len(routes)
	slices.Sort(c.models)
	return c, nil
}

func (ix *modelIndex) list(ctx context.Context, u string, t *backendTarget) ([]string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	if t.key != "" {
		req.Header.Set(t.header, t.key)
	}
	resp, err := ix.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GET %s: %s", u, resp.Status)
	}
	var body struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 4<<20)).Decode(&body); err != nil {
		return nil, fmt.Errorf("GET %s: not a model list: %w", u, err)
	}
	ids := make([]string, 0, len(body.Data))
	for _, d := range body.Data {
		if d.ID != "" {
			ids = append(ids, d.ID)
		}
	}
	return ids, nil
}

func (c *catalog) ttl() time.Duration {
	if c.partial {
		return catalogMissRefresh
	}
	return catalogTTL
}

func (c *catalog) serves(model string) bool {
	_, ok := c.route[model]
	return ok
}

// routeFor picks the route serving model. A request naming no model can only go
// where there is a single route to go to.
func (c *catalog) routeFor(model string, t *backendTarget) (string, error) {
	if model == "" {
		if len(t.routes) <= 1 {
			return first(t.routes), nil
		}
		return "", router.ErrNoModel
	}
	route, ok := c.route[model]
	if !ok {
		return "", router.ErrUnknownModel
	}
	return route, nil
}

func routeURL(t *backendTarget, route string) string {
	u := strings.TrimSuffix(t.url.String(), "/")
	if route == "" {
		return u
	}
	return u + "/" + route
}

func first(s []string) string {
	if len(s) == 0 {
		return ""
	}
	return s[0]
}

// routeModels is one route as the Playground sees it: the models it lists, or
// why it listed none -- a route whose engines are not ready yet does not answer.
type routeModels struct {
	Route  string   `json:"route"`
	Models []string `json:"models"`
	Error  string   `json:"error,omitempty"`
}

// routeHeader names the route a request is for. The Playground lists deployments,
// and two of them may serve the same model name; the name alone would always pick
// the first.
const routeHeader = "X-ModelSphere-Route"

// modelList is the OpenAI shape of a model list.
func modelList(ids []string) map[string]any {
	data := make([]map[string]string, 0, len(ids))
	for _, id := range ids {
		data = append(data, map[string]string{"id": id, "object": "model", "owned_by": "modelsphere"})
	}
	return map[string]any{"object": "list", "data": data}
}

// routeByModel is a gateway backend's request as the Playground makes it: the
// model list is answered here, and anything else goes to the route serving the
// model its body names. It returns the target to proxy to, or nil once it has
// answered itself.
func (s *Server) routeByModel(w http.ResponseWriter, r *http.Request, b config.Backend, t *backendTarget) *backendTarget {
	rest := strings.TrimPrefix(r.URL.Path, strings.TrimSuffix(b.Prefix, "/"))
	if r.Method == http.MethodGet || r.Method == http.MethodHead {
		if strings.TrimSuffix(rest, "/") == "/routes" {
			c, err := s.models.get(r.Context(), b.Name, t, "")
			if err != nil {
				writeError(w, http.StatusBadGateway, fmt.Sprintf("backend %s: %v", b.Name, err))
				return nil
			}
			writeJSON(w, http.StatusOK, map[string]any{"routes": c.routes})
			return nil
		}
		if strings.TrimSuffix(rest, "/") == "/v1/models" {
			c, err := s.models.get(r.Context(), b.Name, t, "")
			if err != nil {
				writeError(w, http.StatusBadGateway, fmt.Sprintf("backend %s: %v", b.Name, err))
				return nil
			}
			writeJSON(w, http.StatusOK, modelList(c.models))
			return nil
		}
	}

	if want := r.Header.Get(routeHeader); want != "" {
		r.Header.Del(routeHeader)
		if !slices.Contains(t.routes, want) {
			writeError(w, http.StatusBadRequest, fmt.Sprintf("backend %s has no route %q", b.Name, want))
			return nil
		}
		routed := *t
		routed.url.Path = strings.TrimSuffix(t.url.Path, "/") + "/" + want
		return &routed
	}

	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, config.DefaultMaxBodyBytes))
	if err != nil {
		writeError(w, http.StatusRequestEntityTooLarge, "request body too large or unreadable")
		return nil
	}
	r.Body = io.NopCloser(bytes.NewReader(body))
	r.ContentLength = int64(len(body))
	var req struct {
		Model string `json:"model"`
	}
	_ = json.Unmarshal(body, &req)

	c, err := s.models.get(r.Context(), b.Name, t, req.Model)
	if err != nil {
		writeError(w, http.StatusBadGateway, fmt.Sprintf("backend %s: %v", b.Name, err))
		return nil
	}
	route, err := c.routeFor(req.Model, t)
	switch {
	case errors.Is(err, router.ErrUnknownModel):
		writeError(w, http.StatusBadRequest, fmt.Sprintf("model %q is not served by backend %s (it serves: %s)", req.Model, b.Name, strings.Join(c.models, ", ")))
		return nil
	case errors.Is(err, router.ErrNoModel):
		writeError(w, http.StatusBadRequest, fmt.Sprintf("backend %s serves several routes; the request has to name a model", b.Name))
		return nil
	}
	routed := *t
	if route != "" {
		routed.url.Path = strings.TrimSuffix(t.url.Path, "/") + "/" + route
	}
	return &routed
}
