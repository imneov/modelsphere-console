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

Identity (P1–P3) and the module shell with backend federation (P4). See
`docs/console-design.md` for the plan.

## Deploy

Two commands. The first builds and pushes the image for the current commit and
writes the values file that pins it; the second installs, and is also what every
later upgrade runs — unchanged:

```sh
# 1. build + push consoled:<chart version>-dev.<commit>, then write console-image.yaml
CONSOLE_REGISTRY=<registry>/<org> hack/image.sh

# 2. install; re-run the same line to upgrade
helm upgrade --install console ./helm/console -n console --create-namespace \
  -f console-image.yaml
```

The tag carries the commit, so an upgrade always changes the pod template and
rolls: a fixed tag would leave helm with nothing to do and every pod on the old
image. `hack/image.sh --no-push` builds only, and `CONSOLE_REGISTRY` defaults to
the repository in `helm/console/values.yaml`.

The chart logs in on the default `admin` / `P@88w0rd` unless the cluster already
has that user (Rise Global's, say), in which case it is left alone and `NOTES`
says so.

Reach the UI, ClusterIP by default:

```sh
kubectl -n console port-forward svc/console-console 8080:8080   # then http://localhost:8080/
```

## Build

```sh
go build ./...
go build -o consoled ./cmd/consoled
./consoled --config ./console.yaml
```

`go build` works without a frontend build: `web/dist` ships a placeholder and
consoled serves the API regardless.
