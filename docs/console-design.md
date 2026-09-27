# console — design

## What this is

The ModelSphere community portal. A full-stack BFF that **owns identity** and
**federates everything else**. It exists because the open-source inference stack
(swiss and friends) has no user management, login, or unified entry point.

## Why a separate service (not part of swiss)

swiss is a deploy control plane: near-stateless, "the cluster is the only source
of truth." Identity is the opposite — users, roles and sessions are data the
portal owns. Keeping them apart lets swiss stay a backend and lets the portal be
the front door for many backends, mirroring Rise Global's apiserver/console
split.

## Wire-compatibility with Rise Global (the upgrade path)

The identity layer is deliberately a subset of Global's, kept compatible so a
community install can be upgraded to the commercial Global without a migration:

| Surface        | Kept identical to Global                                   |
|----------------|------------------------------------------------------------|
| User/role data | `iam.theriseunion.io/v1alpha1` User, IAMRole, IAMRoleBinding CRDs |
| Tokens         | OAuth2 password grant, HS256 JWT, same claim set           |
| Authorization  | K8s-RBAC-shaped, `system:masters` short-circuit, platform scope only |

Upgrade = share the JWT secret and point the identity endpoints at Global's
apiserver. The console frontend contract does not change.

**Decision (2026-09-26): the API group stays `iam.theriseunion.io`.** A separate
group (`iam.modelsphere.dev` was considered) would isolate the two products but
turn the upgrade into a data migration. Consequences of sharing it:

- On a cluster where Global runs (e.g. a member cluster), console and Global read
  and write the **same** users, roles and bindings. That is the upgraded state,
  not a conflict; the helm chart leaves existing CRDs untouched.
- Those CRDs hold roles for every Global scope (platform, workspace, cluster,
  namespace, nodegroup) side by side. Console guards only platform-level things,
  so its authorizer honours only bindings labelled `scope=platform`,
  `scope-value=global` -- Global's own selector at that level. Anything else
  would let a namespace admin act as a console admin.
- The seeded `admin` matches Global's (group `system:masters`, same default hash).

## Architecture

```
browser ─▶ web (Vite / React 19 / Tailwind 4 / @riseaicloud/ui)
             shell: login, layout, sidebar, route guards
             modules: iam, swiss, playground, …   (src/modules/*)
                     │  same-origin /oauth, /api/iam, /api/deploy, /api/llm…
                     ▼
             console (Go BFF)
               internal/iam      identity kernel: CRD types + OAuth2 (HS256) + RBAC
               internal/gateway  resolves the inference entrypoint from the cluster
               internal/server   mux + auth middleware + static SPA
                                 + backend proxy (proxy.go)
                     │
                     ▼  HTTP: X-Remote-User / X-Remote-Group + Bearer JWT,
                        or the backend's own key (apiKeyEnv, or the gateway's
                        Secret read at runtime)
             swissd, llm-openresty, and other backends
```

Users and roles are read/written as **CRDs via the dynamic client** — no scheme,
no generated clients, one less thing to keep in sync with Global.

The web stack pins the same versions as `swiss/web`, so swiss pages compile here
unchanged. Moving either one moves both.

## Modules

The console is a shell plus compile-time modules. A module is a feature area
(iam, swiss, playground, later container management); the shell owns everything
around it.

| Owned by | What |
|---|---|
| shell (`web/src/shell/`) | login, password reset, layout, sidebar, route guards, query client, session on every request |
| module (`web/src/modules/<id>/`) | its pages, its API client, its overview cards |
| `web/src/modules/index.ts` | which modules are installed, in sidebar order — plug in/out = one line |

A module exports one declaration (`ConsoleModule`, `web/src/shell/module.tsx`):

```ts
export const swissModule: ConsoleModule = {
  id: "swiss",
  title: "模型部署",            // sidebar group
  basePath: "/swiss",          // every page mounts below it
  overview: SwissOverview,     // optional cards on the home page
  pages: [
    { path: "", element: <Deployments />, permission: "swiss.view", menu: { label: "部署", icon: Rocket } },
    { path: "catalog/:name", element: <Model />, permission: "swiss.view" },
  ],
};
```

Rules:

