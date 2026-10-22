package modeltemplate

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"regexp"
	"strings"

	"gopkg.in/yaml.v3"
)

const MaxInputBytes = 128 << 10
const MaxStateBytes = 900 << 10
const maxSafeInteger = 1<<53 - 1

var nameRE = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]{0,62}$`)
var variantRE = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,62}$`)
var versionRE = regexp.MustCompile(`^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$`)
var hfRE = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]*/[A-Za-z0-9][A-Za-z0-9._-]*$`)
var digestRE = regexp.MustCompile(`^sha256:[a-f0-9]{64}$`)
var imageRepositoryRE = regexp.MustCompile(`^[a-z0-9]+([._-][a-z0-9]+)*(:[0-9]+)?(/[a-z0-9]+([._-]+[a-z0-9]+)*)*$`)
var imageTagRE = regexp.MustCompile(`^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$`)

var ErrDuplicate = errors.New("a template with this model name already exists")
var ErrTooLarge = errors.New("model template storage exceeds its size limit")
var ErrInvalidState = errors.New("model template storage is invalid")

func ValidName(name string) bool       { return nameRE.MatchString(name) }
func ValidVersion(version string) bool { return len(version) <= 64 && versionRE.MatchString(version) }

type Source struct {
	HF string `json:"hf"`
}
type Metadata struct {
	Name        string   `json:"name"`
	DisplayName string   `json:"displayName,omitempty"`
	Description string   `json:"description,omitempty"`
	Family      string   `json:"family,omitempty"`
	Tags        []string `json:"tags,omitempty"`
	Source      Source   `json:"source"`
}
type Input struct {
	Metadata   Metadata `json:"metadata"`
	RecipeYAML string   `json:"recipeYAML"`
}
type Recipe struct {
	APIVersion string    `yaml:"apiVersion" json:"apiVersion"`
	Name       string    `yaml:"name" json:"name"`
	Version    string    `yaml:"version" json:"version"`
	ServedName string    `yaml:"servedName,omitempty" json:"servedName,omitempty"`
	Variants   []Variant `yaml:"variants" json:"variants"`
}
type Chart struct {
	Name    string `yaml:"name" json:"name"`
	Version string `yaml:"version" json:"version"`
}
type Image struct {
	Repository string `yaml:"repository" json:"repository"`
	Tag        string `yaml:"tag" json:"tag"`
	Digest     string `yaml:"digest,omitempty" json:"digest,omitempty"`
}
type Requires struct {
	GPUs            int      `yaml:"gpus" json:"gpus"`
	Vendor          string   `yaml:"vendor,omitempty" json:"vendor,omitempty"`
	Nodes           int      `yaml:"nodes,omitempty" json:"nodes,omitempty"`
	Topology        string   `yaml:"topology,omitempty" json:"topology,omitempty"`
	GPUProduct      []string `yaml:"gpuProduct,omitempty" json:"gpuProduct,omitempty"`
	MinGPUMemoryGiB float64  `yaml:"minGpuMemoryGiB,omitempty" json:"minGpuMemoryGiB,omitempty"`
	RDMA            bool     `yaml:"rdma,omitempty" json:"rdma,omitempty"`
}
type Variant struct {
	ID          string         `yaml:"id" json:"id"`
	Description string         `yaml:"description,omitempty" json:"description,omitempty"`
	Link        string         `yaml:"link,omitempty" json:"link,omitempty"`
	Default     bool           `yaml:"default,omitempty" json:"default,omitempty"`
	Engine      string         `yaml:"engine" json:"engine"`
	Chart       Chart          `yaml:"chart" json:"chart"`
	Image       *Image         `yaml:"image,omitempty" json:"image,omitempty"`
	Requires    Requires       `yaml:"requires" json:"requires"`
	Values      map[string]any `yaml:"values,omitempty" json:"values,omitempty"`
}

type VariantSummary struct {
	ID          string   `json:"id"`
	Description string   `json:"description,omitempty"`
	Link        string   `json:"link,omitempty"`
	Default     bool     `json:"default,omitempty"`
	Engine      string   `json:"engine"`
	Chart       Chart    `json:"chart"`
	Requires    Requires `json:"requires"`
}
type IndexVersion struct {
	Version  string           `json:"version"`
	Path     string           `json:"path"`
	Digest   string           `json:"digest"`
	Variants []VariantSummary `json:"variants"`
}
type IndexModel struct {
	Metadata
	Latest   string         `json:"latest"`
	Versions []IndexVersion `json:"versions"`
}
type Index struct {
	APIVersion string       `json:"apiVersion"`
	Count      int          `json:"count"`
	Models     []IndexModel `json:"models"`
}
type Record struct {
	Input
	CreationGen int64  `json:"creationGen"`
	CreatedBy   string `json:"createdBy"`
	CreatedAt   string `json:"createdAt"`
}
type State struct {
	Version    int      `json:"version"`
	Generation int64    `json:"generation"`
	Records    []Record `json:"records"`
}

func Empty() *State { return &State{Version: 1, Records: []Record{}} }

func Validate(in Input) (*Recipe, error) {
	m := in.Metadata
	if !ValidName(m.Name) || len(m.DisplayName) > 256 || len(m.Description) > 4096 || len(m.Family) > 128 || len(m.Tags) > 32 || len(m.Source.HF) > 256 || !hfRE.MatchString(m.Source.HF) {
		return nil, errors.New("invalid model metadata; name and source.hf (org/name) are required")
	}
	for _, tag := range m.Tags {
		if tag == "" || len(tag) > 128 {
			return nil, errors.New("invalid model tags")
		}
	}
	if in.RecipeYAML == "" || len(in.RecipeYAML) > MaxInputBytes {
		return nil, errors.New("recipe YAML is empty or exceeds the size limit")
	}
	var node yaml.Node
	decoder := yaml.NewDecoder(strings.NewReader(in.RecipeYAML))
	if err := decoder.Decode(&node); err != nil {
		return nil, errors.New("invalid recipe YAML")
	}
	if decoder.Decode(new(yaml.Node)) != io.EOF {
		return nil, errors.New("exactly one YAML document is required")
	}
	nodes := 0
	if !safeYAML(&node, 0, &nodes) {
		return nil, errors.New("recipe YAML aliases, custom tags, complex keys or excessive nesting are not allowed")
	}
	var p Recipe
	decoder = yaml.NewDecoder(strings.NewReader(in.RecipeYAML))
	decoder.KnownFields(true)
	if err := decoder.Decode(&p); err != nil {
		return nil, errors.New("recipe contains invalid fields or field types")
	}
	if p.APIVersion != "catalog.swiss/v1" || p.Name != m.Name || !ValidVersion(p.Version) || len(p.Variants) == 0 || len(p.Variants) > 32 {
		return nil, errors.New("recipe must use catalog.swiss/v1, match the model name, and declare a semantic version and variants")
	}
	if len(p.ServedName) > 128 || strings.ContainsAny(p.ServedName, " \t\r\n") {
		return nil, errors.New("invalid served model name")
	}
	seen := map[string]bool{}
	defaults := 0
	for _, v := range p.Variants {
		if !variantRE.MatchString(v.ID) || seen[v.ID] {
			return nil, errors.New("variant ids must be valid and unique")
		}
		seen[v.ID] = true
		if v.Default {
			defaults++
		}
		if (v.Engine != "sglang" && v.Engine != "vllm") || v.Chart.Name != v.Engine || !ValidVersion(v.Chart.Version) {
			return nil, errors.New("variants require sglang/vllm and a matching chart with an exact semantic version")
		}
		if len(v.Description) > 4096 || len(v.Link) > 2048 {
			return nil, errors.New("variant description or link exceeds the size limit")
		}
		if v.Image != nil && (!imageRepositoryRE.MatchString(v.Image.Repository) || len(v.Image.Repository) > 512 || !imageTagRE.MatchString(v.Image.Tag) || v.Image.Digest != "" && !digestRE.MatchString(v.Image.Digest)) {
			return nil, errors.New("invalid engine image")
		}
		r := v.Requires
		if r.GPUs < 1 || int64(r.GPUs) > maxSafeInteger || r.Nodes < 0 || int64(r.Nodes) > maxSafeInteger || r.MinGPUMemoryGiB < 0 || len(r.GPUProduct) > 32 {
			return nil, errors.New("invalid GPU requirements")
		}
		switch r.Vendor {
		case "", "nvidia", "ascend", "cambricon", "hygon", "amd":
		default:
			return nil, errors.New("unknown accelerator vendor")
		}
		switch r.Topology {
		case "", "single-node":
		case "lws":
			lws, _ := v.Values["lws"].(map[string]any)
			size, _ := lws["size"].(int)
			if r.Nodes < 2 || size != r.Nodes {
				return nil, errors.New("LWS requires matching requires.nodes and values.lws.size")
			}
		default:
			return nil, errors.New("unknown GPU topology")
		}
		for _, product := range r.GPUProduct {
			if product == "" || len(product) > 256 {
				return nil, errors.New("invalid GPU product")
			}
		}
	}
	if defaults > 1 {
		return nil, errors.New("at most one variant may be the default")
	}
	if _, err := json.Marshal(p); err != nil {
		return nil, errors.New("recipe values must be JSON compatible")
	}
	return &p, nil
}

func safeYAML(n *yaml.Node, depth int, count *int) bool {
	*count++
	if depth > 48 || *count > 16000 || n.Kind == yaml.AliasNode {
		return false
	}
	switch n.Tag {
	case "", "!!map", "!!seq", "!!str", "!!int", "!!float", "!!bool", "!!null":
	default:
		return false
	}
	if n.Kind == yaml.MappingNode {
		for i := 0; i < len(n.Content); i += 2 {
			if n.Content[i].Kind != yaml.ScalarNode || n.Content[i].Tag != "!!str" {
				return false
			}
		}
	}
	for _, child := range n.Content {
		if !safeYAML(child, depth+1, count) {
			return false
		}
	}
	return true
}

func Decode(raw string) (*State, error) {
	if len(raw) > MaxStateBytes {
		return nil, ErrTooLarge
	}
	var s State
	dec := json.NewDecoder(strings.NewReader(raw))
	dec.DisallowUnknownFields()
	if dec.Decode(&s) != nil || dec.Decode(new(any)) != io.EOF || s.Version != 1 || s.Generation < 0 || s.Generation > 1000 || int64(len(s.Records)) != s.Generation {
		return nil, ErrInvalidState
	}
	names := map[string]bool{}
	generations := map[int64]bool{}
	for _, r := range s.Records {
		if names[r.Metadata.Name] || r.CreationGen < 1 || r.CreationGen > s.Generation || generations[r.CreationGen] {
			return nil, ErrInvalidState
		}
		if _, err := Validate(r.Input); err != nil {
			return nil, ErrInvalidState
		}
		names[r.Metadata.Name] = true
		generations[r.CreationGen] = true
	}
	return &s, nil
}
func (s *State) Encode() (string, error) {
	raw, err := json.Marshal(s)
	if err != nil {
		return "", err
	}
	if len(raw) > MaxStateBytes {
		return "", ErrTooLarge
	}
	return string(raw), nil
}
func (s *State) Add(in Input, actor, stamp string) error {
	for _, record := range s.Records {
		if record.Metadata.Name == in.Metadata.Name {
			return ErrDuplicate
		}
	}
	if s.Generation >= 1000 {
		return ErrTooLarge
	}
	s.Generation++
	s.Records = append(s.Records, Record{Input: in, CreationGen: s.Generation, CreatedBy: actor, CreatedAt: stamp})
	return nil
}
func (s *State) Index(generation int64) (*Index, error) {
	if generation < 0 || generation > s.Generation {
		return nil, errors.New("unknown catalog generation")
	}
	idx := &Index{APIVersion: "catalog.swiss/v1", Models: []IndexModel{}}
	for _, r := range s.Records {
		if r.CreationGen > generation {
			continue
		}
		p, err := Validate(r.Input)
		if err != nil {
			return nil, ErrInvalidState
		}
		variants := []VariantSummary{}
		for _, v := range p.Variants {
			variants = append(variants, VariantSummary{ID: v.ID, Description: v.Description, Link: v.Link, Default: v.Default, Engine: v.Engine, Chart: v.Chart, Requires: v.Requires})
		}
		sum := sha256.Sum256([]byte(r.RecipeYAML))
		idx.Models = append(idx.Models, IndexModel{Metadata: r.Metadata, Latest: p.Version, Versions: []IndexVersion{{Version: p.Version, Path: fmt.Sprintf("models/%s/%s-%s.yaml", p.Name, p.Name, p.Version), Digest: "sha256:" + hex.EncodeToString(sum[:]), Variants: variants}}})
	}
	idx.Count = len(idx.Models)
	return idx, nil
}
func (s *State) Recipe(generation int64, name, filename string) ([]byte, bool) {
	if generation < 0 || generation > s.Generation || !ValidName(name) {
		return nil, false
	}
	for _, r := range s.Records {
		if r.CreationGen <= generation && r.Metadata.Name == name {
			p, err := Validate(r.Input)
			if err != nil {
				return nil, false
			}
			if filename == name+"-"+p.Version+".yaml" {
				return []byte(r.RecipeYAML), true
			}
		}
	}
	return nil, false
}
func EqualIndex(raw []byte, want *Index) bool {
	var got Index
	if json.Unmarshal(raw, &got) != nil {
		return false
	}
	a, _ := json.Marshal(&got)
	b, _ := json.Marshal(want)
	return bytes.Equal(a, b)
}
