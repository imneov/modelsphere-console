package server

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/modelsphere/console/internal/modeltemplate"
	"gopkg.in/yaml.v3"
)

const templateOperationTimeout = 45 * time.Second
const maxTemplateUpstreamBytes = 2 << 20

func (s *Server) templateRequest(ctx context.Context, r *http.Request, method, path string, body any) (map[string]json.RawMessage, error) {
	name := s.cfg.ModelTemplates.WithDefaults().Backend
	resolve := s.backendTargets()[name]
	if resolve == nil {
		return nil, templateFailure("backend_unavailable", "backend_resolve", errors.New("configured backend has no resolver"))
	}
	target, err := resolve(ctx)
	if err != nil {
		return nil, templateFailure("backend_unavailable", "backend_resolve", err)
	}
	var raw []byte
	if body != nil {
		raw, err = json.Marshal(body)
		if err != nil {
			return nil, templateFailure("profile_too_large", "request_encode", err)
		}
		if len(raw) > maxTemplateUpstreamBytes {
			return nil, templateFailure("profile_too_large", "request_encode", errors.New("upstream request exceeds size limit"))
		}
	}
	u := target.url
	suffix, query, _ := strings.Cut(path, "?")
	u.Path = strings.TrimSuffix(u.Path, "/") + "/" + suffix
	u.RawPath = ""
	u.RawQuery = query
	u.Fragment = ""
	request, err := http.NewRequestWithContext(ctx, method, u.String(), bytes.NewReader(raw))
	if err != nil {
		return nil, templateFailure("backend_unavailable", "request_build", err)
	}
	request.Header.Set("Content-Type", "application/json")
	if id := identityFrom(r.Context()); id != nil {
		request.Header.Set("X-Remote-User", id.Name)
		for _, group := range id.Groups {
			request.Header.Add("X-Remote-Group", group)
		}
	}
	if token := bearerToken(r); token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}
	if target.key != "" {
		request.Header.Set(target.header, target.key)
	}
	client := &http.Client{Timeout: 10 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	response, err := client.Do(request)
	if err != nil {
		return nil, templateFailure("backend_unavailable", "backend_request", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, templateFailure("backend_rejected", "backend_response", &templateHTTPStatusError{status: response.StatusCode})
	}
	raw, err = io.ReadAll(io.LimitReader(response.Body, maxTemplateUpstreamBytes+1))
	if err != nil {
		return nil, templateFailure("backend_response_invalid", "response_read", err)
	}
	if len(raw) > maxTemplateUpstreamBytes {
		return nil, templateFailure("backend_response_invalid", "response_read", errors.New("upstream response exceeds size limit"))
	}
	var result map[string]json.RawMessage
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, templateFailure("backend_response_invalid", "response_decode", err)
	}
	if result == nil {
		return nil, templateFailure("backend_response_invalid", "response_decode", errors.New("upstream response is not a JSON object"))
	}
	return result, nil
}

func (s *Server) templateProfile(ctx context.Context, r *http.Request) (string, *yaml.Node, error) {
	result, err := s.templateRequest(ctx, r, http.MethodGet, "profile", nil)
	if err != nil {
		return "", nil, err
	}
	var text string
	if err := json.Unmarshal(result["yaml"], &text); err != nil {
		return "", nil, templateFailure("profile_unavailable", "profile_decode", err)
	}
	if text == "" {
		return "", nil, templateFailure("profile_unavailable", "profile_decode", errors.New("profile YAML is empty"))
	}
	var node yaml.Node
	dec := yaml.NewDecoder(strings.NewReader(text))
	if err := dec.Decode(&node); err != nil {
		return "", nil, templateFailure("profile_invalid", "profile_decode", err)
	}
	if err := dec.Decode(new(yaml.Node)); err != io.EOF {
		if err == nil {
			err = errors.New("profile contains multiple YAML documents")
		}
		return "", nil, templateFailure("profile_invalid", "profile_decode", err)
	}
	if len(node.Content) != 1 || node.Content[0].Kind != yaml.MappingNode {
		return "", nil, templateFailure("profile_invalid", "profile_decode", errors.New("profile is not a mapping"))
	}
	var check map[string]any
	if err := node.Decode(&check); err != nil {
		return "", nil, templateFailure("profile_invalid", "profile_decode", err)
	}
	return text, &node, nil
}

func yamlField(mapping *yaml.Node, key string) *yaml.Node {
	for i := 0; i+1 < len(mapping.Content); i += 2 {
		if mapping.Content[i].Value == key {
			return mapping.Content[i+1]
		}
	}
	return nil
}
func setYAMLField(mapping *yaml.Node, key string, value *yaml.Node) {
	for i := 0; i+1 < len(mapping.Content); i += 2 {
		if mapping.Content[i].Value == key {
			mapping.Content[i+1] = value
			return
		}
	}
	mapping.Content = append(mapping.Content, &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: key}, value)
}
func removeYAMLField(mapping *yaml.Node, key string) {
	for i := 0; i+1 < len(mapping.Content); i += 2 {
		if mapping.Content[i].Value == key {
			mapping.Content = append(mapping.Content[:i], mapping.Content[i+2:]...)
			return
		}
	}
}
func catalogNode(name, location string, default_ bool) *yaml.Node {
	node := &yaml.Node{}
	_ = node.Encode(map[string]any{"name": name, "url": location, "default": default_})
	return node
}

