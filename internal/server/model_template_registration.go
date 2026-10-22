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
		return nil, errors.New("backend_unavailable")
	}
	target, err := resolve(ctx)
	if err != nil {
		return nil, errors.New("backend_unavailable")
	}
	var raw []byte
	if body != nil {
		raw, err = json.Marshal(body)
		if err != nil || len(raw) > maxTemplateUpstreamBytes {
			return nil, errors.New("profile_too_large")
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
		return nil, errors.New("backend_unavailable")
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
		return nil, errors.New("backend_unavailable")
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, errors.New("backend_rejected")
	}
	raw, err = io.ReadAll(io.LimitReader(response.Body, maxTemplateUpstreamBytes+1))
	if err != nil || len(raw) > maxTemplateUpstreamBytes {
		return nil, errors.New("backend_response_invalid")
	}
	var result map[string]json.RawMessage
	if json.Unmarshal(raw, &result) != nil {
		return nil, errors.New("backend_response_invalid")
	}
	return result, nil
}

func (s *Server) templateProfile(ctx context.Context, r *http.Request) (string, *yaml.Node, error) {
	result, err := s.templateRequest(ctx, r, http.MethodGet, "profile", nil)
	if err != nil {
		return "", nil, err
	}
	var text string
	if json.Unmarshal(result["yaml"], &text) != nil || text == "" {
		return "", nil, errors.New("profile_unavailable")
	}
	var node yaml.Node
	dec := yaml.NewDecoder(strings.NewReader(text))
	if dec.Decode(&node) != nil || dec.Decode(new(yaml.Node)) != io.EOF || len(node.Content) != 1 || node.Content[0].Kind != yaml.MappingNode {
		return "", nil, errors.New("profile_invalid")
	}
	var check map[string]any
	if node.Decode(&check) != nil {
		return "", nil, errors.New("profile_invalid")
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
		return nil, errors.New("profile_invalid")
	}
	var own *yaml.Node
	for _, entry := range entries.Content {
		if entry.Kind != yaml.MappingNode {
			return nil, errors.New("profile_invalid")
		}
		name := yamlField(entry, "name")
		if name == nil || name.Value != s.cfg.ModelTemplates.WithDefaults().CatalogName {
			continue
		}
		location := yamlField(entry, "url")
		if own != nil || location == nil {
			return nil, errors.New("catalog_name_conflict")
		}
		if _, ok := s.templateGeneration(location.Value); !ok {
			return nil, errors.New("catalog_name_conflict")
		}
		own = entry
	}
	return own, nil
}

func (s *Server) templateRegistration(ctx context.Context, r *http.Request, state *modeltemplate.State) (*int64, string) {
	_, profile, err := s.templateProfile(ctx, r)
	if err != nil {
		return nil, err.Error()
	}
	own, err := s.templateProfileEntry(profile)
	if err != nil {
		return nil, err.Error()
	}
	if own == nil {
		return nil, "catalog_not_registered"
	}
	location := yamlField(own, "url").Value
	generation, _ := s.templateGeneration(location)
	idx, err := state.Index(generation)
	if err != nil {
		return nil, "registration_changed"
	}
	result, err := s.templateRequest(ctx, r, http.MethodGet, "catalog?catalog="+s.cfg.ModelTemplates.WithDefaults().CatalogName, nil)
	if err != nil {
		return nil, err.Error()
	}
	var source, name string
	_ = json.Unmarshal(result["source"], &source)
	_ = json.Unmarshal(result["name"], &name)
	if source != location || name != s.cfg.ModelTemplates.WithDefaults().CatalogName || !templateCatalogMatches(result, idx) {
		return nil, "registration_unverified"
	}
	return &generation, ""
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
			return "", errors.New("registration_changed")
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
			raw, _ := json.Marshal(result)
			if json.Unmarshal(raw, &cluster) != nil {
				return "", errors.New("existing_catalog_unknown")
			}
			for _, c := range cluster.Catalogs {
				if c.Name == "" || c.URL == "" || c.Name == s.cfg.ModelTemplates.WithDefaults().CatalogName {
					return "", errors.New("existing_catalog_unknown")
				}
				entries.Content = append(entries.Content, catalogNode(c.Name, c.URL, c.Default || len(cluster.Catalogs) == 1))
			}
			if len(entries.Content) == 0 {
				if cluster.Catalog == "" {
					return "", errors.New("existing_catalog_unknown")
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
				return "", errors.New("catalog_name_conflict")
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
		for i, entry := range entries.Content {
			if entry == own {
				entries.Content[i] = replacement
			}
		}
	}
	var out bytes.Buffer
	enc := yaml.NewEncoder(&out)
	enc.SetIndent(2)
	if err := enc.Encode(profile); err != nil {
		return "", errors.New("profile_invalid")
	}
	_ = enc.Close()
	return out.String(), nil
}

func (s *Server) publishTemplates(ctx context.Context, r *http.Request) (*int64, string) {
	select {
	case s.templatePublishGate <- struct{}{}:
		defer func() { <-s.templatePublishGate }()
	case <-ctx.Done():
		return nil, "registration_timeout"
	}
	store := s.templateStore()
	for attempt := 0; attempt < 3; attempt++ {
		state, err := store.Read(ctx)
		if err != nil {
			return nil, "storage_unavailable"
		}
		before, profile, err := s.templateProfile(ctx, r)
		if err != nil {
			return nil, err.Error()
		}
		own, err := s.templateProfileEntry(profile)
		if err != nil {
			return nil, err.Error()
		}
		if own != nil {
			generation, _ := s.templateGeneration(yamlField(own, "url").Value)
			if generation == state.Generation {
				verified, reason := s.templateRegistration(ctx, r, state)
				if reason == "" {
					return verified, ""
				}
			}
		}
		desired, err := s.templateUpdatedProfile(ctx, r, profile, state.Generation)
		if err != nil {
			return nil, err.Error()
		}
		latest, err := store.Read(ctx)
		if err != nil {
			return nil, "storage_unavailable"
		}
		if latest.Generation != state.Generation {
			continue
		}
		current, _, err := s.templateProfile(ctx, r)
		if err != nil {
			return nil, err.Error()
		}
		if current != before {
			continue
		}
		if _, err := s.templateRequest(ctx, r, http.MethodPut, "profile", map[string]string{"yaml": desired}); err != nil {
			return nil, err.Error()
		}
		latest, err = store.Read(ctx)
		if err != nil {
			return nil, "storage_unavailable"
		}
		if latest.Generation != state.Generation {
			continue
		}
		verified, reason := s.templateRegistration(ctx, r, latest)
		if reason != "" {
			return verified, reason
		}
		return verified, ""
	}
	return nil, "registration_changed"
}
