# console

The ModelSphere community portal. A full-stack BFF: it owns identity (users,
roles, login) and federates everything else to backends like
[swiss](https://github.com/modelsphere/swiss).

```
browser ─▶ web (shell + modules) ─▶ console (Go BFF)
                                         identity: iam CRDs + OAuth2 (HS256)
                                         + global-scope RBAC + reverse proxy
                                                        │ HTTP (Bearer JWT)
                                            ┌───────────┴───────────┐
                                            ▼                        ▼
                                        swissd                  other backends
                                      deploy / catalog          (router, operator…)
```

Identity is kept **wire-compatible with Rise Global**: the same
`iam.theriseunion.io/v1alpha1` User/Role/RoleBinding CRDs and the same HS256
token claims. Upgrading a community install to Global is then a config change --
share the JWT secret and point console's identity endpoints at Global's
apiserver -- not a data migration.

## Status

Identity (P1–P3), the module shell with backend federation (P4), the swiss
module (P5) and the Playground and the router -- `/v1` with API keys (P6). See `docs/console-design.md` for the plan.

## Quick start

Install with the Helm chart built for every commit. The [chart guide](helm/console/README.md) is the only install reference: prerequisites, the standalone and existing-Swiss modes, commands, and uninstall. Start at its [快速上手](helm/console/README.md#快速上手) (quick start) section.

## Build

```sh
go build ./...
go build -o console ./cmd/console
./console --config ./console.yaml
CONSOLE_REGISTRY=<registry>/<org> hack/image.sh   # build and push a dev image; --no-push builds only
```

`go build` works without a frontend build: `web/dist` ships a placeholder and console serves the API regardless. Chart packaging and publishing are covered in the [chart guide](helm/console/README.md).