- A module imports from `@/shell` only, never from a file under it or from another module.
- `permission` is a UI permission (a Role's `uiPermissions`); it guards the route and hides the menu entry.
- Links go through `useModulePath()`: `p("catalog")` → `/swiss/catalog`. A leading `/` is still relative to the module.
- API calls go through `apiFetch` (drop-in `fetch` with the session) or `request<T>` (JSON helper).
- `validateModules` rejects duplicate ids/basePaths, shell-reserved paths and pages declared twice at startup.

Deliberately not built: runtime loading, micro-frontends, cross-module slots. The
earlier Cordis design (branch `docs/console-plugin-design`) is parked; revisit it
when one of those is actually needed.

## Backends

Each module's backend is a `backends` entry; console proxies it after login.

```
browser  /api/deploy/catalog  ──▶ console
   authenticate (token) ─▶ password-reset guard ─▶ RBAC: verb on backends/<name>
   strip client X-Remote-*, Cookie; set X-Remote-User, X-Remote-Group, Bearer
                             ──▶ swissd  /api/catalog
```

| Aspect | Behaviour |
|---|---|
| Path | prefix replaced by the url's path (`/api/deploy` + `http://swissd/api`) |
| Prefix | must be under `/api/` (that is what puts it behind login), not `/api/iam` or `/api/me` |
| Authorization | resource `backends`, resourceName = backend name; GET/HEAD/OPTIONS `get`, POST `create`, PUT/PATCH `update`, DELETE `delete` |
| Identity | `X-Remote-User` / `X-Remote-Group`, as Rise Global's apiserver sets for a ReverseProxy — a backend runs unchanged behind either |
| Credential | `apiKeyEnv` names an environment variable console sends as `Authorization: Bearer <value>`, replacing the caller's token. The browser never sees it. Empty means the token is forwarded unchanged (swissd's case: it verifies the JWT itself) |
| Streaming | flushed as it arrives (SSE, chunked progress) |
| Backend down | JSON `502` |

A backend must trust `X-Remote-*` only from console (network policy / mTLS),
never from browsers.

In-cluster, a static backend's credential comes from a Secret rather than the
chart's values: `helm/console` renders an env entry per `backendSecrets` key. A
variable that is named but unset is logged at startup and the request goes without
it — console starts, and the backend answers `401`, rather than the pod refusing
to boot.

### A backend that resolves itself (`gateway`)

Naming an inference gateway in a values file means copying three things that all
move: the Service address, which route serves every deployed model, and the key.
The first goes stale when the gateway is reinstalled, the second lies about what
is deployed the moment a model is added, and the third ends up in release history
or in a second copy that nobody rotates.

So the `llm` backend names *where the truth is* instead:

```yaml
backends:
  - name: llm
    prefix: /api/llm
    gateway:
      profile: llm/site-profile          # swiss's site profile, "namespace/name"
      # ...or, with no swissd:
      # configMap: llm/openresty-conf    # route keys: session_route_<route>.conf
      # service: llm/openresty           # the entrypoint
      # route: llm-gateway               # optional: pin one route
      # secretRef: llm/openresty-keys    # optional: override where the key lives
```

