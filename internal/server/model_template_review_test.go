package server

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/modelsphere/console/internal/iam"
	"gopkg.in/yaml.v3"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	k8stesting "k8s.io/client-go/testing"
)

func TestTemplatePublicationPreservesLocalDefaultAndCatalogNode(t *testing.T) {
	srv, _, swiss, h := newTemplateTestServer(t)
	if rec := do(h, "POST", "/api/model-templates", "", templateBody("first")); rec.Code != 201 {
		t.Fatal(rec.Body.String())
	}
	swiss.mu.Lock()
	var profile yaml.Node
	if err := yaml.Unmarshal([]byte(swiss.profile), &profile); err != nil {
		swiss.mu.Unlock()
		t.Fatal(err)
	}
	own, err := srv.templateProfileEntry(&profile)
	if err != nil {
		swiss.mu.Unlock()
		t.Fatal(err)
	}
	entries := yamlField(profile.Content[0], "catalogs")
	for _, entry := range entries.Content {
		value := &yaml.Node{}
		_ = value.Encode(entry == own)
		setYAMLField(entry, "default", value)
	}
	own.HeadComment = "operator selected this catalog"
	location := yamlField(own, "url")
	location.LineComment = "keep URL comment"
	location.Style = yaml.DoubleQuotedStyle
	setYAMLField(own, "futureOption", &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: "retained"})
	raw, err := yaml.Marshal(&profile)
	if err != nil {
		swiss.mu.Unlock()
		t.Fatal(err)
	}
	swiss.profile = string(raw)
	swiss.mu.Unlock()
	assertCatalog := func(generation int64) {
		t.Helper()
		swiss.mu.Lock()
		raw := swiss.profile
		swiss.mu.Unlock()
		var doc yaml.Node
		if err := yaml.Unmarshal([]byte(raw), &doc); err != nil {
			t.Fatal(err)
		}
		entry, err := srv.templateProfileEntry(&doc)
		if err != nil {
			t.Fatal(err)
		}
		if entry == nil || yamlField(entry, "default").Value != "true" || yamlField(entry, "futureOption").Value != "retained" || !strings.Contains(raw, "operator selected this catalog") || !strings.Contains(raw, "keep URL comment") {
			t.Fatalf("local preference/fields/comments lost: %s", raw)
		}
		location := yamlField(entry, "url")
		if location.Value != srv.templateCatalogURL(generation) || location.Style != yaml.DoubleQuotedStyle {
			t.Fatalf("URL not updated in place: %s", raw)
		}
		for _, other := range yamlField(doc.Content[0], "catalogs").Content {
			if other != entry && yamlField(other, "default").Value != "false" {
				t.Fatalf("original default unexpectedly changed: %s", raw)
			}
		}
	}
	if rec := do(h, "POST", "/api/model-templates", "", templateBody("second")); rec.Code != 201 {
		t.Fatalf("second create %d %s", rec.Code, rec.Body.String())
	}
	assertCatalog(2)
	swiss.mu.Lock()
	swiss.unavailable = true
	swiss.mu.Unlock()
	if rec := do(h, "POST", "/api/model-templates", "", templateBody("third")); rec.Code != 202 {
		t.Fatalf("pending create %d %s", rec.Code, rec.Body.String())
	}
	swiss.mu.Lock()
	swiss.unavailable = false
	swiss.mu.Unlock()
	if rec := do(h, "POST", "/api/model-templates/publish", "", "{}"); rec.Code != 200 {
		t.Fatalf("retry %d %s", rec.Code, rec.Body.String())
	}
	assertCatalog(3)
}

func templateReviewRequest(t *testing.T) *http.Request {
	t.Helper()
	r := httptest.NewRequest("GET", "/api/model-templates", nil)
	return r.WithContext(withIdentity(t.Context(), &iam.Identity{Name: "admin", Groups: []string{"system:masters"}}))
}
func templateReviewLog(srv *Server) *bytes.Buffer {
	buf := &bytes.Buffer{}
	srv.log = slog.New(slog.NewJSONHandler(buf, nil))
	return buf
}
func assertTemplateDiagnosticsSafe(t *testing.T, srv *Server, err error, reason string, private ...string) templateRegistrationDiagnostic {
	t.Helper()
	buf := templateReviewLog(srv)
	if got := srv.reportTemplateFailure(t.Context(), err); got != reason {
		t.Fatalf("reason=%s want=%s", got, reason)
	}
	if err.Error() != reason && reason != "registration_failed" {
		t.Fatalf("error string is not a safe reason: %s", err.Error())
	}
	for _, secret := range private {
		if strings.Contains(buf.String(), secret) {
			t.Fatalf("private error context leaked to diagnostics: %s", buf.String())
		}
	}
	var line map[string]any
	if json.Unmarshal(buf.Bytes(), &line) != nil || line["reason"] != reason || line["cause_type"] == nil || line["operation"] == nil {
		t.Fatalf("missing safe diagnostics: %s", buf.String())
	}
	return templateFailureDiagnostic(err)
}

