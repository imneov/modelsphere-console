package config

import (
	"fmt"
	"net"
	"net/url"
	"regexp"
	"strconv"
	"strings"

	"k8s.io/apimachinery/pkg/util/validation"
)

var catalogNameRE = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]*$`)

type ModelTemplates struct {
	Enabled     bool   `yaml:"enabled,omitempty"`
	Namespace   string `yaml:"namespace,omitempty"`
	ConfigMap   string `yaml:"configMap,omitempty"`
	PublishURL  string `yaml:"publishURL,omitempty"`
	Backend     string `yaml:"backend,omitempty"`
	CatalogName string `yaml:"catalogName,omitempty"`
}

func (m ModelTemplates) WithDefaults() ModelTemplates {
	if m.Backend == "" {
		m.Backend = "swiss"
	}
	if m.CatalogName == "" {
		m.CatalogName = "console-local"
	}
	m.PublishURL = strings.TrimSuffix(m.PublishURL, "/")
	return m
}

const DefaultCatalogAddr = ":8081"

func (c *Config) CatalogListenAddr() string {
	if !c.ModelTemplates.Enabled {
		return "off"
	}
	if c.Server.CatalogAddr == "" {
		return DefaultCatalogAddr
	}
	return c.Server.CatalogAddr
}

func (c *Config) validateCatalogListener() error {
	addr := c.CatalogListenAddr()
	_, port, err := net.SplitHostPort(addr)
	number, parseErr := strconv.Atoi(port)
	if err != nil || parseErr != nil || number < 1 || number > 65535 {
		return fmt.Errorf("%s: enabled modelTemplates requires server.catalogAddr with a valid dedicated port", c.origin())
	}
	web := c.Server.Addr
	if web == "" {
		web = ":8080"
	}
	metrics := c.Server.MetricsAddr
	if metrics == "" {
		metrics = DefaultMetricsAddr
	}
	for _, other := range []string{web, metrics} {
		if other == "off" {
			continue
		}
		_, otherPort, err := net.SplitHostPort(other)
		otherNumber, otherErr := strconv.Atoi(otherPort)
		if err == nil && otherErr == nil && number == otherNumber {
			return fmt.Errorf("%s: server.catalogAddr must use a different port from web and metrics listeners", c.origin())
		}
	}
	return nil
}

func (c *Config) validateModelTemplates() error {
	m := c.ModelTemplates.WithDefaults()
	if !m.Enabled {
		return nil
	}
	if err := c.validateCatalogListener(); err != nil {
		return err
	}
	if m.Namespace == "" || len(validation.IsDNS1123Label(m.Namespace)) != 0 || m.ConfigMap == "" || len(validation.IsDNS1123Subdomain(m.ConfigMap)) != 0 {
		return fmt.Errorf("%s: modelTemplates needs an explicit valid namespace and configMap", c.origin())
	}
	if m.CatalogName == "" || len(m.CatalogName) > 63 || !catalogNameRE.MatchString(m.CatalogName) {
		return fmt.Errorf("%s: modelTemplates.catalogName is invalid", c.origin())
	}
	u, err := url.Parse(m.PublishURL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || u.User != nil || u.RawQuery != "" || u.ForceQuery || u.Fragment != "" || u.Path != "/catalog/console" || u.RawPath != "" {
		return fmt.Errorf("%s: modelTemplates.publishURL must be an absolute http(s) Console /catalog/console URL without credentials, query or fragment", c.origin())
	}
	for _, b := range c.Backends {
		if b.Name == m.Backend && b.Gateway == nil && b.URL != "" && b.Prefix == "/api/deploy" {
			return nil
		}
	}
	return fmt.Errorf("%s: modelTemplates.backend must name a static /api/deploy Swiss backend", c.origin())
}
