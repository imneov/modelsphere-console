// Package version holds the build version, set by -ldflags at build time.
package version

// Version is overwritten via -ldflags "-X .../version.Version=...".
var Version = "dev"
