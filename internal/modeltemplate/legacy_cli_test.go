package modeltemplate

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"gopkg.in/yaml.v3"
)

func TestPublishedTemplateComposesWithLegacySwiss(t *testing.T) {
	binary := os.Getenv("SWISS_CATALOG_COMPAT_BIN")
	if binary == "" {
		t.Skip("set SWISS_CATALOG_COMPAT_BIN to verify an existing Swiss reader")
	}
	in := testInput("custom")
	if inputFile := os.Getenv("SWISS_CATALOG_COMPAT_INPUT"); inputFile != "" {
		raw, err := os.ReadFile(inputFile)
		if err != nil || json.Unmarshal(raw, &in) != nil {
			t.Fatal("cannot read the generated template input")
		}
	}
	recipe, err := Validate(in)
	if err != nil {
		t.Fatal(err)
	}
	name := in.Metadata.Name
	variant := recipe.Variants[0]
	state := Empty()
	if err := state.Add(in, "operator", "now"); err != nil {
		t.Fatal(err)
	}
	index, err := state.Index(1)
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/catalog/console/g/1/index.json":
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(index)
		case "/catalog/console/g/1/models/" + name + "/" + name + "-" + recipe.Version + ".yaml":
			body, _ := state.Recipe(1, name, name+"-"+recipe.Version+".yaml")
			w.Header().Set("Content-Type", "application/yaml")
			_, _ = w.Write(body)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	directory := t.TempDir()
	profile := filepath.Join(directory, "profile.yaml")
	if err := os.WriteFile(profile, []byte("name: compatibility\nnamespace: models\nchartRepo: https://charts.example\nmodel:\n  pathTemplate: /models/{{hf}}\n"), 0600); err != nil {
		t.Fatal(err)
	}
	planFile := filepath.Join(directory, "plan.yaml")
	ctx, cancel := context.WithTimeout(t.Context(), 20*time.Second)
	defer cancel()
	command := exec.CommandContext(ctx, binary, "--catalog", server.URL+"/catalog/console/g/1/index.json", "--profile", profile, "plan", "--model", name, "--variant", variant.ID, "--output", planFile)
	command.Dir = directory
	if output, err := command.CombinedOutput(); err != nil {
		t.Fatalf("existing Swiss reader rejected the published template: %v\n%s", err, output)
	}
	raw, err := os.ReadFile(planFile)
	if err != nil {
		t.Fatal(err)
	}
	var plan map[string]any
	if err := yaml.Unmarshal(raw, &plan); err != nil {
		t.Fatal(err)
	}
	source, _ := plan["source"].(map[string]any)
	chart, _ := plan["chart"].(map[string]any)
	if plan["apiVersion"] != "plan.swiss/v1" || source["model"] != name || source["variant"] != variant.ID || chart["name"] != variant.Chart.Name || chart["version"] != variant.Chart.Version {
		t.Fatalf("unexpected composed identity: source=%v chart=%v", source, chart)
	}
}
