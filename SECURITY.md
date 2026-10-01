# Security policy

## Reporting a vulnerability

Report privately, never as a public issue.

1. Use GitHub's [private vulnerability reporting](https://github.com/modelsphere/console/security/advisories/new) on this repository.
2. If that is unavailable to you, open an issue saying only that you have a report and how to reach you — no details — and a maintainer will arrange a private channel.

Include what you can of:

| Field | |
|---|---|
| Title | one line, e.g. "router: an expired API key is still accepted on `/v1`" |
| Overview | what an attacker can do, and from where (anonymous, any logged-in user, a role) |
| Affected versions | console version(s) and, if relevant, chart values |
| Reproduction | steps or a proof of concept |
| CVE | if one is already assigned |
| Contact | how to reach you for follow-up |

## What happens next

```
report ──▶ acknowledged (≤ 2 working days) ──▶ assessed, plan shared (≤ 7 days)
       ──▶ fix on main + patch release ──▶ advisory published, reporter credited
```

- Please keep the report confidential until the fix is released.
- We credit reporters in the advisory unless you ask us not to.
- Where a fix needs an intrusive change and a workaround exists, we may ship the fix in the next release rather than a patch, and publish the workaround in the advisory.

## Supported versions

Console is released from `main` as tagged versions (see `hack/bump.sh`). Security fixes land on `main` and ship in a new patch release of the **latest minor version**; upgrade to get them. Older versions get fixes on a best-effort basis only.

## What console holds

Worth knowing when assessing impact:

- **The JWT signing secret** (`server.auth.jwtSecret`). It signs every session token, and on a cluster shared with Rise Global it is the same secret Global uses. Whoever has it can mint a token for any user, including `system:masters`.
- **Identity data in CRDs.** Users (password hashes), roles, bindings and login records, cluster-scoped. Console's ServiceAccount can write all of them.
- **Trusted identity headers to backends.** Backends receive `X-Remote-User` / `X-Remote-Group` and trust them; swissd behind console runs without a login of its own. A way to make the proxy forward a forged header bypasses console's RBAC on every backend.
- **Credentials for the gateway.** The inference gateway key is read from a Secret and attached to proxied requests; the router forwards `/v1` with it.
- **API keys.** Stored salted and hashed in one Secret; only the issuing response carries the plaintext.
- **`server.auth.disabled`.** Turns off login entirely: every request is a synthetic `admin` in `system:masters`. Meant for trusted, private deployments only.

## Scope

In scope:

- authentication and authorization: login, tokens, RBAC, permission checks in the UI and API, the first-login password change
- the backend proxy: header forwarding, path handling, per-backend RBAC
- the router: API key validation, expiry, per-model scope
- secret handling in console and in the Helm chart's defaults
- XSS or injection in the UI, including rendered model output in the Playground

Out of scope:

- anything that requires cluster-admin, or already holding the JWT secret
- running with `server.auth.disabled` on an untrusted network
- vulnerabilities in swiss, the gateway or model servers — report those to their repositories
- an operator keeping the default `admin` / `P@88w0rd` after the first-login warning