func (s *Server) templateGeneration(location string) (int64, bool) {
	prefix := s.cfg.ModelTemplates.WithDefaults().PublishURL + "/g/"
	rest, ok := strings.CutPrefix(location, prefix)
	if !ok {
		return 0, false
	}
	digits, ok := strings.CutSuffix(rest, "/index.json")
	if !ok {
		return 0, false
	}
	n, err := strconv.ParseInt(digits, 10, 64)
	return n, err == nil && n >= 0 && strconv.FormatInt(n, 10) == digits
}
func (s *Server) templateCatalogURL(generation int64) string {
	if s.cfg.ModelTemplates.PublishURL == "" {
		return ""
	}
	return fmt.Sprintf("%s/g/%d/index.json", s.cfg.ModelTemplates.WithDefaults().PublishURL, generation)
}

func (s *Server) templateProfileEntry(profile *yaml.Node) (*yaml.Node, error) {
	root := profile.Content[0]
	entries := yamlField(root, "catalogs")
	if entries == nil || entries.Tag == "!!null" {
		return nil, nil
	}
	if entries.Kind != yaml.SequenceNode {
		return nil, templateFailure("profile_invalid", "profile_catalogs", errors.New("invalid catalog YAML structure"))
	}
	var own *yaml.Node
	for _, entry := range entries.Content {
		if entry.Kind != yaml.MappingNode {
			return nil, templateFailure("profile_invalid", "profile_catalogs", errors.New("invalid catalog YAML structure"))
		}
		name := yamlField(entry, "name")
		if name == nil || name.Value != s.cfg.ModelTemplates.WithDefaults().CatalogName {
			continue
		}
		location := yamlField(entry, "url")
		if own != nil || location == nil {
			return nil, templateFailure("catalog_name_conflict", "catalog_ownership", errors.New("catalog name belongs to another source or is duplicated"))
		}
		if _, ok := s.templateGeneration(location.Value); !ok {
			return nil, templateFailure("catalog_name_conflict", "catalog_ownership", errors.New("catalog name belongs to another source or is duplicated"))
		}
		own = entry
	}
	return own, nil
}

func (s *Server) templateRegistration(ctx context.Context, r *http.Request, state *modeltemplate.State) (*int64, error) {
	_, profile, err := s.templateProfile(ctx, r)
	if err != nil {
		return nil, err
	}
	own, err := s.templateProfileEntry(profile)
	if err != nil {
		return nil, err
	}
	if own == nil {
		return nil, templateFailure("catalog_not_registered", "catalog_lookup", errors.New("profile has no local catalog entry"))
	}
	location := yamlField(own, "url").Value
	generation, _ := s.templateGeneration(location)
	idx, err := state.Index(generation)
	if err != nil {
		return nil, templateFailure("registration_changed", "snapshot_lookup", err)
	}
	result, err := s.templateRequest(ctx, r, http.MethodGet, "catalog?catalog="+s.cfg.ModelTemplates.WithDefaults().CatalogName, nil)
	if err != nil {
		return nil, err
	}
	var source, name string
	if err := json.Unmarshal(result["source"], &source); err != nil {
		return nil, templateFailure("registration_unverified", "catalog_identity", err)
	}
	if err := json.Unmarshal(result["name"], &name); err != nil {
		return nil, templateFailure("registration_unverified", "catalog_identity", err)
	}
	if source != location || name != s.cfg.ModelTemplates.WithDefaults().CatalogName || !templateCatalogMatches(result, idx) {
		return nil, templateFailure("registration_unverified", "catalog_verify", errors.New("catalog identity or snapshot contents did not match"))
	}
	return &generation, nil
}

