# console

The ModelSphere community portal. A full-stack BFF: it owns identity (users,
roles, login) and federates everything else to backends like
[swiss](https://github.com/modelsphere/swiss).

```
browser ─▶ web (shell + modules) ─▶ consoled (Go BFF)
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
share the JWT secret and point consoled's identity endpoints at Global's
apiserver -- not a data migration.

## Status

Scaffolding (P0). See `docs/console-design.md` for the plan and phases.

## Build

```sh
go build ./...
go build -o consoled ./cmd/consoled
./consoled --config ./console.yaml
```

`go build` works without a frontend build: `web/dist` ships a placeholder and
consoled serves the API regardless.
