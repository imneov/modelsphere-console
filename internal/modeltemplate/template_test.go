package modeltemplate

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	k8stesting "k8s.io/client-go/testing"
)

func testInput(name string) Input {
	return Input{Metadata: Metadata{Name: name, DisplayName: "Test model", Source: Source{HF: "org/model"}}, RecipeYAML: fmt.Sprintf("# preserve these exact bytes\napiVersion: catalog.swiss/v1\nname: %s\nversion: 1.0.0\nvariants:\n  - id: vllm-gpu\n    engine: vllm\n    chart: {name: vllm, version: 0.7.1}\n    image: {repository: registry.example/vllm, tag: stable}\n    requires: {gpus: 1, vendor: nvidia}\n    values:\n      extraArgs: [--trust-remote-code]\n", name)}
}

func TestGenerationSnapshotsAndExactLegacyIndex(t *testing.T) {
	state := Empty()
	first := testInput("first")
	if err := state.Add(first, "admin", "now"); err != nil {
		t.Fatal(err)
	}
	if err := state.Add(testInput("second"), "admin", "later"); err != nil {
		t.Fatal(err)
	}
	index, err := state.Index(1)
	if err != nil {
		t.Fatal(err)
	}
	if index.Count != 1 || index.Models[0].Name != "first" || index.Models[0].Source.HF != "org/model" {
		t.Fatalf("index=%+v", index)
	}
	sum := sha256.Sum256([]byte(first.RecipeYAML))
	v := index.Models[0].Versions[0]
	if v.Digest != "sha256:"+hex.EncodeToString(sum[:]) || v.Path != "models/first/first-1.0.0.yaml" {
		t.Fatalf("pin=%+v", v)
	}
	raw, _ := json.Marshal(index)
	var wire map[string]json.RawMessage
	_ = json.Unmarshal(raw, &wire)
	if len(wire) != 3 || wire["apiVersion"] == nil || wire["count"] == nil || wire["models"] == nil {
		t.Fatalf("legacy index fields=%v", wire)
	}
	if strings.Contains(string(raw), "extraArgs") || strings.Contains(string(raw), "image") || strings.Contains(first.RecipeYAML, "source:") {
		t.Fatal("listing or recipe mixes metadata and deploy values")
	}
	doc, ok := state.Recipe(1, "first", "first-1.0.0.yaml")
	if !ok || string(doc) != first.RecipeYAML {
		t.Fatal("recipe bytes changed")
	}
	if _, ok := state.Recipe(1, "second", "second-1.0.0.yaml"); ok {
		t.Fatal("old snapshot exposes a later record")
	}
	if _, err := state.Index(3); err == nil {
		t.Fatal("future snapshot accepted")
	}
	before := state.Generation
	if !errors.Is(state.Add(first, "other", "later"), ErrDuplicate) || state.Generation != before {
		t.Fatal("duplicate mutated state")
	}
	encoded, err := state.Encode()
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := Decode(encoded)
	if err != nil || decoded.Generation != 2 {
		t.Fatalf("state=%v err=%v", decoded, err)
	}
}

func TestPositiveGPUCountsAndImageDigest(t *testing.T) {
	in := testInput("large")
	in.RecipeYAML = strings.Replace(in.RecipeYAML, "gpus: 1, vendor: nvidia", "gpus: 16, vendor: amd, nodes: 512, topology: lws, rdma: true", 1)
	in.RecipeYAML = strings.Replace(in.RecipeYAML, "    values:\n", "    values:\n      lws: {size: 512}\n", 1)
	digest := "sha256:" + strings.Repeat("a", 64)
	in.RecipeYAML = strings.Replace(in.RecipeYAML, "tag: stable}", "tag: stable, digest: "+digest+"}", 1)
	recipe, err := Validate(in)
	if err != nil {
		t.Fatal(err)
	}
	variant := recipe.Variants[0]
	if variant.Requires.GPUs != 16 || variant.Requires.Nodes != 512 || !variant.Requires.RDMA || variant.Image.Digest != digest {
		t.Fatalf("recipe fields lost: %+v", variant)
	}
	state := Empty()
	if err := state.Add(in, "admin", "now"); err != nil {
		t.Fatal(err)
	}
	encoded, err := state.Encode()
	if err != nil {
		t.Fatal(err)
	}
	state, err = Decode(encoded)
	if err != nil {
		t.Fatal(err)
	}
	index, err := state.Index(1)
	if err != nil {
		t.Fatal(err)
	}
	if index.Models[0].Versions[0].Variants[0].Requires.GPUs != 16 {
		t.Fatal("index changed GPU requirements")
	}
	doc, ok := state.Recipe(1, "large", "large-1.0.0.yaml")
	if !ok || string(doc) != in.RecipeYAML {
		t.Fatal("image digest or recipe bytes were not preserved")
	}
}

