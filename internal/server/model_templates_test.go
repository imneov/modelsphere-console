package server

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"testing/fstest"

	"github.com/modelsphere/console/internal/cluster"
	"github.com/modelsphere/console/internal/config"
	"github.com/modelsphere/console/internal/iam"
	"github.com/modelsphere/console/internal/modeltemplate"
	"gopkg.in/yaml.v3"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	dynamicfake "k8s.io/client-go/dynamic/fake"
)

var templateMapsGVR = schema.GroupVersionResource{Version: "v1", Resource: "configmaps"}

const originalTemplateProfile = "# keep operator comment\nname: cluster\nnamespace: models\nmodel:\n  pathTemplate: /models/{{hf}}\nchartRepo: https://charts.example\nextra:\n  marker: preserve\n"

type templateSwiss struct {
	mu              sync.Mutex // Guards profile, response controls, counters and hooks during requests.
	profile         string
	unavailable     bool
	puts            int
	stale           bool
	badBody         bool
	authorization   string
	profileGets     int
	changeOnRecheck bool
	onPut           func()
	redirect        string
	oversized       bool
	modern          bool
	modernChange    func(map[string]any)
}

func (f *templateSwiss) serve(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.redirect != "" {
		w.Header().Set("Location", f.redirect)
		http.Error(w, "private redirect body", 302)
		return
	}
	if f.oversized {
		_, _ = w.Write([]byte(strings.Repeat("x", maxTemplateUpstreamBytes+1)))
		return
	}
	if f.unavailable {
		http.Error(w, "upstream secret values", http.StatusServiceUnavailable)
		return
	}
	if f.authorization != "" && r.Header.Get("Authorization") != f.authorization {
		http.Error(w, "wrong token", 401)
		return
	}
	if r.Header.Get("Cookie") != "" || r.Header.Get("X-Remote-User") == "" {
		http.Error(w, "missing proxy auth", 401)
		return
	}
	switch {
	case r.Method == "GET" && r.URL.Path == "/api/profile":
		f.profileGets++
		if f.changeOnRecheck && f.profileGets == 2 {
			f.profile += "# concurrent administrator edit\n"
		}
		writeJSON(w, 200, map[string]any{"yaml": f.profile})
	case r.Method == "PUT" && r.URL.Path == "/api/profile":
		var req struct {
			YAML string `json:"yaml"`
		}
		if json.NewDecoder(r.Body).Decode(&req) != nil {
			http.Error(w, "invalid body", 400)
			return
		}
		var profile struct {
			Catalogs []struct {
				Name    string `yaml:"name"`
				URL     string `yaml:"url"`
				Default bool   `yaml:"default"`
			} `yaml:"catalogs"`
		}
		if yaml.Unmarshal([]byte(req.YAML), &profile) != nil {
			http.Error(w, "invalid profile", 400)
			return
		}
		if strings.Contains(req.YAML, "writable:") || strings.Contains(req.YAML, "schemaVersion:") {
			http.Error(w, "legacy parser rejected", 400)
			return
		}
		f.profile = req.YAML
		f.puts++
		if f.onPut != nil {
			f.onPut()
		}
		writeJSON(w, 200, map[string]any{"yaml": f.profile})
	case r.Method == "GET" && r.URL.Path == "/api/cluster":
		writeJSON(w, 200, map[string]any{"catalog": "http://original.example/index.json", "catalogFrom": "config", "catalogs": []any{map[string]any{"name": "default", "url": "http://original.example/index.json"}}})
	case r.Method == "GET" && r.URL.Path == "/api/catalog":
		var profile struct {
			Catalogs []struct {
				Name string `yaml:"name"`
				URL  string `yaml:"url"`
			} `yaml:"catalogs"`
		}
		_ = yaml.Unmarshal([]byte(f.profile), &profile)
		for _, repo := range profile.Catalogs {
			if repo.Name == r.URL.Query().Get("catalog") {
				response, err := http.Get(repo.URL)
				if err != nil {
					http.Error(w, "cannot read provider", 502)
					return
				}
				defer response.Body.Close()
				raw, _ := io.ReadAll(response.Body)
				source := repo.URL
				if f.stale {
					source = "http://stale.example/index.json"
				}
				if f.badBody {
					raw = []byte(`{"apiVersion":"catalog.swiss/v1","count":0,"models":[]}`)
				}
				if f.modern {
					var index modeltemplate.Index
					if json.Unmarshal(raw, &index) != nil {
						http.Error(w, "invalid provider index", 502)
						return
					}
					envelope := modernTemplateEnvelope(index)
					envelope["name"] = repo.Name
					envelope["source"] = source
					if f.modernChange != nil {
						f.modernChange(envelope)
					}
					writeJSON(w, 200, envelope)
				} else {
					writeJSON(w, 200, map[string]any{"name": repo.Name, "source": source, "index": json.RawMessage(raw)})
				}
				return
			}
		}
		http.Error(w, "unknown catalog", 404)
	default:
		http.NotFound(w, r)
	}
}

