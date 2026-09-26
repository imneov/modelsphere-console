// Package config is console's one configuration document.
//
// console is the community portal's BFF: it owns identity (users, roles,
// login) and federates every other capability to backends like swissd. The
// config therefore has three sections -- how to reach Kubernetes (where users
// and roles live as CRDs), how to sign and verify tokens, and which backends
// to proxy.
package config

import (
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Cluster  Cluster   `yaml:"cluster,omitempty"`
	Server   Server    `yaml:"server,omitempty"`
	Backends []Backend `yaml:"backends,omitempty"`

	Origin string `yaml:"-"`
}

// Cluster is where the iam CRDs (User/Role/RoleBinding) are read and written.
// Empty kubeconfig means in-cluster, which is the normal deployment.
type Cluster struct {
	Kubeconfig string `yaml:"kubeconfig,omitempty"`
	Context    string `yaml:"context,omitempty"`
}

type Server struct {
	Addr string `yaml:"addr,omitempty"`
	Auth Auth   `yaml:"auth,omitempty"`
}

// Auth signs and verifies the HS256 tokens. The claim set and algorithm are
// kept identical to Rise Global so a later cutover is just sharing this secret
// and pointing at Global's apiserver.
type Auth struct {
	// JWTSecret is the HS256 signing key, shared with Global on upgrade.
	JWTSecret string `yaml:"jwtSecret,omitempty"`
	// Issuer is the token `iss` claim; also the OIDC issuer URL.
	Issuer string `yaml:"issuer,omitempty"`
	// TokenTTL bounds an access token's life.
	TokenTTL time.Duration `yaml:"tokenTTL,omitempty"`
}

// Backend is one federated service console reverse-proxies to. Prefix is
// replaced by URL's path: with prefix /api/deploy and url http://swissd/api,
// /api/deploy/catalog reaches http://swissd/api/catalog. Name is the RBAC
// resourceName under resource "backends".
type Backend struct {
	Name   string `yaml:"name"`
	Prefix string `yaml:"prefix"`
	URL    string `yaml:"url"`
	// APIKeyEnv is the environment variable holding a credential console sends
	// to this backend on every request, as `Authorization: Bearer <value>`,
	// replacing the caller's token. It is how a backend authenticates the portal
	// instead of the browser: an inference gateway's key stays server-side and
	// never becomes part of what the SPA can read. llm-openresty accepts only
	// this form (lua/api_keys.parse_bearer).
	//
	// Empty means the caller's token is forwarded unchanged, which is what a
	// backend that verifies the JWT itself (swissd) wants.
	APIKeyEnv string `yaml:"apiKeyEnv,omitempty"`
}

// APIKey is the backend's own credential, read from the environment. Empty when
// the backend names none, or when the variable is unset.
func (b Backend) APIKey() string {
	if b.APIKeyEnv == "" {
		return ""
	}
	return os.Getenv(b.APIKeyEnv)
}

func Load(path string) (*Config, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var c Config
	dec := yaml.NewDecoder(strings.NewReader(string(raw)))
	dec.KnownFields(true) // an unknown key is a typo, not a setting that does nothing
	if err := dec.Decode(&c); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	c.Origin = path
	c.applyDefaults()
	return &c, nil
}

// Find locates a config without requiring one: an explicit path, then
// CONSOLE_CONFIG, then ./console.yaml, then ~/.config/console/console.yaml.
func Find(explicit string) string {
	if explicit != "" {
		return explicit
	}
	if v := os.Getenv("CONSOLE_CONFIG"); v != "" {
		return v
	}
	candidates := []string{"console.yaml"}
	if home, err := os.UserHomeDir(); err == nil {
		candidates = append(candidates, filepath.Join(home, ".config", "console", "console.yaml"))
	}
	for _, p := range candidates {
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			return p
		}
	}
	return ""
}

func (c *Config) applyDefaults() {
	if c.Server.Addr == "" {
		c.Server.Addr = ":8080"
	}
	if c.Server.Auth.TokenTTL == 0 {
		c.Server.Auth.TokenTTL = 24 * time.Hour
	}
	if c.Server.Auth.Issuer == "" {
		c.Server.Auth.Issuer = "https://console.modelsphere.local"
	}
}

func (c *Config) origin() string {
	if c.Origin == "" {
		return "config"
	}
	return c.Origin
}

// Validate covers what console needs to serve.
func (c *Config) Validate() error {
	if c.Server.Auth.JWTSecret == "" {
		return fmt.Errorf("%s: server.auth.jwtSecret is required -- it signs every token", c.origin())
	}
	names, prefixes := map[string]bool{}, map[string]bool{}
	for i, b := range c.Backends {
		if b.Name == "" || b.Prefix == "" || b.URL == "" {
			return fmt.Errorf("%s: backends[%d] needs name, prefix and url", c.origin(), i)
		}
		if err := validateBackend(b); err != nil {
			return fmt.Errorf("%s: backends[%d] (%s): %w", c.origin(), i, b.Name, err)
		}
		if names[b.Name] || prefixes[b.Prefix] {
			return fmt.Errorf("%s: backends[%d] (%s): duplicate name or prefix", c.origin(), i, b.Name)
		}
		names[b.Name], prefixes[b.Prefix] = true, true
	}
	return nil
}

// reservedPrefixes are console's own API; a backend there would shadow them.
var reservedPrefixes = []string{"/api/iam", "/api/me"}

func validateBackend(b Backend) error {
	// Only /api/* passes the auth middleware's guard; anything else is served
	// to anonymous callers as an SPA route.
	if !strings.HasPrefix(b.Prefix, "/api/") || len(b.Prefix) == len("/api/") {
		return fmt.Errorf("prefix %q must be a path under /api/", b.Prefix)
	}
	if strings.HasSuffix(b.Prefix, "/") {
		return fmt.Errorf("prefix %q must not have a trailing slash", b.Prefix)
	}
	for _, r := range reservedPrefixes {
		if b.Prefix == r || strings.HasPrefix(b.Prefix, r+"/") {
			return fmt.Errorf("prefix %q is reserved by console", b.Prefix)
		}
	}
	u, err := url.Parse(b.URL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return fmt.Errorf("url %q must be an absolute http(s) URL", b.URL)
	}
	// A mistyped env name would silently send no credential, and the backend
	// would answer 401 for reasons nobody can see in the config.
	if b.APIKeyEnv != "" && !envNameRE.MatchString(b.APIKeyEnv) {
		return fmt.Errorf("apiKeyEnv %q is not an environment variable name", b.APIKeyEnv)
	}
	return nil
}

var envNameRE = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)
