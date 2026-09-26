package config

import (
	"strings"
	"testing"
)

func TestValidateBackends(t *testing.T) {
	ok := Backend{Name: "swiss", Prefix: "/api/deploy", URL: "http://swissd.swiss.svc:8080/api"}
	cases := []struct {
		name    string
		backend []Backend
		wantErr string
	}{
		{"valid", []Backend{ok}, ""},
		{"missing url", []Backend{{Name: "swiss", Prefix: "/api/deploy"}}, "needs url, or a gateway"},
		{"missing name", []Backend{{Prefix: "/api/deploy", URL: ok.URL}}, "needs name and prefix"},
		{"missing prefix", []Backend{{Name: "swiss", URL: ok.URL}}, "needs name and prefix"},
		// Outside /api/ the auth middleware treats the path as a public SPA route.
		{"prefix outside /api", []Backend{{Name: "swiss", Prefix: "/deploy", URL: ok.URL}}, "under /api/"},
		{"prefix is /api itself", []Backend{{Name: "swiss", Prefix: "/api", URL: ok.URL}}, "under /api/"},
		{"prefix shadows iam", []Backend{{Name: "x", Prefix: "/api/iam", URL: ok.URL}}, "reserved"},
		{"prefix shadows me", []Backend{{Name: "x", Prefix: "/api/me", URL: ok.URL}}, "reserved"},
		{"trailing slash", []Backend{{Name: "swiss", Prefix: "/api/deploy/", URL: ok.URL}}, "trailing"},
		{"relative url", []Backend{{Name: "swiss", Prefix: "/api/deploy", URL: "swissd:8080"}}, "absolute http"},
		{"duplicate prefix", []Backend{ok, {Name: "other", Prefix: "/api/deploy", URL: ok.URL}}, "duplicate"},
		{"duplicate name", []Backend{ok, {Name: "swiss", Prefix: "/api/other", URL: ok.URL}}, "duplicate"},
		{
			"backend with a credential of its own",
			[]Backend{{Name: "llm", Prefix: "/api/llm", URL: "http://gw.svc:8080/llm", APIKeyEnv: "CONSOLE_LLM_API_KEY"}},
			"",
		},
		// A mistyped name sends no credential, and the backend then answers 401
		// for a reason the config never states.
		{
			"env name is not a name",
			[]Backend{{Name: "llm", Prefix: "/api/llm", URL: "http://gw.svc:8080/llm", APIKeyEnv: "llm-api-key"}},
			"not an environment variable name",
		},
		{
			"gateway backend reads the site profile",
			[]Backend{{Name: "llm", Prefix: "/api/llm", Gateway: &Gateway{Profile: "llm/site-profile"}}},
			"",
		},
		{
			"gateway backend names the route configmap and service directly",
			[]Backend{{Name: "llm", Prefix: "/api/llm", Gateway: &Gateway{ConfigMap: "llm/openresty-conf", Service: "llm/openresty"}}},
			"",
		},
		{
			"both url and gateway",
			[]Backend{{Name: "llm", Prefix: "/api/llm", URL: "http://gw.svc:8080/llm", Gateway: &Gateway{Profile: "llm/site-profile"}}},
			"exactly one says where the backend is",
		},
		{
			"gateway without a source",
			[]Backend{{Name: "llm", Prefix: "/api/llm", Gateway: &Gateway{Service: "llm/openresty"}}},
			"needs profile or configMap",
		},
		{
			"gateway with both sources",
			[]Backend{{Name: "llm", Prefix: "/api/llm", Gateway: &Gateway{Profile: "llm/site-profile", ConfigMap: "llm/openresty-conf"}}},
			"both profile and configMap",
		},
		// A bare name cannot be looked up: nothing says which namespace.
		{
			"gateway profile without a namespace",
			[]Backend{{Name: "llm", Prefix: "/api/llm", Gateway: &Gateway{Profile: "site-profile"}}},
			"must be namespace/name",
		},
		{
			"gateway with no service and no profile to read one from",
			[]Backend{{Name: "llm", Prefix: "/api/llm", Gateway: &Gateway{ConfigMap: "llm/openresty-conf"}}},
			"gateway.service is required",
		},
		{
			"gateway port out of range",
			[]Backend{{Name: "llm", Prefix: "/api/llm", Gateway: &Gateway{Profile: "llm/site-profile", Port: 70000}}},
			"not a port",
		},
		// The key Secret is the one reference a bare name may be used for: it
		// means the entrypoint's own namespace.
		{
			"gateway secretref may be bare",
			[]Backend{{Name: "llm", Prefix: "/api/llm", Gateway: &Gateway{Profile: "llm/site-profile", SecretRef: "openresty"}}},
			"",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c := &Config{Server: Server{Auth: Auth{JWTSecret: "s"}}, Backends: tc.backend}
			err := c.Validate()
			switch {
			case tc.wantErr == "" && err != nil:
				t.Fatalf("unexpected error: %v", err)
			case tc.wantErr != "" && (err == nil || !strings.Contains(err.Error(), tc.wantErr)):
				t.Fatalf("want error containing %q, got %v", tc.wantErr, err)
			}
		})
	}
}

func TestBackendAPIKey(t *testing.T) {
	t.Setenv("CONSOLE_TEST_GATEWAY_KEY", "gw-secret")
	base := Backend{Name: "llm", Prefix: "/api/llm", URL: "http://gw.svc:8080/llm"}

	withKey := base
	withKey.APIKeyEnv = "CONSOLE_TEST_GATEWAY_KEY"
	if got := withKey.APIKey(); got != "gw-secret" {
		t.Fatalf("APIKey() = %q, want the variable's value", got)
	}

	unset := base
	unset.APIKeyEnv = "CONSOLE_TEST_GATEWAY_KEY_UNSET"
	if got := unset.APIKey(); got != "" {
		t.Fatalf("APIKey() = %q for an unset variable, want empty", got)
	}
	if got := base.APIKey(); got != "" {
		t.Fatalf("APIKey() = %q for a backend naming none, want empty", got)
	}
}