| Step | Where it comes from |
|---|---|
| Entrypoint | profile `route.nginxService` + `route.nginxPort` (default 8080) → `http://<name>.<ns>.svc:<port>` |
| Route | the aggregate route in the ConfigMap: the one whose config has `peers_by_model`, i.e. the one that serves several models and therefore lists them on `GET /v1/models`. A single route is used as-is; several non-aggregate routes are an error that names the candidates and asks for `route:` |
| Key | profile `route.auth.secretRef`/`secretKey` (default entry `keys`, format `key1:owner1,…`; the first key is used), sent as `Authorization: Bearer <key>` — llm-openresty accepts nothing else. A bare Secret name means the entrypoint's namespace |
| Overrides | `apiKeyEnv` (a copied key in the console's namespace), and `route` |

Resolution is cached for 30s and re-read after that, so a model deployed later
appears without redeploying the console; a refresh that fails keeps the last good
answer and logs it, because a transient API error should not take inference down.
An entrypoint that has *never* resolved answers `502` with the reason
(`backend llm: site profile llm/absent: not found`) instead of a confusing 404.

RBAC follows the references: `helm/console` renders one read-only Role and binding
per namespace they name, on `configmaps` and `secrets`. No `resourceNames`,
because the profile is what names the route ConfigMap and the key Secret, and a
chart cannot know at render time what a ConfigMap will say later. Nothing reads
the Service: the address is assembled from the reference.

## Playground

The Playground is chat against the inference gateway, for the question a
deployment page cannot answer: does this model actually generate? swissd's own
chat probe is one prompt, 32 tokens, non-streaming, and it lives on a release;
the Playground is a conversation, streaming, for anyone with the permission.

| Concern | Decision |
|---|---|
| Where it runs | `web/src/modules/playground/`, mounted at `/playground`; both pages are lazy-loaded (Markdown and highlighting are most of the weight) |
| Pages | `/playground` — one conversation; `/playground/compare` — 2–4 columns, one prompt sent to every column, shared parameters in a dialog |
| Which backend | `llm` → the gateway's aggregate route, resolved from the cluster, so one picker lists every deployed model (`GET /v1/models`) |
| Gateway key | read by console from the Secret the site profile names (or `apiKeyEnv`). Never in a values file, never in a chart value, never in the browser |
| Conversation identity | each conversation (each column, in compare) sends its own `X-Session-Id`; the gateway pins it to one engine, so its prefix cache stays warm across turns |
| Parameters | system prompt, temperature, top_p, max_tokens, seed, stop (one per line), frequency/presence penalty, reasoning_effort; an empty field is left out of the request, so the engine's default applies |
| Token counts | the page does not send `stream_options`; the gateway injects `include_usage` for streaming requests |
| Stats per answer | TTFT, total time, input/output tokens, tok/s over the decoding window (after TTFT), and cache hit rate = `prompt_tokens_details.cached_tokens / prompt_tokens`, shown only when the engine reports it |
| Reasoning models | `delta.reasoning_content`, or a leading `<think>…</think>` in content, is shown in a collapsible block above the answer |
| Reasoning in history | never sent back: the next turn's history carries only the answer, as the OpenAI-style APIs expect |
| View code | cURL / Python / Node.js reproducing the current request against `<origin>/v1`, key read from `$MODELSPHERE_API_KEY`. That endpoint and its keys are the API-key work below; until it lands the snippets are a preview |
| Access | UI permission `playground.use` guards the pages; the backend needs `get` **and** `create` on `backends/llm` (models are a GET, completions a POST) |

A user therefore needs a role carrying both:

```json
{"uiPermissions": ["playground.use"],
 "rules": [{"apiGroups": ["iam.theriseunion.io"], "resources": ["backends"],
            "resourceNames": ["llm"], "verbs": ["get", "create"]}]}
```

### API keys (next)

Programs reach the models through console, not the gateway: console owns the
user-facing key, the gateway keeps its single key.

```
client --Bearer user key--> console /v1 --gateway key--> llm-openresty
            verify: hash, expiry, allowed models (reads `model`, body size capped)
```

| Concern | Decision |
|---|---|
| Endpoint | `/v1/*` passthrough, resolved like `backends.llm`; `X-Session-Id` forwarded unchanged; the gateway is not changed |
| Issuing | admins only; format `prefix_access_secret`; plaintext shown once, masked in the list |
| Expiry | 7 days, 1 month, 6 months, or never |
| Scope | optional allowed-model list; last-used time recorded |
| Storage | hashes in one Secret in console's namespace — no new CRD in the shared `iam.theriseunion.io` group |
| Availability | console is now on the inference path: replicas and disruption budget have to reflect that |

## Bringing swiss in

swiss's frontend is copied into `web/src/modules/swiss/` and maintained there by
the swiss team (CODEOWNERS). The aim is that the copy needs configuration, not
page edits. What swiss prepares on its side first:

| # | Today in `swiss/web` | Change in swiss | Why |
|---|---|---|---|
| 1 | imports use `@/…` | use `@swiss/…` | `@/` is the console's root; console adds one alias `@swiss` → `src/modules/swiss` |
| 2 | absolute links `to="/catalog"`, `navigate("/")` | one `swissPath()` helper (console binds it to `useModulePath`) | pages mount under `/swiss` |
| 3 | `fetch("/api/...")` | one client with a configurable base and fetch | console sets base `/api/deploy` and `apiFetch` |
| 4 | `main.tsx` holds routes, router, query client, layout | `module.tsx` exports pages + menu; `main.tsx` keeps the standalone shell | console mounts the pages, not the app |
| 5 | `index.css` declares the theme variables | move them to a standalone-only file | the Rise tokens provide the theme here |

API types: swissd exports `openapi.json` (committed, CI-checked), and the console
generates the TypeScript client from it, replacing the hand-written types in
`swiss/web/src/lib/api.ts`.

## Rise Global target

Not in scope now. The module contract keeps the door open: pages take no props
from the shell, links and fetches go through shell functions, and backend
requests carry the same headers Global's apiserver sets.

## Known debt

- **`@riseaicloud/ui` is a private, closed-source package.** It is used now to
  hit the deadline; the repo **cannot be made truly open-source** until this
  dependency is replaced with open components or itself open-sourced. Tracked as
  a release blocker, not a permanent state.
- **The vendored `@riseaicloud/ui` peer range was widened to React 19 by hand**
  (`web/vendor/@riseaicloud/ui/package.json`). Upstream should publish the same
  range; until then a re-vendor must keep the edit.
- **The Rise tokens are still a Tailwind 3 preset**, loaded through `@config`.
  A Tailwind 4 CSS build of the tokens would drop `tailwind.config.ts`.

## Phases

| Phase | Scope |
|-------|-------|
| P0 | Scaffold: Go BFF skeleton, config, dynamic client, Docker, helm chart. **(done)** |
| P1 | Login loop: iam CRD types, dynamic CRUD, `/oauth/token`, auth middleware, helm-seeded admin, frontend login + guard. |
| P2 | User management: user CRUD API + UI, i18n (zh-CN/en-US). |
| P3 | Full roles: authorizer + role/binding CRUD + role/permission UI. |
| P4 | Federation: module shell, stack aligned with swiss, backend proxy with identity headers and per-backend RBAC. **(done)** |
| P5 | swiss module: swiss prepares its frontend (table above) and exports `openapi.json`; copy into `modules/swiss`; CODEOWNERS. |
| P6 | Playground: chat module, `llm` backend resolved from the cluster (site profile or route ConfigMap) with the gateway key read from its Secret, streaming SSE end to end. **(done)** Then: Markdown, compare page, full parameters, stats, view code. **(done)** API keys and the `/v1` endpoint. |
| P7 | Container management modules, moved over from Rise Global. |

Each phase is independently committable and verifiable.
