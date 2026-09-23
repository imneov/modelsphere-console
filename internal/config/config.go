// Package config is consoled's one configuration document.
//
// consoled is the community portal's BFF: it owns identity (users, roles,
// login) and federates every other capability to backends like swissd. The
// config therefore has three sections -- how to reach Kubernetes (where users
// and roles live as CRDs), how to sign and verify tokens, and which backends
// to proxy.
package config

import (
	"fmt"
	"os"
	"path/filepath"
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

// Backend is one federated service consoled reverse-proxies to. Requests under
// Prefix are forwarded to URL carrying the caller's token.
type Backend struct {
	Name   string `yaml:"name"`
	Prefix string `yaml:"prefix"`
	URL    string `yaml:"url"`
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

// Validate covers what consoled needs to serve.
func (c *Config) Validate() error {
	if c.Server.Auth.JWTSecret == "" {
		return fmt.Errorf("%s: server.auth.jwtSecret is required -- it signs every token", c.origin())
	}
	for i, b := range c.Backends {
		if b.Name == "" || b.Prefix == "" || b.URL == "" {
			return fmt.Errorf("%s: backends[%d] needs name, prefix and url", c.origin(), i)
		}
	}
	return nil
}
