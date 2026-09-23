// Package web embeds the built SPA. `go build` works without a frontend build:
// dist ships with a placeholder index.html, and consoled serves the API
// regardless. A real build overwrites dist before packaging.
package web

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var dist embed.FS

// FS returns the built SPA, or nil when only the placeholder is present.
func FS() fs.FS {
	sub, err := fs.Sub(dist, "dist")
	if err != nil {
		return nil
	}
	return sub
}