func templateTestInput(name string) modeltemplate.Input {
	return modeltemplate.Input{Metadata: modeltemplate.Metadata{Name: name, DisplayName: name, Source: modeltemplate.Source{HF: "org/model"}}, RecipeYAML: "# exact recipe\napiVersion: catalog.swiss/v1\nname: " + name + "\nversion: 1.0.0\nvariants:\n  - id: vllm-gpu\n    engine: vllm\n    chart: {name: vllm, version: 0.7.1}\n    image: {repository: example/vllm, tag: stable}\n    requires: {gpus: 1}\n    values: {extraArgs: [--trust-remote-code]}\n"}
}
func templateBody(name string) string {
	raw, _ := json.Marshal(templateTestInput(name))
	return string(raw)
}
func newTemplateTestServer(t *testing.T) (*Server, *dynamicfake.FakeDynamicClient, *templateSwiss, http.Handler) {
	t.Helper()
	swiss := &templateSwiss{profile: originalTemplateProfile}
	upstream := httptest.NewServer(http.HandlerFunc(swiss.serve))
	t.Cleanup(upstream.Close)
	cfg := &config.Config{Server: config.Server{Auth: config.Auth{Disabled: true}}, Backends: []config.Backend{{Name: "swiss", Prefix: "/api/deploy", URL: upstream.URL + "/api", APIKeyEnv: "TEMPLATE_TEST_KEY"}}, ModelTemplates: config.ModelTemplates{Enabled: true, Namespace: "console-ns", ConfigMap: "templates", PublishURL: "http://placeholder/catalog/console"}}
	dyn := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(runtime.NewScheme(), map[schema.GroupVersionResource]string{templateMapsGVR: "ConfigMapList", iam.RolesGVR: "IAMRoleList", iam.RoleBindingsGVR: "IAMRoleBindingList"})
	log := slog.New(slog.DiscardHandler)
	srv := New(cfg, cluster.NewKubeFrom(dyn), log, "test")
	store := iam.NewStore(dyn)
	srv.SetIAM(store, nil, iam.NewAuthenticator(store, nil, log), iam.NewAuthorizer(store))
	public := httptest.NewServer(srv.TemplateCatalogHandler())
	t.Cleanup(public.Close)
	cfg.ModelTemplates.PublishURL = public.URL + "/catalog/console"
	return srv, dyn, swiss, srv.Handler()
}
func decodeTemplateResult(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var result map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	return result
}

