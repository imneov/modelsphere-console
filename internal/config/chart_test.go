package config

import (
	"bytes"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"gopkg.in/yaml.v3"
)

func TestHelmExistingStackExampleProducesValidConfig(t *testing.T) {
	if _, err := exec.LookPath("helm"); err != nil {
		t.Skip("helm is not installed")
	}

	root := filepath.Join("..", "..")
	cmd := exec.Command("helm", "template", "console", filepath.Join(root, "helm", "console"),
		"--namespace", "modelsphere",
		"--values", filepath.Join(root, "helm", "console", "values-existing-stack.example.yaml"),
		"--show-only", "templates/configmap.yaml",
	)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	if err != nil {
		t.Fatalf("helm template: %v\n%s", err, stderr.String())
	}

	var configMap struct {
		Data map[string]string `yaml:"data"`
	}
	if err := yaml.Unmarshal(out, &configMap); err != nil {
		t.Fatal(err)
	}
	document := configMap.Data["console.yaml"]
	if document == "" {
		t.Fatal("rendered ConfigMap has no console.yaml")
	}
	path := filepath.Join(t.TempDir(), "console.yaml")
	if err := os.WriteFile(path, []byte(document), 0o600); err != nil {
		t.Fatal(err)
	}
	c, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	c.Server.Auth.JWTSecret = "test"
	if err := c.Validate(); err != nil {
		t.Fatal(err)
	}
}
