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
| Authorization  | K8s-RBAC-shaped, `system:masters` short-circuit            |

Upgrade = share the JWT secret and point the identity endpoints at Global's
apiserver. The console frontend contract does not change.

## Architecture

```
browser ─▶ web (Next.js 14 / React 18 / @riseaicloud/ui)
                     │  same-origin /oauth, /api/iam, /api/deploy…
                     ▼
             consoled (Go BFF)
               internal/iam      identity kernel: CRD types + OAuth2 (HS256)
               internal/authz    global-scope RBAC (ported, simplified)
               internal/server   mux + auth middleware + static SPA
               internal/proxy    reverse proxy to backends, carrying the JWT
                     │
                     ▼  HTTP (Bearer JWT)
             swissd, and other backends
```

Users and roles are read/written as **CRDs via the dynamic client** — no scheme,
no generated clients, one less thing to keep in sync with Global.

## Known debt

- **`@riseaicloud/ui` is a private, closed-source package.** It is used now to
  hit the deadline; the repo **cannot be made truly open-source** until this
  dependency is replaced with open components or itself open-sourced. Tracked as
  a release blocker, not a permanent state.

## Phases

| Phase | Scope |
|-------|-------|
| P0 | Scaffold: Go BFF skeleton, config, dynamic client, Docker, helm chart. **(done)** |
| P1 | Login loop: iam CRD types, dynamic CRUD, `/oauth/token`, auth middleware, helm-seeded admin, frontend login + guard. |
| P2 | User management: user CRUD API + UI, i18n (zh-CN/en-US). |
| P3 | Full roles: authorizer + role/binding CRUD + role/permission UI. |
| P4 | Federation: reverse proxy to swissd; deploy/catalog pages inside the portal. |

Each phase is independently committable and verifiable.