func TestModelTemplatesCreateRegistersLegacyAndPreservesSource(t *testing.T) {
	t.Setenv("TEMPLATE_TEST_KEY", "backend-only")
	srv, dyn, swiss, h := newTemplateTestServer(t)
	swiss.authorization = "Bearer backend-only"
	checked := do(h, "POST", "/api/model-templates/check", "caller", templateBody("first"))
	if checked.Code != 200 || len(dyn.Actions()) != 0 || swiss.puts != 0 {
		t.Fatalf("check %d %s actions=%v", checked.Code, checked.Body.String(), dyn.Actions())
	}
	rec := do(h, "POST", "/api/model-templates", "caller", templateBody("first"))
	if rec.Code != 201 {
		t.Fatalf("create %d %s", rec.Code, rec.Body.String())
	}
	result := decodeTemplateResult(t, rec)
	if result["created"] != true || result["ready"] != true || result["generation"] != float64(1) || result["registeredGeneration"] != float64(1) || result["catalogName"] != "console-local" {
		t.Fatalf("create result=%v", result)
	}
	if !strings.Contains(swiss.profile, "# keep operator comment") || !strings.Contains(swiss.profile, "marker: preserve") || !strings.Contains(swiss.profile, "http://original.example/index.json") || !strings.Contains(swiss.profile, "default: true") || !strings.Contains(swiss.profile, "default: false") {
		t.Fatalf("profile lost settings: %s", swiss.profile)
	}
	list := do(h, "GET", "/api/model-templates", "", "")
	if list.Code != 200 {
		t.Fatal(list.Body.String())
	}
	listed := decodeTemplateResult(t, list)
	if listed["registeredGeneration"] != float64(1) || listed["modelGenerations"].(map[string]any)["first"] != float64(1) {
		t.Fatalf("list=%v", listed)
	}
	for _, a := range dyn.Actions() {
		if a.GetResource() != templateMapsGVR || a.GetNamespace() != "console-ns" {
			t.Fatalf("wrong storage scope: %#v", a)
		}
	}
	puts := swiss.puts
	if duplicate := do(h, "POST", "/api/model-templates", "", templateBody("first")); duplicate.Code != 409 || swiss.puts != puts {
		t.Fatalf("duplicate %d %s", duplicate.Code, duplicate.Body.String())
	}
	if second := do(h, "POST", "/api/model-templates", "", templateBody("second")); second.Code != 201 {
		t.Fatal(second.Body.String())
	}
	old := do(srv.TemplateCatalogHandler(), "GET", "/catalog/console/g/1/index.json", "", "")
	var idx modeltemplate.Index
	_ = json.Unmarshal(old.Body.Bytes(), &idx)
	if old.Code != 200 || idx.Count != 1 || idx.Models[0].Name != "first" {
		t.Fatalf("old snapshot=%s", old.Body.String())
	}
	current := do(srv.TemplateCatalogHandler(), "GET", "/catalog/console/g/2/index.json", "", "")
	_ = json.Unmarshal(current.Body.Bytes(), &idx)
	if idx.Count != 2 {
		t.Fatalf("current=%s", current.Body.String())
	}
	recipe := do(srv.TemplateCatalogHandler(), "GET", "/catalog/console/g/1/models/first/first-1.0.0.yaml", "", "")
	if recipe.Code != 200 || recipe.Body.String() != templateTestInput("first").RecipeYAML {
		t.Fatal("published recipe bytes differ")
	}
	if later := do(srv.TemplateCatalogHandler(), "GET", "/catalog/console/g/1/models/second/second-1.0.0.yaml", "", ""); later.Code != 404 {
		t.Fatalf("future recipe visible: %d", later.Code)
	}
	head := do(srv.TemplateCatalogHandler(), "HEAD", "/catalog/console/g/1/index.json", "", "")
	if head.Code != 200 || head.Body.Len() != 0 || head.Header().Get("Content-Length") == "" {
		t.Fatalf("HEAD=%d %s", head.Code, head.Body.String())
	}
}

