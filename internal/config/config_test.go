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
		{"missing field", []Backend{{Name: "swiss", Prefix: "/api/deploy"}}, "needs name, prefix and url"},
		// Outside /api/ the auth middleware treats the path as a public SPA route.
		{"prefix outside /api", []Backend{{Name: "swiss", Prefix: "/deploy", URL: ok.URL}}, "under /api/"},
		{"prefix is /api itself", []Backend{{Name: "swiss", Prefix: "/api", URL: ok.URL}}, "under /api/"},
		{"prefix shadows iam", []Backend{{Name: "x", Prefix: "/api/iam", URL: ok.URL}}, "reserved"},
		{"prefix shadows me", []Backend{{Name: "x", Prefix: "/api/me", URL: ok.URL}}, "reserved"},
		{"trailing slash", []Backend{{Name: "swiss", Prefix: "/api/deploy/", URL: ok.URL}}, "trailing"},
		{"relative url", []Backend{{Name: "swiss", Prefix: "/api/deploy", URL: "swissd:8080"}}, "absolute http"},
		{"duplicate prefix", []Backend{ok, {Name: "other", Prefix: "/api/deploy", URL: ok.URL}}, "duplicate"},
		{"duplicate name", []Backend{ok, {Name: "swiss", Prefix: "/api/other", URL: ok.URL}}, "duplicate"},
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
