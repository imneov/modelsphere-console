# Local development

From a fresh clone to console running on your machine against a cluster, with the UI hot-reloading.

```
toolchain ──▶ dev cluster (CRDs + admin) ──▶ console.yaml ──▶ go run ──▶ npm run dev ──▶ http://localhost:5173
                                                                │
                                         backends need cluster DNS? ──▶ telepresence connect
```

## Toolchain

| Tool | Version | For |
|---|---|---|
| Git | any recent | |
| Go | 1.26 (`go.mod`) | the server |
| Node.js | 24 (the `Dockerfile`'s web stage) | the UI |
| kubectl, Helm | Helm 3.8+ or 4 | a dev cluster, the chart |
| Docker | optional | images (`hack/image.sh`), a [kind](https://kind.sigs.k8s.io/) cluster |
| [Telepresence](https://telepresence.io/docs/install/client) | optional | reaching in-cluster backends from your machine |

macOS and Linux are supported for development; on Windows use WSL2.

## Clone and build

```sh
git clone https://github.com/modelsphere/console.git      # or your fork, see development-workflow.md
cd console

go build ./... && go test ./...

cd web
npm ci                        # public registry only; @modelsphere/ui is web/packages/ui
npm run typecheck && npm test
npm run build                 # writes web/dist, which the Go binary embeds
```

`web/dist` is committed with only a `.gitkeep`, so `go build` works without Node — it just serves no UI until `npm run build` has run.

## A cluster to develop against

Console keeps users and roles in CRDs and reads the gateway from the cluster, so it always needs one. Pick:

| Option | Gets you | Command |
|---|---|---|
| The chart, on kind or any dev cluster | CRDs and the seeded `admin`; no models without a swissd | `helm upgrade --install console ./helm/console -n modelsphere --create-namespace --wait` |
| CRDs only | identity only; you create users yourself | `kubectl apply -f helm/console/crds/` |
| A shared cluster that runs the stack | real swissd and gateway | ask a maintainer for a kubeconfig; never point a dev build at production |

With the chart installed, scale its console down while yours runs, so the two do not both answer: `kubectl -n modelsphere scale deploy/console-console --replicas=0`.

## Run the server

```sh
cp examples/console.yaml console.yaml      # git-ignored
```

Edit `console.yaml`:

| Key | Set to |
|---|---|
| `cluster.kubeconfig`, `cluster.context` | your dev cluster |
| `server.auth.jwtSecret` | anything; to log in with tokens issued by the in-cluster console, the same secret it uses |
| `server.auth.disabled: true` | optional: no login, every request is `admin`. Handy for UI work; never in a shared deployment |
| `backends[].url` | a URL your machine can reach — see below |

```sh
go run ./cmd/console --config console.yaml --log-level debug
curl -s localhost:8080/healthz              # {"status":"ok","version":"…"}
```

Config lookup when `--config` is absent: `$CONSOLE_CONFIG`, `./console.yaml`, `~/.config/console/console.yaml`. Flags and env: `--addr` / `CONSOLE_ADDR`, `--log-level` / `CONSOLE_LOG_LEVEL`, `--web-dir` / `CONSOLE_WEB_DIR`, `CONSOLE_JWT_SECRET`. `go run ./cmd/console -h` lists them.

## Run the UI

```sh
cd web
npm run dev                                 # http://localhost:5173, proxies /api and /oauth to :8080
```

| Script | What it does |
|---|---|
| `npm run dev` | console shell with hot reload, against your local server |
| `npm run dev:swiss` | the standalone Swiss UI variant, against `$SWISSD` (default `http://127.0.0.1:8080`) |
| `npm run build` / `build:swiss` | `web/dist` / `web/dist-swiss` |
| `npm run typecheck` | both variants; run before claiming done |
| `npm test` | vitest |

To serve a UI build from the Go server without re-embedding it: `--web-dir web/dist`.

## Reaching in-cluster backends

Backends and the gateway are addressed by cluster DNS (`http://swissd.swiss.svc:8080`, and the gateway resolver builds `http://<svc>.<ns>.svc:<port>`). Your machine cannot resolve those by default:

| Approach | Use when | How |
|---|---|---|
| `kubectl port-forward` | one fixed backend (swissd) | `kubectl -n swiss port-forward svc/swissd 18080:8080`, then `backends[].url: http://127.0.0.1:18080/api` |
| `telepresence connect` | the gateway, or several backends | after `telepresence connect`, `*.svc` names resolve from your machine; `console.yaml` stays as in the cluster |
| Run it in the cluster | testing the chart, RBAC or the real network path | build an image (below) and `helm upgrade` |

### Debugging in the cluster with Telepresence

To have in-cluster traffic reach the console process on your machine — breakpoints on real requests:

```sh
telepresence connect
telepresence intercept console-console -n modelsphere --port 8080:8080 --env-file ./console.env
```

- Requests to the in-cluster console Service now arrive at your local `:8080`.
- `console.env` holds the pod's environment (the JWT secret, backend keys). Load it in your debugger — GoLand's EnvFile plugin, or VS Code's `"envFile"` in `launch.json`. It holds secrets: `/console.env` is git-ignored; delete it when done.
- `telepresence leave console-console` ends the intercept; `telepresence quit` disconnects.

## Images and the chart

| Command | Output |
|---|---|
| `CONSOLE_REGISTRY=<registry>/<org> hack/image.sh` | builds and pushes `console:<chart version>-dev.<commit>` and writes `console-image.yaml` |
| `hack/image.sh --no-push` | builds only |
| `helm upgrade --install console ./helm/console -n modelsphere -f console-image.yaml` | runs your image; the tag carries the commit, so every upgrade rolls |
| `hack/chart.sh --output ./dist` | packages the chart the way CI does |
| `helm lint --strict helm/console` | what CI lints |

Builds behind a firewall: the `Dockerfile` takes `--build-arg NPM_REGISTRY=…` and `--build-arg GOPROXY=…` mirrors.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `no config file: pass --config, or set CONSOLE_CONFIG` | no `console.yaml` in the lookup path |
| UI pages answer 404 from `go run` | nothing built into `web/dist`; use `npm run dev`, or `npm run build` then rebuild |
| login as `admin` fails | no `admin` User on the cluster — install the chart, or use `server.auth.disabled` |
| Playground lists no models | the gateway is not resolvable from your machine — `telepresence connect` |
| `go build`: `pattern all:dist: no matching files found` | `web/dist/.gitkeep` is gone; `git checkout web/dist/.gitkeep` |
