package config

import (
	"fmt"
	"net/url"
	"strings"
	"unicode"
)

type Higress struct {
	Enabled       bool     `yaml:"enabled,omitempty"`
	Models        []string `yaml:"models,omitempty"`
	Route         string   `yaml:"route,omitempty"`
	SessionOrigin string   `yaml:"sessionOrigin,omitempty"`
}

func (c *Config) validateHigress() error {
	if !c.Higress.Enabled {
		return nil
	}
	switch {
	case c.Server.Auth.Disabled:
		return fmt.Errorf("higress requires authentication")
	case !c.Router.Enabled() || c.Router.KeySource != "crd" || c.Router.Migration:
		return fmt.Errorf("higress requires CRD key authority, without an active key migration")
	case c.Billing.Enabled:
		return fmt.Errorf("higress paid traffic is not enabled: metering integration must pass acceptance first")
	case len(c.Higress.Models) == 0:
		return fmt.Errorf("higress.models must name the models served by this entrypoint")
	case !nameRE.MatchString(c.Higress.Route):
		return fmt.Errorf("higress.route must be a nonempty route name")
	case c.Router.Backend == "":
		return fmt.Errorf("higress requires router.backend for session authorization")
	}
	origin, err := url.Parse(c.Higress.SessionOrigin)
	if err != nil || origin.Host == "" || origin.User != nil || (origin.Scheme != "https" && origin.Scheme != "http") || c.Higress.SessionOrigin != origin.Scheme+"://"+origin.Host {
		return fmt.Errorf("higress.sessionOrigin must be an exact http(s) origin without a path")
	}
	seen := map[string]bool{}
	for _, model := range c.Higress.Models {
		if model == "" || strings.IndexFunc(model, unicode.IsControl) >= 0 || strings.TrimSpace(model) != model || seen[model] {
			return fmt.Errorf("higress.models must contain distinct, nonempty model names without control characters")
		}
		seen[model] = true
	}
	return nil
}