func TestModelTemplateSavedPendingAndPublishRetry(t *testing.T) {
	_, _, swiss, h := newTemplateTestServer(t)
	swiss.unavailable = true
	rec := do(h, "POST", "/api/model-templates", "", templateBody("first"))
	if rec.Code != 202 {
		t.Fatalf("pending %d %s", rec.Code, rec.Body.String())
	}
	result := decodeTemplateResult(t, rec)
	if result["created"] != true || result["ready"] != false || result["registeredGeneration"] != nil || strings.Contains(rec.Body.String(), "secret") {
		t.Fatalf("pending=%v", result)
	}
	list := decodeTemplateResult(t, do(h, "GET", "/api/model-templates", "", ""))
	if list["index"].(map[string]any)["count"] != float64(1) || list["registrationError"] == nil {
		t.Fatalf("saved template hidden: %v", list)
	}
	swiss.unavailable = false
	retry := do(h, "POST", "/api/model-templates/publish", "", "{}")
	if retry.Code != 200 {
		t.Fatalf("retry %d %s", retry.Code, retry.Body.String())
	}
	result = decodeTemplateResult(t, retry)
	if result["generation"] != float64(1) || result["ready"] != true {
		t.Fatalf("retry=%v", result)
	}
}

func TestModelTemplatesRejectForeignCatalogAndVerifySwissRead(t *testing.T) {
	for _, mode := range []string{"foreign", "stale source", "stale index"} {
		t.Run(mode, func(t *testing.T) {
			_, _, swiss, h := newTemplateTestServer(t)
			switch mode {
			case "foreign":
				swiss.profile += "catalogs:\n  - name: console-local\n    url: http://foreign.example/index.json\n"
			case "stale source":
				swiss.stale = true
			case "stale index":
				swiss.badBody = true
			}
			rec := do(h, "POST", "/api/model-templates", "", templateBody("first"))
			if rec.Code != 202 {
				t.Fatalf("got %d %s", rec.Code, rec.Body.String())
			}
			result := decodeTemplateResult(t, rec)
			if result["ready"] != false || result["registeredGeneration"] != nil {
				t.Fatalf("unverified ready=%v", result)
			}
			if mode == "foreign" && (swiss.puts != 0 || result["reason"] != "catalog_name_conflict") {
				t.Fatalf("foreign overwritten=%v", result)
			}
		})
	}
}

func TestModelTemplatesPreserveLegacyCatalogAndMultipleCatalogs(t *testing.T) {
	for _, profile := range []string{originalTemplateProfile + "catalogs:\n  - name: original\n    url: http://original.example/index.json\n", originalTemplateProfile + "catalog: http://legacy.example/index.json\n", originalTemplateProfile + "catalogs:\n  - name: original\n    url: http://original.example/index.json\n    default: true\n  - name: other\n    url: http://other.example/index.json\n"} {
		_, _, swiss, h := newTemplateTestServer(t)
		swiss.profile = profile
		rec := do(h, "POST", "/api/model-templates", "", templateBody("first"))
		if rec.Code != 201 {
			t.Fatalf("got %d %s", rec.Code, rec.Body.String())
		}
		if !strings.Contains(swiss.profile, "default: true") {
			t.Fatalf("original implicit default lost: %s", swiss.profile)
		}
		if strings.Contains(profile, "legacy.example") && !strings.Contains(swiss.profile, "legacy.example") {
			t.Fatal("legacy source lost")
		}
		if strings.Contains(profile, "other.example") && !strings.Contains(swiss.profile, "other.example") {
			t.Fatal("second source lost")
		}
	}
}

func TestModelTemplatesRejectInvalidInputWithoutPersistence(t *testing.T) {
	for _, body := range []string{`{}`, templateBody("first") + `{}`, strings.Replace(templateBody("first"), `"metadata":`, `"namespace":"other","metadata":`, 1), `{"recipeYAML":"` + strings.Repeat("x", 192<<10) + `"}`} {
		_, dyn, swiss, h := newTemplateTestServer(t)
		rec := do(h, "POST", "/api/model-templates", "", body)
		if rec.Code != 400 || len(dyn.Actions()) != 0 || swiss.puts != 0 {
			t.Fatalf("got %d %s actions=%v", rec.Code, rec.Body.String(), dyn.Actions())
		}
	}
}

