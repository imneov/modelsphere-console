package server

import (
	"errors"
	"slices"
	"testing"

	"github.com/modelsphere/console/internal/router"
)

func TestCatalogRoutesForKeepsPreferenceAndSkipsSilentRoutes(t *testing.T) {
	c := &catalog{
		route: map[string]string{"qwen": "aggregate"},
		routes: []routeModels{
			{Route: "aggregate", Models: []string{"qwen"}},
			{Route: "silent", Error: "timeout"},
			{Route: "qwen-b", Models: []string{"qwen"}},
			{Route: "kimi", Models: []string{"kimi"}},
			{Route: "qwen-b", Models: []string{"qwen"}},
		},
	}
	target := &backendTarget{routes: []string{"aggregate", "silent", "qwen-b", "kimi"}}
	routes, err := c.routesFor("qwen", target)
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{"aggregate", "qwen-b"}; !slices.Equal(routes, want) {
		t.Fatalf("routes: %v want %v", routes, want)
	}
	if _, err := c.routesFor("missing", target); !errors.Is(err, router.ErrUnknownModel) {
		t.Fatalf("unknown model: %v", err)
	}
	if _, err := c.routesFor("", target); !errors.Is(err, router.ErrNoModel) {
		t.Fatalf("no model: %v", err)
	}
	if routes, err := c.routesFor("", &backendTarget{routes: []string{"only"}}); err != nil || !slices.Equal(routes, []string{"only"}) {
		t.Fatalf("single route: %v %v", routes, err)
	}
}