func TestStrictTemplateValidation(t *testing.T) {
	base := testInput("model")
	if _, err := Validate(base); err != nil {
		t.Fatal(err)
	}
	cases := map[string]func(*Input){
		"unknown field":         func(in *Input) { in.RecipeYAML += "namespace: other\n" },
		"source in recipe":      func(in *Input) { in.RecipeYAML += "source: {hf: other/model}\n" },
		"multiple documents":    func(in *Input) { in.RecipeYAML += "---\n{}\n" },
		"name mismatch":         func(in *Input) { in.Metadata.Name = "other" },
		"unsafe name":           func(in *Input) { in.Metadata.Name = "../model" },
		"invalid HF":            func(in *Input) { in.Metadata.Source.HF = "http://example/model" },
		"engine chart mismatch": func(in *Input) { in.RecipeYAML = strings.Replace(in.RecipeYAML, "name: vllm", "name: sglang", 1) },
		"chart range": func(in *Input) {
			in.RecipeYAML = strings.Replace(in.RecipeYAML, "version: 0.7.1", "version: latest", 1)
		},
		"zero GPUs": func(in *Input) { in.RecipeYAML = strings.Replace(in.RecipeYAML, "gpus: 1", "gpus: 0", 1) },
		"unknown vendor": func(in *Input) {
			in.RecipeYAML = strings.Replace(in.RecipeYAML, "vendor: nvidia", "vendor: made-up", 1)
		},
		"invalid image": func(in *Input) {
			in.RecipeYAML = strings.Replace(in.RecipeYAML, "registry.example/vllm", "https://registry.example/vllm", 1)
		},
		"duplicate key": func(in *Input) { in.RecipeYAML += "version: 2.0.0\n" },
		"alias": func(in *Input) {
			in.RecipeYAML = strings.Replace(in.RecipeYAML, "[--trust-remote-code]", "&args [--trust-remote-code]\n      other: *args", 1)
		},
		"binary": func(in *Input) {
			in.RecipeYAML = strings.Replace(in.RecipeYAML, "[--trust-remote-code]", "!!binary SGVsbG8=", 1)
		},
		"nonstring map key": func(in *Input) {
			in.RecipeYAML = strings.Replace(in.RecipeYAML, "extraArgs: [--trust-remote-code]", "1: something", 1)
		},
		"oversized": func(in *Input) { in.RecipeYAML = strings.Repeat("x", MaxInputBytes+1) },
	}
	for name, change := range cases {
		t.Run(name, func(t *testing.T) {
			in := base
			change(&in)
			if _, err := Validate(in); err == nil {
				t.Fatal("invalid template accepted")
			}
		})
	}
}

func TestStateBoundsAndCorruption(t *testing.T) {
	for _, raw := range []string{`{}`, `{"version":2,"generation":0,"records":[]}`, `{"version":1,"generation":2,"records":[]}`, strings.Repeat("x", MaxStateBytes+1)} {
		if _, err := Decode(raw); err == nil {
			t.Fatal("invalid state accepted")
		}
	}
	s := Empty()
	for i := 0; i < 9; i++ {
		in := testInput(fmt.Sprintf("model-%d", i))
		in.RecipeYAML += "# " + strings.Repeat("x", 110<<10) + "\n"
		if err := s.Add(in, "admin", "now"); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := s.Encode(); !errors.Is(err, ErrTooLarge) {
		t.Fatalf("size err=%v", err)
	}
}

func fakeStore(objects ...runtime.Object) (*Store, *dynamicfake.FakeDynamicClient) {
	dyn := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(runtime.NewScheme(), map[schema.GroupVersionResource]string{configMaps: "ConfigMapList"}, objects...)
	return NewStore(dyn, "console-ns", "templates"), dyn
}

func TestStoreCASAndCreateOnlyModelNames(t *testing.T) {
	store, dyn := fakeStore()
	state, err := store.Create(t.Context(), testInput("first"), "admin")
	if err != nil || state.Generation != 1 {
		t.Fatalf("create=%v %v", state, err)
	}
	conflicts := 0
	dyn.PrependReactor("update", "configmaps", func(action k8stesting.Action) (bool, runtime.Object, error) {
		if conflicts == 0 {
			conflicts++
			return true, nil, apierrors.NewConflict(configMaps.GroupResource(), "templates", errors.New("concurrent save"))
		}
		return false, nil, nil
	})
	state, err = store.Create(t.Context(), testInput("second"), "admin")
	if err != nil || state.Generation != 2 || conflicts != 1 {
		t.Fatalf("CAS=%v %v", state, err)
	}
	if _, err := store.Create(t.Context(), testInput("first"), "other"); !errors.Is(err, ErrDuplicate) {
		t.Fatalf("duplicate=%v", err)
	}
	for _, action := range dyn.Actions() {
		if action.GetNamespace() != "console-ns" || action.GetResource() != configMaps {
			t.Fatalf("unsafe storage scope: %#v", action)
		}
	}
	obj, err := dyn.Resource(configMaps).Namespace("console-ns").Get(t.Context(), "templates", metav1.GetOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if obj.GetLabels()["app.kubernetes.io/managed-by"] != "console" || obj.GetAnnotations()[ownerAnnotation] != "true" {
		t.Fatal("runtime ownership missing")
	}
}

func TestStoreRefusesForeignConfigMapAndRetriesBoundedly(t *testing.T) {
	foreign := &unstructured.Unstructured{Object: map[string]any{"apiVersion": "v1", "kind": "ConfigMap", "metadata": map[string]any{"name": "templates", "namespace": "console-ns"}, "data": map[string]any{"state.json": `{"version":1,"generation":0,"records":[]}`}}}
	store, dyn := fakeStore(foreign)
	if _, err := store.Create(t.Context(), testInput("first"), "admin"); !errors.Is(err, ErrInvalidState) {
		t.Fatalf("foreign=%v", err)
	}
	for _, a := range dyn.Actions() {
		if a.GetVerb() != "get" {
			t.Fatal("foreign object changed")
		}
	}
	store, dyn = fakeStore()
	creates := 0
	dyn.PrependReactor("create", "configmaps", func(k8stesting.Action) (bool, runtime.Object, error) {
		creates++
		return true, nil, apierrors.NewAlreadyExists(configMaps.GroupResource(), "templates")
	})
	if _, err := store.Create(t.Context(), testInput("first"), "admin"); !apierrors.IsConflict(err) || creates != 5 {
		t.Fatalf("retry err=%v count=%d", err, creates)
	}
}
