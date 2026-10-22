package server

import (
	"encoding/json"
	"slices"
	"testing"

	"github.com/modelsphere/console/internal/modeltemplate"
)

func modernTemplateEnvelope(index modeltemplate.Index) map[string]any {
	models := []any{}
	for _, model := range index.Models {
		raw, _ := json.Marshal(model.Metadata)
		var metadata map[string]any
		_ = json.Unmarshal(raw, &metadata)
		version := model.Versions[0]
		defaultID := version.Variants[0].ID
		variants := []any{}
		for _, variant := range version.Variants {
			raw, _ := json.Marshal(variant)
			var fields map[string]any
			_ = json.Unmarshal(raw, &fields)
			fields["version"] = version.Version
			fields["digest"] = version.Digest
			variants = append(variants, fields)
			if variant.Default {
				defaultID = variant.ID
			}
		}
		metadata["variants"] = variants
		metadata["defaultVariant"] = defaultID
		models = append(models, metadata)
	}
	return map[string]any{"schema": "v1", "models": models}
}
func templateEnvelopeRaw(envelope map[string]any) map[string]json.RawMessage {
	raw, _ := json.Marshal(envelope)
	var result map[string]json.RawMessage
	_ = json.Unmarshal(raw, &result)
	return result
}
func firstModernModel(envelope map[string]any) map[string]any {
	return envelope["models"].([]any)[0].(map[string]any)
}
func firstModernVariant(envelope map[string]any) map[string]any {
	return firstModernModel(envelope)["variants"].([]any)[0].(map[string]any)
}

func TestModelTemplatesModernV1CreateReadAndPublishRetry(t *testing.T) {
	_, _, swiss, h := newTemplateTestServer(t)
	swiss.modern = true
	rec := do(h, "POST", "/api/model-templates", "", templateBody("first"))
	if rec.Code != 201 {
		t.Fatalf("modern create %d %s", rec.Code, rec.Body.String())
	}
	list := decodeTemplateResult(t, do(h, "GET", "/api/model-templates", "", ""))
	if list["registeredGeneration"] != float64(1) || list["registrationError"] != nil {
		t.Fatalf("modern read=%v", list)
	}
	if published := do(h, "POST", "/api/model-templates/publish", "", "{}"); published.Code != 200 {
		t.Fatalf("already published %d %s", published.Code, published.Body.String())
	}
	if swiss.puts != 1 {
		t.Fatalf("already verified registration rewrote profile %d times", swiss.puts)
	}
	swiss.unavailable = true
	if pending := do(h, "POST", "/api/model-templates", "", templateBody("second")); pending.Code != 202 {
		t.Fatalf("modern pending %d %s", pending.Code, pending.Body.String())
	}
	swiss.unavailable = false
	retry := do(h, "POST", "/api/model-templates/publish", "", "{}")
	if retry.Code != 200 {
		t.Fatalf("modern retry %d %s", retry.Code, retry.Body.String())
	}
	result := decodeTemplateResult(t, retry)
	if result["ready"] != true || result["registeredGeneration"] != float64(2) {
		t.Fatalf("modern retry=%v", result)
	}
	list = decodeTemplateResult(t, do(h, "GET", "/api/model-templates", "", ""))
	if list["registeredGeneration"] != float64(2) {
		t.Fatalf("modern read after retry=%v", list)
	}
}

