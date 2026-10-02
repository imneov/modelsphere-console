# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). The version is the
chart's `appVersion`; the image and chart are released together under it.

## [Unreleased]

### Added
- Apache-2.0 `LICENSE` and a `NOTICE` listing third-party components, including the vendored `@riseaicloud/ui` and `@riseaicloud/tokens`.
- CI on every pull request: `go vet`/`go test`, web typecheck and tests, and a gate for the license text and committed credentials.
- Dependabot for Go modules, npm, GitHub Actions and the Dockerfile.
- English install guide for the chart; the Chinese one is kept as `helm/console/README.zh-CN.md`.
- Contributor guide, issue and PR templates, security policy (#12).

### Changed
- The first password change may keep the current password, with a warning (#11).
- The swiss subchart dependency points at a published swiss chart, pinned to a stable version (#17, #18).
- Deployment status and detail pages reworked (#16).
- GitHub Actions in `publish.yml` pinned to commit SHAs.

### Fixed
- An empty Playground chat names the selected model (#13).

## [0.1.1] - 2026-10-01

First tagged release.

### Added
- Identity: users, roles and login history as Kubernetes CRDs; OAuth2 password login with HS256 tokens; RBAC-style roles that gate pages and APIs; password policy and a forced change on first login; login audit records.
- Module shell with a backend proxy, per-backend RBAC and the Rise Global look.
- Model deployment (模型部署) over swissd, from the swiss UI mounted as a module.
- Playground: streaming chat, a 2–4 column compare view, full sampling parameters, TTFT, tokens/s and cache hit rate, reasoning output, Markdown, and "view code" for cURL, Python and Node.js.
- OpenAI-compatible `/v1` router with administrator-issued API keys (expiry, optional per-model scope, stored hashed) and usage as Prometheus metrics.
- Gateway discovery from the swiss site profile or the route ConfigMap, including one model list across autoconfig's per-model routes.
- One-command Helm install, with a built-in gateway and an optional CPU demo model; image and chart published to GHCR at one version.

[Unreleased]: https://github.com/modelsphere/console/compare/0.1.1...HEAD
[0.1.1]: https://github.com/modelsphere/console/releases/tag/0.1.1
