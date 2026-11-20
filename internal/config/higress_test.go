package config

import (
	"bytes"
	"io"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

func higressConfiguration() *Config {
	return &Config{
		Server:  Server{Auth: Auth{JWTSecret: "test-signing-key"}},
		Router:  Router{KeySource: "crd", Namespace: "console", Backend: "llm"},
		Higress: Higress{Enabled: true, Models: []string{"test-model"}, Route: "test-route", SessionOrigin: "https://console.test"},
	}
}

func TestHigressConfigDoesNotRequireALegacyInferenceBackend(t *testing.T) {
	if err := higressConfiguration().Validate(); err != nil {
		t.Fatal(err)
	}
}

func TestHigressConfigurationRejectsUnsafeCombinations(t *testing.T) {
	for _, test := range []struct {
		name   string
		mutate func(*Config)
	}{
		{"anonymous", func(configuration *Config) { configuration.Server.Auth.Disabled = true }},
		{"legacy-keys", func(configuration *Config) { configuration.Router.KeySource = "secret" }},
		{"migration", func(configuration *Config) { configuration.Router.Migration = true }},
		{"paid-before-metering", func(configuration *Config) { configuration.Billing.Enabled = true }},
		{"missing-models", func(configuration *Config) { configuration.Higress.Models = nil }},
		{"duplicate-models", func(configuration *Config) { configuration.Higress.Models = []string{"same", "same"} }},
		{"invalid-model", func(configuration *Config) { configuration.Higress.Models = []string{"bad\r\nmodel"} }},
		{"origin-path", func(configuration *Config) { configuration.Higress.SessionOrigin += "/path" }},
		{"origin-userinfo", func(configuration *Config) { configuration.Higress.SessionOrigin = "https://user@console.test" }},
		{"missing-route", func(configuration *Config) { configuration.Higress.Route = "" }},
		{"negative-body-limit", func(configuration *Config) { configuration.Router.MaxBodyBytes = -1 }},
	} {
		t.Run(test.name, func(t *testing.T) {
			configuration := higressConfiguration()
			test.mutate(configuration)
			if err := configuration.Validate(); err == nil {
				t.Fatal("unsafe Higress configuration accepted")
			}
		})
	}
}

func higressHelmArguments() []string {
	return []string{"--values", "../../helm/console/values-higress.example.yaml", "--set", "fullnameOverride=console", "--set-string", "higress.extAuth.image=oci://test.invalid/ext-auth@sha256:" + strings.Repeat("a", 64)}
}

func TestHelmHigressExampleMatchesRuntimeContract(t *testing.T) {
	configuration := renderChartConfig(t, higressHelmArguments()...)
	configuration.Server.Auth.JWTSecret = "test-signing-key"
	if err := configuration.Validate(); err != nil {
		t.Fatal(err)
	}
	if !configuration.Higress.Enabled || configuration.Router.KeySource != "crd" || len(configuration.Backends) != 0 {
		t.Fatalf("Higress did not replace the old data plane: %+v", configuration)
	}
}

func TestHelmHigressUsesIndependentAuthAndExactRoutes(t *testing.T) {
	output, err := helmTemplate(t, higressHelmArguments()...)
	if err != nil {
		t.Fatal(err)
	}
	// helmTemplate includes stderr, which may contain local kubeconfig warnings.
	start := strings.Index(output, "---\n")
	if start < 0 {
		t.Fatal("helm rendered no resources")
	}
	decoder := yaml.NewDecoder(bytes.NewBufferString(output[start:]))
	objects := map[string]map[string]any{}
	for {
		var object map[string]any
		if err := decoder.Decode(&object); err == io.EOF {
			break
		} else if err != nil {
			t.Fatal(err)
		}
		if object == nil {
			continue
		}
		metadata := object["metadata"].(map[string]any)
		objects[object["kind"].(string)+"/"+metadata["name"].(string)] = object
	}
	assertHigressDeployment(t, objects)
	assertHigressRoutes(t, objects)
	assertHigressPlugin(t, objects)
	assertHigressReadOnlyRole(t, objects["Role/console-gateway-auth"])
	assertHigressReadOnlyRole(t, objects["ClusterRole/console-gateway-auth-modelsphere"])
}

func assertHigressDeployment(t *testing.T, objects map[string]map[string]any) {
	t.Helper()
	auth := objects["Deployment/console-gateway-auth"]["spec"].(map[string]any)["template"].(map[string]any)
	labels := auth["metadata"].(map[string]any)["labels"].(map[string]any)
	if labels["app.kubernetes.io/name"] != "console-gateway-auth" {
		t.Fatal("authorization pods overlap with Console Service selector")
	}
	spec := auth["spec"].(map[string]any)
	container := spec["containers"].([]any)[0].(map[string]any)
	if spec["serviceAccountName"] != "console-gateway-auth" || !strings.Contains(strings.Join(anyStrings(container["args"].([]any)), " "), "--role=gateway-auth") {
		t.Fatal("authorization is not an independent process/account")
	}
}

func assertHigressRoutes(t *testing.T, objects map[string]map[string]any) {
	t.Helper()
	for _, source := range []string{"sdk", "session"} {
		ingress := objects["Ingress/console-inference-"+source]
		annotations := ingress["metadata"].(map[string]any)["annotations"].(map[string]any)
		if annotations["higress.io/proxy-next-upstream"] != "off" || !strings.Contains(annotations["higress.io/request-header-control-remove"].(string), "Authorization,Cookie") {
			t.Fatal("generation retry or caller credential forwarding is enabled")
		}
		rule := ingress["spec"].(map[string]any)["rules"].([]any)[0].(map[string]any)
		path := rule["http"].(map[string]any)["paths"].([]any)[0].(map[string]any)
		service := path["backend"].(map[string]any)["service"].(map[string]any)
		if path["pathType"] != "Exact" || service["name"] != "example-model" {
			t.Fatal("inference goes through a wildcard path or the old Console gateway")
		}
	}
}

func assertHigressPlugin(t *testing.T, objects map[string]map[string]any) {
	t.Helper()
	spec := objects["WasmPlugin/console-ext-auth"]["spec"].(map[string]any)
	if spec["failStrategy"] != "FAIL_CLOSE" || spec["phase"] != "AUTHN" || spec["defaultConfigDisable"] != true {
		t.Fatal("authorization plugin is fail-open or globally applied")
	}
	rule := spec["matchRules"].([]any)[0].(map[string]any)
	if len(rule["ingress"].([]any)) != 2 {
		t.Fatal("both SDK and session must require auth")
	}
	configuration := rule["config"].(map[string]any)
	service := configuration["http_service"].(map[string]any)
	if configuration["failure_mode_allow"] != false || configuration["status_on_error"] != 503 || service["authorization_request"].(map[string]any)["with_request_body"] != true {
		t.Fatal("authorization is fail-open or does not authorize the model body")
	}
}

func assertHigressReadOnlyRole(t *testing.T, object map[string]any) {
	t.Helper()
	if object == nil {
		t.Fatal("auth RBAC missing")
	}
	for _, raw := range object["rules"].([]any) {
		for _, verb := range raw.(map[string]any)["verbs"].([]any) {
			if verb != "get" && verb != "list" && verb != "watch" {
				t.Fatalf("auth can mutate state: %v", verb)
			}
		}
	}
}

func anyStrings(values []any) []string {
	result := make([]string, len(values))
	for index, value := range values {
		result[index] = value.(string)
	}
	return result
}

func TestHelmHigressRejectsUnsafeDeployment(t *testing.T) {
	for _, arguments := range [][]string{
		{"--set", "billing.enabled=true"}, {"--set", "auth.disabled=true"},
		{"--set", "router.enabled=false"}, {"--set", "router.keySource=secret"},
		{"--set-string", "higress.extAuth.image=oci://test.invalid/ext-auth:latest"},
		{"--set-string", "higress.upstream.serviceName=console"},
		{"--set-string", "higress.sessionOrigin=https://attacker.test"},
	} {
		if _, err := helmTemplate(t, append(higressHelmArguments(), arguments...)...); err == nil {
			t.Fatalf("unsafe deployment accepted: %v", arguments)
		}
	}
}
