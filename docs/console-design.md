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
             modules: iam, swiss, …            (src/modules/*)
                     │  same-origin /oauth, /api/iam, /api/deploy…
                     ▼
             consoled (Go BFF)
               internal/iam      identity kernel: CRD types + OAuth2 (HS256) + RBAC
               internal/server   mux + auth middleware + static SPA
                                 + backend proxy (proxy.go)
                     │
                     ▼  HTTP: X-Remote-User / X-Remote-Group + Bearer JWT
             swissd, and other backends
```

Users and roles are read/written as **CRDs via the dynamic client** — no scheme,
no generated clients, one less thing to keep in sync with Global.

The web stack pins the same versions as `swiss/web`, so swiss pages compile here
unchanged. Moving either one moves both.

## Modules

The console is a shell plus compile-time modules. A module is a feature area
(iam, swiss, later container management); the shell owns everything around it.

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

Each module's backend is a `backends` entry; consoled proxies it after login.

```
browser  /api/deploy/catalog  ──▶ consoled
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
| Streaming | flushed as it arrives (SSE, chunked progress) |
| Backend down | JSON `502` |

A backend must trust `X-Remote-*` only from consoled (network policy / mTLS),
never from browsers.

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
| P6 | Container management modules, moved over from Rise Global. |

Each phase is independently committable and verifiable.
