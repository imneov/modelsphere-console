package config

import (
	"bytes"
	"encoding/json"
	"io"
	"os/exec"
	"path/filepath"
	syaml "sigs.k8s.io/yaml"
	"slices"
	"strings"
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
	if configuration.Cluster.ClientQPS != 50 || configuration.Cluster.ClientBurst != 100 || !configuration.Billing.Enabled || configuration.Router.KeySource != "crd" || configuration.Billing.Usage.Concurrency != 4 || configuration.Router.Pipeline.MaxAttempts != 2 || !slices.Equal(configuration.Router.Pipeline.FailoverStatuses, []int{429, 500, 502, 503, 504}) {
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
	workerImages, gatewayImages := map[string]bool{}, map[string]bool{}
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
			gatewayImages[containerImage(t, object)] = true
		case "Deployment":
			workers++
			spec := object["spec"].(map[string]any)
			annotations := spec["template"].(map[string]any)["metadata"].(map[string]any)["annotations"].(map[string]any)
			if annotations["checksum/config"] == "" || annotations["checksum/config"] == nil {
				t.Fatal("worker configuration changes would not roll the process")
			}
			selector := spec["selector"].(map[string]any)["matchLabels"].(map[string]any)
			if selector["app.kubernetes.io/name"] != "console-billing" {
				t.Fatalf("worker matches the gateway selector: %+v", selector)
			}
			workerImages[containerImage(t, object)] = true
		}
	}
	if gateways != 1 || workers != 2 {
		t.Fatalf("workload roles: gateways=%d workers=%d", gateways, workers)
	}
	if len(workerImages) != 1 || !strings.Contains(firstKey(workerImages), "/billing:") {
		t.Fatalf("workers do not run the billing image: %v", workerImages)
	}
	if len(gatewayImages) != 1 || !strings.Contains(firstKey(gatewayImages), "/console:") {
		t.Fatalf("gateway does not run the console image: %v", gatewayImages)
	}
}

func containerImage(t *testing.T, object map[string]any) string {
	t.Helper()
	pod := object["spec"].(map[string]any)["template"].(map[string]any)
	containers := pod["spec"].(map[string]any)["containers"].([]any)
	return containers[0].(map[string]any)["image"].(string)
}

func firstKey(values map[string]bool) string {
	for value := range values {
		return value
	}
	return ""
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

func TestClusterRateLimitsMustBeConfiguredTogether(t *testing.T) {
	for _, limits := range []Cluster{{ClientQPS: -1}, {ClientBurst: -1}, {ClientQPS: 20}, {ClientBurst: 40}} {
		configuration := Config{Cluster: limits}
		if err := configuration.Validate(); err == nil || !strings.Contains(err.Error(), "clientQPS") {
			t.Fatalf("invalid limits accepted: %+v: %v", limits, err)
		}
	}
}