func TestTemplateRegistrationRetainsNetworkCauseSafely(t *testing.T) {
	srv, _, _, _ := newTemplateTestServer(t)
	cause := &net.DNSError{Err: "private lookup details", Name: "private-template.example", IsTimeout: true}
	srv.targets["swiss"] = func(context.Context) (*backendTarget, error) { return nil, cause }
	_, err := srv.templateRequest(t.Context(), templateReviewRequest(t), "GET", "profile", nil)
	if !errors.Is(err, cause) {
		t.Fatal("network resolver cause was discarded")
	}
	var network *net.DNSError
	if !errors.As(err, &network) {
		t.Fatal("network error type was discarded")
	}
	diagnostic := assertTemplateDiagnosticsSafe(t, srv, err, "backend_unavailable", cause.Name, cause.Err)
	if !diagnostic.timeout || diagnostic.operation != "backend_resolve" {
		t.Fatalf("network diagnostics=%+v", diagnostic)
	}
}

func TestTemplateRegistrationRetainsJSONAndYAMLParseCauses(t *testing.T) {
	t.Run("JSON", func(t *testing.T) {
		srv, _, _, _ := newTemplateTestServer(t)
		upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = io.WriteString(w, `{"private-body-value":`) }))
		defer upstream.Close()
		target, _ := url.Parse(upstream.URL + "/api")
		target.User = url.UserPassword("private-user", "private-password")
		srv.targets["swiss"] = func(context.Context) (*backendTarget, error) {
			return &backendTarget{url: *target, header: "Authorization", key: "Bearer private-backend-token"}, nil
		}
		_, err := srv.templateRequest(t.Context(), templateReviewRequest(t), "GET", "profile", nil)
		var syntax *json.SyntaxError
		if !errors.As(err, &syntax) {
			t.Fatalf("JSON cause lost: %T", errors.Unwrap(err))
		}
		assertTemplateDiagnosticsSafe(t, srv, err, "backend_response_invalid", upstream.URL, "private-user", "private-password", "private-backend-token", "private-body-value")
	})
	t.Run("YAML", func(t *testing.T) {
		srv, _, swiss, _ := newTemplateTestServer(t)
		swiss.mu.Lock()
		swiss.profile = originalTemplateProfile + "name: private-profile-value\n"
		swiss.mu.Unlock()
		_, _, err := srv.templateProfile(t.Context(), templateReviewRequest(t))
		var parse *yaml.TypeError
		if !errors.As(err, &parse) {
			t.Fatalf("YAML cause lost: %T", errors.Unwrap(err))
		}
		assertTemplateDiagnosticsSafe(t, srv, err, "profile_invalid", "private-profile-value", originalTemplateProfile)
	})
}

func TestTemplateRegistrationHTTPStatusDiagnosticsAndPublicMapping(t *testing.T) {
	srv, _, swiss, h := newTemplateTestServer(t)
	swiss.mu.Lock()
	swiss.unavailable = true
	swiss.mu.Unlock()
	_, err := srv.templateRequest(t.Context(), templateReviewRequest(t), "GET", "profile", nil)
	var status *templateHTTPStatusError
	if !errors.As(err, &status) || status.status != 503 {
		t.Fatal("HTTP status context was discarded")
	}
	diagnostic := assertTemplateDiagnosticsSafe(t, srv, err, "backend_rejected", "upstream secret values")
	if diagnostic.status != 503 || diagnostic.timeout {
		t.Fatalf("HTTP diagnostics=%+v", diagnostic)
	}
	buf := templateReviewLog(srv)
	rec := do(h, "POST", "/api/model-templates", "", templateBody("first"))
	result := decodeTemplateResult(t, rec)
	if rec.Code != 202 || result["reason"] != "backend_rejected" || result["created"] != true {
		t.Fatalf("public mapping %d %s", rec.Code, rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), "upstream secret values") || strings.Contains(buf.String(), "upstream secret values") {
		t.Fatal("upstream error body leaked")
	}
}

func TestTemplatePublicationRetainsTimeoutAndStorageCauses(t *testing.T) {
	t.Run("publication timeout", func(t *testing.T) {
		srv, _, _, _ := newTemplateTestServer(t)
		srv.templatePublishGate <- struct{}{}
		defer func() { <-srv.templatePublishGate }()
		ctx, cancel := context.WithDeadline(t.Context(), time.Now().Add(-time.Second))
		defer cancel()
		_, err := srv.publishTemplates(ctx, templateReviewRequest(t))
		if !errors.Is(err, context.DeadlineExceeded) {
			t.Fatal("publication cancellation cause lost")
		}
		if !assertTemplateDiagnosticsSafe(t, srv, err, "registration_timeout").timeout {
			t.Fatal("publication timeout not diagnosed")
		}
	})
	t.Run("cluster status", func(t *testing.T) {
		srv, dyn, _, _ := newTemplateTestServer(t)
		cause := apierrors.NewForbidden(schema.GroupResource{Resource: "configmaps"}, "templates", errors.New("private cluster denial"))
		dyn.PrependReactor("get", "configmaps", func(k8stesting.Action) (bool, runtime.Object, error) { return true, nil, cause })
		_, err := srv.publishTemplates(t.Context(), templateReviewRequest(t))
		if !errors.Is(err, cause) {
			t.Fatal("storage cause lost")
		}
		diagnostic := assertTemplateDiagnosticsSafe(t, srv, err, "storage_unavailable", "private cluster denial")
		if diagnostic.status != 403 || diagnostic.operation != "state_read" {
			t.Fatalf("cluster diagnostics=%+v", diagnostic)
		}
	})
}

func TestUnknownTemplateRegistrationErrorCannotBecomeWireText(t *testing.T) {
	srv, _, _, _ := newTemplateTestServer(t)
	assertTemplateDiagnosticsSafe(t, srv, errors.New("http://private-user:private-token@example/private-body"), "registration_failed", "private-user", "private-token", "private-body")
}