func TestModelTemplatePermissionsPrecedeStorage(t *testing.T) {
	for _, mode := range []string{"ui only", "no backend update", "create", "publish only", "read only"} {
		t.Run(mode, func(t *testing.T) {
			srv, dyn, _, _ := newTemplateTestServer(t)
			rules := []any{}
			if mode != "ui only" {
				verbs := []any{"get", "update"}
				if mode == "no backend update" {
					verbs = []any{"get"}
				}
				rules = append(rules, map[string]any{"apiGroups": []any{iam.Group}, "resources": []any{"backends"}, "resourceNames": []any{"swiss"}, "verbs": verbs})
				native := []any{"create"}
				if mode == "publish only" {
					native = []any{"update"}
				}
				if mode == "read only" {
					native = []any{"get"}
				}
				rules = append(rules, map[string]any{"apiGroups": []any{iam.Group}, "resources": []any{"modeltemplates"}, "resourceNames": []any{"console-local"}, "verbs": native})
			}
			role := globalObj("IAMRole", "template-writer", iam.ScopePlatform, iam.ScopeGlobal, map[string]any{"rules": rules, "uiPermissions": []any{"modeltemplates.create"}})
			if err := dyn.Tracker().Add(role); err != nil {
				t.Fatal(err)
			}
			if err := dyn.Tracker().Add(globalBinding("template-admin", "template-writer", iam.ScopePlatform, iam.ScopeGlobal)); err != nil {
				t.Fatal(err)
			}
			request := httptest.NewRequest("POST", "/api/model-templates", strings.NewReader(templateBody("first")))
			request = request.WithContext(withIdentity(request.Context(), &iam.Identity{Name: "admin"}))
			rec := httptest.NewRecorder()
			srv.handleCreateModelTemplate(rec, request)
			if mode == "create" {
				if rec.Code != 201 {
					t.Fatalf("create %d %s", rec.Code, rec.Body.String())
				}
			} else {
				if rec.Code != 403 {
					t.Fatalf("permissions %d %s", rec.Code, rec.Body.String())
				}
				for _, a := range dyn.Actions() {
					if a.GetResource() == templateMapsGVR {
						t.Fatalf("unauthorized storage access %#v", a)
					}
				}
			}
		})
	}
}

func TestTemplateRegistrationReconcilesConcurrentChanges(t *testing.T) {
	srv, _, swiss, h := newTemplateTestServer(t)
	swiss.changeOnRecheck = true
	swiss.onPut = func() {
		if swiss.puts == 1 {
			if _, err := srv.templateStore().Create(t.Context(), templateTestInput("concurrent"), "other"); err != nil {
				t.Error(err)
			}
		}
	}
	rec := do(h, "POST", "/api/model-templates", "", templateBody("first"))
	if rec.Code != 201 {
		t.Fatalf("reconcile %d %s", rec.Code, rec.Body.String())
	}
	result := decodeTemplateResult(t, rec)
	if result["registeredGeneration"] != float64(2) || !strings.Contains(swiss.profile, "# concurrent administrator edit") || !strings.Contains(swiss.profile, "/g/2/index.json") {
		t.Fatalf("reconcile=%v profile=%s", result, swiss.profile)
	}
}

func TestTemplateRegistrationRejectsRedirectsAndLargeResponses(t *testing.T) {
	for _, mode := range []string{"redirect", "oversized"} {
		t.Run(mode, func(t *testing.T) {
			followed := false
			target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				followed = true
				http.Error(w, "private target body", 500)
			}))
			defer target.Close()
			_, _, swiss, h := newTemplateTestServer(t)
			if mode == "redirect" {
				swiss.redirect = target.URL
			} else {
				swiss.oversized = true
			}
			rec := do(h, "POST", "/api/model-templates", "", templateBody("first"))
			if rec.Code != 202 || followed || strings.Contains(rec.Body.String(), "private") {
				t.Fatalf("upstream %d %s followed=%v", rec.Code, rec.Body.String(), followed)
			}
		})
	}
}

