package config

import (
	"io"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

func templateConfig() *Config {
	return &Config{Server: Server{Auth: Auth{Disabled: true}}, Backends: []Backend{{Name: "swiss", Prefix: "/api/deploy", URL: "http://swiss.models.svc/api"}}, ModelTemplates: ModelTemplates{Enabled: true, Namespace: "console-ns", ConfigMap: "templates", PublishURL: "http://console-catalog.console-ns.svc:8081/catalog/console"}}
}
func TestModelTemplateConfiguration(t *testing.T) {
	bare := &Config{Server: Server{Auth: Auth{Disabled: true}}}
	bare.applyDefaults()
	if bare.ModelTemplates.Enabled || bare.ModelTemplates.Backend != "swiss" || bare.ModelTemplates.CatalogName != "console-local" {
		t.Fatalf("defaults=%+v", bare.ModelTemplates)
	}
	if err := bare.Validate(); err != nil {
		t.Fatal(err)
	}
	if bare.Server.CatalogAddr != "off" || bare.CatalogListenAddr() != "off" {
		t.Fatal("bare configuration starts a catalog listener")
	}
	enabled := templateConfig()
	enabled.applyDefaults()
	if enabled.Server.CatalogAddr != DefaultCatalogAddr {
		t.Fatalf("catalog default=%s", enabled.Server.CatalogAddr)
	}
	if err := templateConfig().Validate(); err != nil {
		t.Fatal(err)
	}
	tests := map[string]func(*Config){
		"listener off": func(c *Config) { c.Server.CatalogAddr = "off" }, "listener invalid": func(c *Config) { c.Server.CatalogAddr = "8081" }, "listener zero": func(c *Config) { c.Server.CatalogAddr = ":0" }, "web conflict": func(c *Config) { c.Server.CatalogAddr = "127.0.0.1:8080" }, "metrics conflict": func(c *Config) { c.Server.CatalogAddr = ":9090" },
		"namespace missing": func(c *Config) { c.ModelTemplates.Namespace = "" }, "namespace unsafe": func(c *Config) { c.ModelTemplates.Namespace = "*" }, "configmap missing": func(c *Config) { c.ModelTemplates.ConfigMap = "" },
		"userinfo": func(c *Config) { c.ModelTemplates.PublishURL = "http://secret:password@console/catalog/console" }, "query": func(c *Config) { c.ModelTemplates.PublishURL += "?key=value" }, "fragment": func(c *Config) { c.ModelTemplates.PublishURL += "#fragment" }, "path": func(c *Config) { c.ModelTemplates.PublishURL = "http://console/other" },
		"catalog name": func(c *Config) { c.ModelTemplates.CatalogName = "../escape" }, "missing backend": func(c *Config) { c.Backends = nil }, "wrong module": func(c *Config) { c.Backends[0].Prefix = "/api/other" }, "reserved route": func(c *Config) { c.Backends[0].Prefix = "/api/model-templates" },
	}
	for name, mutate := range tests {
		t.Run(name, func(t *testing.T) {
			c := templateConfig()
			mutate(c)
			if err := c.Validate(); err == nil {
				t.Fatal("invalid configuration accepted")
			}
		})
	}
}
func TestHelmModelTemplateDefaultsAndScopedStorage(t *testing.T) {
	bare := renderChartConfig(t)
	if bare.ModelTemplates.Enabled || bare.Server.CatalogAddr != "off" {
		t.Fatal("Console-only install enabled templates without Swiss")
	}
	args := []string{"--set", "externalSwiss.url=http://swiss.swiss.svc/api"}
	c := renderChartConfig(t, args...)
	c.Server.Auth.JWTSecret = "test"
	if err := c.Validate(); err != nil {
		t.Fatal(err)
	}
	if c.Server.CatalogAddr != ":8081" {
		t.Fatalf("catalog listener=%s", c.Server.CatalogAddr)
	}
	if !c.ModelTemplates.Enabled || c.ModelTemplates.Namespace != "modelsphere" || c.ModelTemplates.ConfigMap != "console-console-model-templates" || c.ModelTemplates.PublishURL != "http://console-console-catalog.modelsphere.svc:8081/catalog/console" {
		t.Fatalf("templates=%+v", c.ModelTemplates)
	}
	out, err := helmTemplate(t, args...)
	if err != nil {
		t.Fatalf("render %v %s", err, out)
	}
	dec := yaml.NewDecoder(strings.NewReader(out))
	roles, bindings := 0, 0
	for {
		var doc struct {
			Kind     string                           `yaml:"kind"`
			Metadata struct{ Name, Namespace string } `yaml:"metadata"`
			Rules    []struct {
				APIGroups     []string `yaml:"apiGroups"`
				Resources     []string `yaml:"resources"`
				ResourceNames []string `yaml:"resourceNames"`
				Verbs         []string `yaml:"verbs"`
			} `yaml:"rules"`
			Data map[string]string `yaml:"data"`
		}
		err := dec.Decode(&doc)
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatal(err)
		}
		if doc.Kind == "ConfigMap" && doc.Data["state.json"] != "" {
			t.Fatal("chart owns mutable runtime catalog data")
		}
		if doc.Metadata.Name != "console-console-model-templates" {
			continue
		}
		if doc.Metadata.Namespace != "modelsphere" {
			t.Fatalf("namespace=%s", doc.Metadata.Namespace)
		}
		switch doc.Kind {
		case "Role":
			roles++
			if len(doc.Rules) != 2 {
				t.Fatalf("rules=%v", doc.Rules)
			}
			for _, rule := range doc.Rules {
				if strings.Join(rule.Resources, ",") != "configmaps" || strings.Join(rule.APIGroups, ",") != "" {
					t.Fatalf("unexpected rule=%v", rule)
				}
				verbs := strings.Join(rule.Verbs, ",")
				if verbs == "get,update" {
					if strings.Join(rule.ResourceNames, ",") != "console-console-model-templates" {
						t.Fatal("unscoped storage reads/updates")
					}
				} else if verbs != "create" {
					t.Fatalf("unsafe storage verbs=%s", verbs)
				}
			}
		case "RoleBinding":
			bindings++
		default:
			t.Fatalf("unexpected mutable storage object kind=%s", doc.Kind)
		}
	}
	if roles != 1 || bindings != 1 {
		t.Fatalf("roles=%d bindings=%d", roles, bindings)
	}
	for _, extra := range [][]string{{"--set", "modelTemplates.enabled=false"}, {"--set", "rbac.create=false"}} {
		out, err := helmTemplate(t, append(append([]string{}, args...), extra...)...)
		if err != nil {
			t.Fatalf("render %v %s", err, out)
		}
		if strings.Contains(out, "name: console-console-model-templates\n") {
			t.Fatal("storage Role created with feature/custom RBAC disabled")
		}
	}
	c = renderChartConfig(t, append(args, "--set", "modelTemplates.namespace=custom", "--set", "modelTemplates.configMap=custom-state", "--set", "modelTemplates.publishURL=http://console.internal/catalog/console")...)
	if c.ModelTemplates.Namespace != "custom" || c.ModelTemplates.ConfigMap != "custom-state" || c.ModelTemplates.PublishURL != "http://console.internal/catalog/console" {
		t.Fatalf("overrides=%+v", c.ModelTemplates)
	}
}