func TestTemplateCatalogMatchesNormalizedV1Semantics(t *testing.T) {
	state := modeltemplate.Empty()
	in := templateTestInput("first")
	in.Metadata.Tags = []string{"chat", "private"}
	if err := state.Add(in, "admin", "now"); err != nil {
		t.Fatal(err)
	}
	if err := state.Add(templateTestInput("second"), "admin", "now"); err != nil {
		t.Fatal(err)
	}
	index, err := state.Index(2)
	if err != nil {
		t.Fatal(err)
	}
	index.Models[0].Versions[0].Variants = append(index.Models[0].Versions[0].Variants, modeltemplate.VariantSummary{ID: "alternate", Engine: "vllm", Default: true, Chart: modeltemplate.Chart{Name: "vllm", Version: "0.7.1"}, Requires: modeltemplate.Requires{GPUs: 2}})
	envelope := modernTemplateEnvelope(*index)
	model := firstModernModel(envelope)
	model["tags"] = []any{"private", "chat"}
	model["tuning"] = []any{}
	variants := model["variants"].([]any)
	variants[0].(map[string]any)["default"] = false
	requirements := variants[0].(map[string]any)["requires"].(map[string]any)
	requirements["vendor"] = "nvidia"
	requirements["nodes"] = 1
	requirements["topology"] = "single-node"
	requirements["gpuProduct"] = []any{}
	slices.Reverse(variants)
	slices.Reverse(envelope["models"].([]any))
	if !templateCatalogMatches(templateEnvelopeRaw(envelope), index) {
		t.Fatal("equivalent ordering, nil/empty and explicit default requirements were rejected")
	}
	// The model's effective default is checked independently of optional variant flags.
	first := envelope["models"].([]any)[1].(map[string]any)
	first["defaultVariant"] = "vllm-gpu"
	if templateCatalogMatches(templateEnvelopeRaw(envelope), index) {
		t.Fatal("different effective default variant accepted")
	}
	empty, _ := modeltemplate.Empty().Index(0)
	if !templateCatalogMatches(templateEnvelopeRaw(modernTemplateEnvelope(*empty)), empty) {
		t.Fatal("empty normalized v1 catalog rejected")
	}
}

func TestModelTemplatesRejectModernCatalogContentMismatches(t *testing.T) {
	changes := map[string]func(map[string]any){
		"schema v2":        func(e map[string]any) { e["schema"] = "v2" },
		"missing schema":   func(e map[string]any) { delete(e, "schema") },
		"wrong catalog":    func(e map[string]any) { e["name"] = "other" },
		"wrong source":     func(e map[string]any) { e["source"] = "http://other.example/index.json" },
		"malformed models": func(e map[string]any) { e["models"] = "invalid" },
		"missing models":   func(e map[string]any) { delete(e, "models") },
		"null models":      func(e map[string]any) { e["models"] = nil },
		"model name":       func(e map[string]any) { firstModernModel(e)["name"] = "other" },
		"model metadata":   func(e map[string]any) { firstModernModel(e)["description"] = "different" },
		"HF identity":      func(e map[string]any) { firstModernModel(e)["source"] = map[string]any{"hf": "other/model"} },
		"default variant":  func(e map[string]any) { firstModernModel(e)["defaultVariant"] = "other" },
		"variant identity": func(e map[string]any) { firstModernVariant(e)["id"] = "other" },
		"version pin":      func(e map[string]any) { firstModernVariant(e)["version"] = "2.0.0" },
		"digest pin":       func(e map[string]any) { firstModernVariant(e)["digest"] = "sha256:wrong" },
		"engine":           func(e map[string]any) { firstModernVariant(e)["engine"] = "sglang" },
		"chart": func(e map[string]any) {
			firstModernVariant(e)["chart"] = map[string]any{"name": "vllm", "version": "1.0.0"}
		},
		"GPU requirements": func(e map[string]any) { firstModernVariant(e)["requires"].(map[string]any)["gpus"] = 2 },
		"duplicate model":  func(e map[string]any) { e["models"] = append(e["models"].([]any), firstModernModel(e)) },
		"invalid legacy index alongside models": func(e map[string]any) {
			e["index"] = map[string]any{"apiVersion": "catalog.swiss/v1", "count": 0, "models": []any{}}
		},
	}
	for name, change := range changes {
		t.Run(name, func(t *testing.T) {
			_, _, swiss, h := newTemplateTestServer(t)
			swiss.modern = true
			swiss.modernChange = change
			rec := do(h, "POST", "/api/model-templates", "", templateBody("first"))
			if rec.Code != 202 {
				t.Fatalf("mismatch %d %s", rec.Code, rec.Body.String())
			}
			result := decodeTemplateResult(t, rec)
			if result["ready"] != false || result["registeredGeneration"] != nil || result["reason"] != "registration_unverified" {
				t.Fatalf("unverified modern response accepted=%v", result)
			}
		})
	}
}
