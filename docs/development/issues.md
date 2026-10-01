# Issues

How to file an issue that gets fixed, and how issues move from opened to closed.

```
opened ──▶ needs-triage ──▶ triage/accepted ──▶ assigned ──▶ PR "Fixes #N" ──▶ closed on merge
               │                  │
               │                  └─▶ lifecycle/stale (90 days quiet) ──▶ closed (30 more)
               ├─▶ triage/needs-information ──▶ (reporter answers) ──▶ back to triage
               └─▶ triage/duplicate · triage/not-reproducible · triage/wont-fix ──▶ closed
```

## Before you file

1. **Is it a vulnerability?** Stop — report it privately, see [SECURITY.md](../../SECURITY.md).
2. **Search** [issues](https://github.com/modelsphere/console/issues?q=is%3Aissue), open and closed. If it exists and is open, comment with what is new (another version, another environment) or add a 👍. If it was closed but is back, open a new issue that links the old one.
3. **Check the docs**: [README](../../README.md), the [install guide](../../helm/console/README.md), and [console-design.md](../console-design.md) — some behaviour is a recorded decision, not a bug.
4. **Is it console's?** Console federates to other ModelSphere components. When the failing call is proxied, the bug may be theirs:

   | Symptom in the UI | Usually lives in |
   |---|---|
   | login, users, roles, API keys, menus, Playground rendering | console |
   | model deployment pages: catalog, deploy diff, apply | [swiss](https://github.com/modelsphere/swiss) (console only mounts its pages) |
   | a chat that errors or never answers, `/v1` returning gateway errors | [llm-openresty](https://github.com/modelsphere/llm-openresty) or the model server |

   Not sure? File it here; triage will move it.

## Choosing a template

| Template | For | Labels it applies |
|---|---|---|
| Bug report | console does something other than what the docs say | `kind/bug`, `needs-triage` |
| Installation issue | `helm install` or `./install.sh` fails, or console never becomes ready | `kind/install`, `needs-triage` |
| Feature request | something console should be able to do | `kind/feature`, `needs-triage` |

Blank issues are disabled. A usage question goes in a feature-request issue titled `question: …`; triage relabels it `kind/question`.

## Writing a good issue

| Part | Good | Not useful |
|---|---|---|
| Title | `playground: compare view drops the 3rd column after a model is removed` — area, then the symptom | `bug`, `doesn't work`, `help!!` |
| Scope | one problem | three unrelated problems in a list |
| Versions | console version (`curl <console>/healthz`, or the chart version from `helm list`), Kubernetes version, browser for UI issues | "latest" |
| Install | chart and values that differ from the defaults, or `./install.sh` and its flags | — |
| Steps | numbered, from a fresh login, smallest set that reproduces | "use it for a while" |
| Expected vs. actual | both, explicitly | only the actual |
| Evidence | screenshot for UI issues; console log lines; the failing request from the browser's network tab (status + response body) | a 400-line log with no pointer |

Rules for pasted material:

- Redact hostnames, IPs, JWTs, API keys, the gateway key, and passwords.
- Logs in fenced code blocks; long ones as an attachment.
- English or Chinese are both fine; keep one language within an issue.

### Feature requests

- Describe the **problem**, not only the solution — there is often more than one solution.
- Say what you do today instead, and give at least one concrete use case.
- Say which seam it fits, if you can: a new **module** under `web/src/modules`, a new **backend** in `backends:`, an **identity** change, or a **router** change. A change that fits an existing seam is easier to land.
- Anything that adds an API, a CRD field, a config key, or crosses into another component needs a [design proposal](design-proposals.md) before code.

## Labels

Maintainers apply labels during triage; the templates add the first ones. Create or refresh the whole set with `hack/labels.sh`.

### kind — what it is (exactly one)

| Label | Meaning |
|---|---|
| `kind/bug` | behaviour differs from the docs or the design |
| `kind/feature` | new capability |
| `kind/install` | install, upgrade or chart problem |
| `kind/documentation` | docs are missing, wrong or unclear |
| `kind/cleanup` | refactor, tech debt, dependency bumps; no behaviour change |
| `kind/design` | a design proposal or a decision to be made |
| `kind/question` | usage question |
| `kind/regression` | worked in an earlier version; add with `kind/bug` |

### area — where it is (one or more)

| Label | Code |
|---|---|
| `area/iam` | `internal/iam`, `web/src/modules/iam`: users, roles, login, password |
| `area/server` | `internal/server`, `internal/config`, `cmd/console`: HTTP, auth middleware, backend proxy |
| `area/gateway` | `internal/gateway`: resolving the inference entrypoint |
| `area/router` | `internal/router`, `web/src/modules/router`: `/v1`, API keys, metrics |
| `area/playground` | `web/src/modules/playground` |
| `area/swiss` | `web/src/modules/swiss`: the mounted model deployment pages |
| `area/shell` | `web/src/shell`: layout, navigation, permissions, preferences |
| `area/helm` | `helm/console`, `install.sh` |
| `area/ci` | `.github/`, `hack/` |
| `area/docs` | `README.md`, `docs/`, chart README |

### priority — how soon (set when accepted)

| Label | Meaning |
|---|---|
| `priority/critical` | data loss, security, console down, or install broken for everyone; drop other work |
| `priority/high` | a main flow broken for some users, no reasonable workaround; this release |
| `priority/medium` | has a workaround, or a feature planned for the next release |
| `priority/low` | nice to have; no one is scheduled on it |

### triage and lifecycle

| Label | Meaning |
|---|---|
| `needs-triage` | not yet looked at by a maintainer |
| `triage/accepted` | confirmed and wanted; ready for someone to take |
| `triage/needs-information` | waiting on the reporter; closed after 30 days without an answer |
| `triage/duplicate` | closed in favour of the linked issue |
| `triage/not-reproducible` | could not reproduce with the information given |
| `triage/wont-fix` | works as intended, or out of scope; the closing comment says why |
| `good first issue` | small, well-described, a good first contribution |
| `help wanted` | accepted, and maintainers would welcome an outside PR |
| `lifecycle/stale` | no activity for 90 days |
| `lifecycle/frozen` | never goes stale (long-term tracking issues) |

## Triage

Maintainers aim to triage new issues within two working days:

1. Reproduce, or ask for what is missing (`triage/needs-information`).
2. Set `kind/*`, `area/*` and — once accepted — `priority/*`; replace `needs-triage` with `triage/accepted` or a closing `triage/*` label.
3. Move it to the right repository if it belongs to another component, and link it back.
4. Mark it `good first issue` / `help wanted` when it suits an outside contributor.

## Working on an issue

- Comment that you are taking it; a maintainer assigns it to you. Unassigned after 30 days without a PR or an update, it is free again.
- Branch from `main` (see the [workflow](development-workflow.md)) and reference the issue in the PR: `Fixes #123` closes it on merge; `Refs #123` links without closing (for partial work).
- Progress is visible through the issue: the linked PR, its review state, and comments for anything that blocks you.

## Stale and closed issues

- No activity for 90 days → `lifecycle/stale` with a comment; any comment removes it.
- Stale for 30 more days → closed.
- Exempt: `lifecycle/frozen`, `kind/feature`, `kind/design`, `priority/critical`, and anything assigned.
- A closed issue that is still a problem: comment on it, or open a new one linking it.

## Security issues

Never as a public issue, not even "I found something, details later". Use the private channel in [SECURITY.md](../../SECURITY.md).
