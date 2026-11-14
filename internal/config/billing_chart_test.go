package config

import (
	"bytes"
	"encoding/json"
	"io"
	"os/exec"
	"path/filepath"
	syaml "sigs.k8s.io/yaml"
	"testing"

	"gopkg.in/yaml.v3"
	appsv1 "k8s.io/api/apps/v1"
)

func TestHelmBillingExampleProducesValidatedProcessConfiguration(t *testing.T) {
	configuration := renderChartConfig(t, "--values", filepath.Join("..", "..", "helm", "console", "values-billing.example.yaml"))
	configuration.Server.Auth.JWTSecret = "test"
	if err := configuration.Validate(); err != nil {
		t.Fatal(err)
	}
	if !configuration.Billing.Enabled || configuration.Router.KeySource != "crd" || configuration.Billing.Usage.Concurrency != 4 || configuration.Router.Pipeline.MaxAttempts != 2 {
		t.Fatalf("billing configuration was lost: %+v", configuration.Billing)
	}
}

func TestHelmBillingKeepsJournalClaimsAndSeparatesWorkerSelectors(t *testing.T) {
	if _, err := exec.LookPath("helm"); err != nil {
		t.Skip("helm is not installed")
	}
	root := filepath.Join("..", "..")
	requireChartDependencies(t, root)
	command := exec.Command("helm", "template", "billing", filepath.Join(root, "helm", "console"), "--values", filepath.Join(root, "helm", "console", "values-billing.example.yaml"))
	output, err := command.Output()
	if err != nil {
		t.Fatal(err)
	}
	decoder := yaml.NewDecoder(bytes.NewReader(output))
	workers, gateways := 0, 0
	for {
		var object map[string]any
		if err := decoder.Decode(&object); err == io.EOF {
			break
		} else if err != nil {
			t.Fatal(err)
		}
		switch object["kind"] {
		case "StatefulSet":
			gateways++
			encoded, err := yaml.Marshal(object)
			if err != nil {
				t.Fatal(err)
			}
			assertRetainedJournal(t, encoded)
		case "Deployment":
			workers++
			spec := object["spec"].(map[string]any)
			selector := spec["selector"].(map[string]any)["matchLabels"].(map[string]any)
			if selector["app.kubernetes.io/name"] != "console-billing" {
				t.Fatalf("worker matches the gateway selector: %+v", selector)
			}
		}
	}
	if gateways != 1 || workers != 2 {
		t.Fatalf("workload roles: gateways=%d workers=%d", gateways, workers)
	}
}

func assertRetainedJournal(t *testing.T, encoded []byte) {
	t.Helper()

	// Decode via Kubernetes JSON tags so this asserts the controller's actual shape.
	jsonEncoded, err := syaml.YAMLToJSON(encoded)
	if err != nil {
		t.Fatal(err)
	}
	var stateful appsv1.StatefulSet
	if err := json.Unmarshal(jsonEncoded, &stateful); err != nil {
		t.Fatal(err)
	}
	policy := stateful.Spec.PersistentVolumeClaimRetentionPolicy
	if len(stateful.Spec.VolumeClaimTemplates) != 1 || policy == nil || policy.WhenDeleted != appsv1.RetainPersistentVolumeClaimRetentionPolicyType || policy.WhenScaled != appsv1.RetainPersistentVolumeClaimRetentionPolicyType {
		t.Fatal("gateway journal is not retained per ordinal")
	}
}
