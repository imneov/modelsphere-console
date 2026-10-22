package server

import (
	"bytes"
	"encoding/json"
	"slices"

	"github.com/modelsphere/console/internal/modeltemplate"
)

type templateCatalogModel struct {
	modeltemplate.Metadata
	DefaultVariant string                   `json:"defaultVariant"`
	Variants       []templateCatalogVariant `json:"variants"`
}

type templateCatalogVariant struct {
	modeltemplate.VariantSummary
	Version string `json:"version"`
	Digest  string `json:"digest"`
}

func templateCatalogMatches(result map[string]json.RawMessage, want *modeltemplate.Index) bool {
	schema := ""
	if raw, ok := result["schema"]; ok {
		if json.Unmarshal(raw, &schema) != nil || schema != "v1" {
			return false
		}
	}
	hasIndex := false
	if raw, ok := result["index"]; ok && !bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		if !modeltemplate.EqualIndex(raw, want) {
			return false
		}
		hasIndex = true
	}
	if raw, ok := result["models"]; ok {
		return schema == "v1" && templateCatalogModelsMatch(raw, want)
	}
	return hasIndex
}

func templateCatalogModelsMatch(raw json.RawMessage, want *modeltemplate.Index) bool {
	var models []templateCatalogModel
	if json.Unmarshal(raw, &models) != nil || models == nil || len(models) != len(want.Models) {
		return false
	}
	byName := make(map[string]templateCatalogModel, len(models))
	for _, model := range models {
		if _, exists := byName[model.Name]; exists {
			return false
		}
		byName[model.Name] = model
	}
	for _, expected := range want.Models {
		model, ok := byName[expected.Name]
		if !ok || !templateMetadataMatches(model.Metadata, expected.Metadata) {
			return false
		}
		var latest *modeltemplate.IndexVersion
		for i := range expected.Versions {
			if expected.Versions[i].Version == expected.Latest {
				latest = &expected.Versions[i]
				break
			}
		}
		if latest == nil || len(latest.Variants) == 0 || len(model.Variants) != len(latest.Variants) {
			return false
		}
		defaultID := latest.Variants[0].ID
		for _, variant := range latest.Variants {
			if variant.Default {
				defaultID = variant.ID
				break
			}
		}
		if model.DefaultVariant != defaultID {
			return false
		}
		variants := make(map[string]templateCatalogVariant, len(model.Variants))
		for _, variant := range model.Variants {
			if _, exists := variants[variant.ID]; exists {
				return false
			}
			variants[variant.ID] = variant
		}
		for _, expectedVariant := range latest.Variants {
			variant, ok := variants[expectedVariant.ID]
			if !ok || variant.Version != latest.Version || variant.Digest != latest.Digest || variant.Engine != expectedVariant.Engine || variant.Chart != expectedVariant.Chart || !templateRequirementsMatch(variant.Requires, expectedVariant.Requires) {
				return false
			}
		}
	}
	return true
}

func templateMetadataMatches(got, want modeltemplate.Metadata) bool {
	return got.Name == want.Name && got.DisplayName == want.DisplayName && got.Description == want.Description && got.Family == want.Family && got.Source.HF == want.Source.HF && templateStringsEqual(got.Tags, want.Tags)
}
func templateStringsEqual(a, b []string) bool {
	a = slices.Clone(a)
	b = slices.Clone(b)
	slices.Sort(a)
	slices.Sort(b)
	return slices.Equal(a, b)
}
func templateRequirementsMatch(a, b modeltemplate.Requires) bool {
	normalize := func(r modeltemplate.Requires) modeltemplate.Requires {
		if r.Vendor == "" {
			r.Vendor = "nvidia"
		}
		if r.Nodes == 0 {
			r.Nodes = 1
		}
		if r.Topology == "" {
			r.Topology = "single-node"
		}
		return r
	}
	a, b = normalize(a), normalize(b)
	return a.GPUs == b.GPUs && a.Vendor == b.Vendor && a.Nodes == b.Nodes && a.Topology == b.Topology && a.MinGPUMemoryGiB == b.MinGPUMemoryGiB && a.RDMA == b.RDMA && templateStringsEqual(a.GPUProduct, b.GPUProduct)
}