func (s *Server) templateUpdatedProfile(ctx context.Context, r *http.Request, profile *yaml.Node, generation int64) (string, error) {
	root := profile.Content[0]
	own, err := s.templateProfileEntry(profile)
	if err != nil {
		return "", err
	}
	if own != nil {
		current, _ := s.templateGeneration(yamlField(own, "url").Value)
		if current > generation {
			return "", templateFailure("registration_changed", "generation_check", errors.New("profile generation is ahead of local state"))
		}
	}
	entries := yamlField(root, "catalogs")
	if entries == nil || entries.Tag == "!!null" || len(entries.Content) == 0 {
		entries = &yaml.Node{Kind: yaml.SequenceNode, Tag: "!!seq"}
		legacy := yamlField(root, "catalog")
		if legacy != nil && strings.TrimSpace(legacy.Value) != "" && legacy.Tag != "!!null" {
			entries.Content = append(entries.Content, catalogNode("default", legacy.Value, true))
		} else {
			result, err := s.templateRequest(ctx, r, http.MethodGet, "cluster", nil)
			if err != nil {
				return "", err
			}
			var cluster struct {
				Catalog  string `json:"catalog"`
				Catalogs []struct {
					Name    string `json:"name"`
					URL     string `json:"url"`
					Default bool   `json:"default"`
				} `json:"catalogs"`
			}
			raw, err := json.Marshal(result)
			if err != nil {
				return "", templateFailure("existing_catalog_unknown", "cluster_decode", err)
			}
			if err := json.Unmarshal(raw, &cluster); err != nil {
				return "", templateFailure("existing_catalog_unknown", "cluster_decode", err)
			}
			for _, c := range cluster.Catalogs {
				if c.Name == "" || c.URL == "" || c.Name == s.cfg.ModelTemplates.WithDefaults().CatalogName {
					return "", templateFailure("existing_catalog_unknown", "cluster_catalogs", errors.New("cluster catalog information is incomplete or conflicts"))
				}
				entries.Content = append(entries.Content, catalogNode(c.Name, c.URL, c.Default || len(cluster.Catalogs) == 1))
			}
			if len(entries.Content) == 0 {
				if cluster.Catalog == "" {
					return "", templateFailure("existing_catalog_unknown", "cluster_catalogs", errors.New("cluster catalog information is incomplete or conflicts"))
				}
				entries.Content = append(entries.Content, catalogNode("default", cluster.Catalog, true))
			}
		}
		setYAMLField(root, "catalogs", entries)
		removeYAMLField(root, "catalog")
	}
	replacement := catalogNode(s.cfg.ModelTemplates.WithDefaults().CatalogName, s.templateCatalogURL(generation), false)
	if own == nil {
		for _, entry := range entries.Content {
			if name := yamlField(entry, "name"); name != nil && name.Value == s.cfg.ModelTemplates.WithDefaults().CatalogName {
				return "", templateFailure("catalog_name_conflict", "catalog_ownership", errors.New("catalog name belongs to another source or is duplicated"))
			}
		}
	}
	if own == nil {
		if len(entries.Content) == 1 {
			value := &yaml.Node{}
			_ = value.Encode(true)
			setYAMLField(entries.Content[0], "default", value)
		}
		entries.Content = append(entries.Content, replacement)
	} else {
		yamlField(own, "url").Value = s.templateCatalogURL(generation)
	}
	var out bytes.Buffer
	enc := yaml.NewEncoder(&out)
	enc.SetIndent(2)
	if err := enc.Encode(profile); err != nil {
		return "", templateFailure("profile_invalid", "profile_encode", err)
	}
	_ = enc.Close()
	return out.String(), nil
}

func (s *Server) publishTemplates(ctx context.Context, r *http.Request) (*int64, error) {
	select {
	case s.templatePublishGate <- struct{}{}:
		defer func() { <-s.templatePublishGate }()
	case <-ctx.Done():
		return nil, templateFailure("registration_timeout", "publication_gate", ctx.Err())
	}
	store := s.templateStore()
	for attempt := 0; attempt < 3; attempt++ {
		state, err := store.Read(ctx)
		if err != nil {
			return nil, templateFailure("storage_unavailable", "state_read", err)
		}
		before, profile, err := s.templateProfile(ctx, r)
		if err != nil {
			return nil, err
		}
		own, err := s.templateProfileEntry(profile)
		if err != nil {
			return nil, err
		}
		if own != nil {
			generation, _ := s.templateGeneration(yamlField(own, "url").Value)
			if generation == state.Generation {
				verified, err := s.templateRegistration(ctx, r, state)
				if err == nil {
					return verified, nil
				}
			}
		}
		desired, err := s.templateUpdatedProfile(ctx, r, profile, state.Generation)
		if err != nil {
			return nil, err
		}
		latest, err := store.Read(ctx)
		if err != nil {
			return nil, templateFailure("storage_unavailable", "state_read", err)
		}
		if latest.Generation != state.Generation {
			continue
		}
		current, _, err := s.templateProfile(ctx, r)
		if err != nil {
			return nil, err
		}
		if current != before {
			continue
		}
		if _, err := s.templateRequest(ctx, r, http.MethodPut, "profile", map[string]string{"yaml": desired}); err != nil {
			return nil, err
		}
		latest, err = store.Read(ctx)
		if err != nil {
			return nil, templateFailure("storage_unavailable", "state_read", err)
		}
		if latest.Generation != state.Generation {
			continue
		}
		return s.templateRegistration(ctx, r, latest)
	}
	return nil, templateFailure("registration_changed", "publication_reconcile", errors.New("profile or state changed during each publication attempt"))
}