func TestTemplateCatalogListenerBoundary(t *testing.T) {
	srv, dyn, _, h := newTemplateTestServer(t)
	if rec := do(h, "POST", "/api/model-templates", "", templateBody("first")); rec.Code != 201 {
		t.Fatal(rec.Body.String())
	}
	srv.cfg.Server.Auth.Disabled = false
	srv.SetWeb(fstest.MapFS{"index.html": &fstest.MapFile{Data: []byte("<html>Console</html>")}})
	h = srv.Handler()
	catalog := srv.TemplateCatalogHandler()
	for _, path := range []string{"/catalog/console", "/catalog/console/", "/catalog/console/g/1/index.json", "/catalog/console/g/1/models/first/first-1.0.0.yaml"} {
		for _, method := range []string{"GET", "HEAD"} {
			if rec := do(h, method, path, "", ""); rec.Code != 404 {
				t.Fatalf("web listener exposed %s %s: %d", method, path, rec.Code)
			}
		}
	}
	if rec := do(catalog, "GET", "/catalog/console/g/1/index.json", "", ""); rec.Code != 200 || !strings.Contains(rec.Body.String(), "first") {
		t.Fatalf("internal catalog %d %s", rec.Code, rec.Body.String())
	}
	if rec := do(catalog, "HEAD", "/catalog/console/g/1/models/first/first-1.0.0.yaml", "", ""); rec.Code != 200 || rec.Body.Len() != 0 {
		t.Fatalf("internal HEAD %d %s", rec.Code, rec.Body.String())
	}
	before := len(dyn.Actions())
	for _, request := range []struct{ method, path string }{{"GET", "/api/model-templates"}, {"POST", "/api/model-templates"}, {"POST", "/api/model-templates/check"}, {"POST", "/api/model-templates/publish"}, {"POST", "/oauth/token"}, {"GET", "/metrics"}, {"GET", "/healthz"}, {"POST", "/catalog/console/g/1/index.json"}} {
		if rec := do(catalog, request.method, request.path, "", templateBody("other")); rec.Code != 404 {
			t.Fatalf("catalog listener exposed %s %s: %d", request.method, request.path, rec.Code)
		}
	}
	if len(dyn.Actions()) != before {
		t.Fatal("noncatalog requests accessed template storage")
	}
	srv.cfg.ModelTemplates.Enabled = false
	if rec := do(catalog, "GET", "/catalog/console/g/1/index.json", "", ""); rec.Code != 404 || len(dyn.Actions()) != before {
		t.Fatal("disabled catalog listener read storage")
	}
}

func TestModelTemplateAuthenticationAndPublicBounds(t *testing.T) {
	cfg := &config.Config{ModelTemplates: config.ModelTemplates{Enabled: true, Namespace: "console-ns", ConfigMap: "templates", PublishURL: "http://console/catalog/console"}}
	srv := testServerWithConfig(t, cfg)
	h := srv.Handler()
	if rec := do(h, "POST", "/api/model-templates", "", templateBody("first")); rec.Code != 401 || rec.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("auth=%d", rec.Code)
	}
	setRequirePasswordReset(t, srv, true)
	token := login(t, h, "admin", "admin-pw")
	if rec := do(h, "POST", "/api/model-templates", token, templateBody("first")); rec.Code != 403 {
		t.Fatalf("password reset=%d", rec.Code)
	}
	if rec := do(srv.TemplateCatalogHandler(), "GET", "/catalog/console/g/0/index.json", "", ""); rec.Code != 200 {
		t.Fatalf("anonymous static read=%d %s", rec.Code, rec.Body.String())
	}
	for _, path := range []string{"/catalog/console/g/-1/index.json", "/catalog/console/g/01/index.json", "/catalog/console/g/1001/index.json", "/catalog/console/g/0/anything", "/catalog/console/g/0/models/first/not-a-version.yaml"} {
		if rec := do(srv.TemplateCatalogHandler(), "GET", path, "", ""); rec.Code != 404 {
			t.Fatalf("path %s status=%d", path, rec.Code)
		}
	}
}
