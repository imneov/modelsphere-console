# Coding conventions

What reviews will ask for. [AGENTS.md](../../AGENTS.md) holds the comment and doc rules; they apply to people too.

## Everywhere

- **Comments say why, not what.** Only where the reason cannot be read off the code. Rationale longer than a few lines goes to [console-design.md](../console-design.md), not into source.
- **No 80-column limit.** `gofmt` and `prettier` decide the rest.
- **Names over comments.** If a reviewer asks why the code is the way it is, first try a better name; then a comment.
- **No internal hostnames, IPs, registries or credentials** in code, tests, docs or examples. Use `example.com`, `<registry>`, `dev-only-change-me`.
- Scripts (`hack/*.sh`, `install.sh`) are `bash` with `set -euo pipefail` and run on macOS and Linux.

## Go

| Rule | |
|---|---|
| Format | `gofmt -w`; `go vet ./...` clean |
| Style | [Effective Go](https://go.dev/doc/effective_go), [Go Code Review Comments](https://go.dev/wiki/CodeReviewComments) |
| Packages | lower case, one word, no `_` or `-`; named for what they provide, not `util` / `common` / `helpers` |
| Stutter | consider the package name: `router.Store`, not `router.RouterStore` |
| Placement | `internal/<area>`; a new package only when no existing one fits |
| Errors | wrap with context, lower case, no trailing period: `fmt.Errorf("decode user: %w", err)` |
| Flags | dashes, not underscores (`--log-level`); every flag that matters in a cluster also has a `CONSOLE_*` env var |
| Config | new keys go into `internal/config` with validation, into `examples/console.yaml` with a comment, and into the chart if operators set them |
| Context | first parameter for anything that does I/O; respect cancellation |
| Concurrency | say in a comment what a mutex guards; no goroutine without a way to stop it |

### Logging

`log/slog`, structured, one logger passed in — not the global `log` package, not `fmt.Println`.

```go
r.log.Warn("gateway unresolved", "backend", r.backend.Name, "err", err)
```

| Level | Use for |
|---|---|
| `Error` | something failed that an operator must act on |
| `Warn` | degraded but continuing: a retry, a fallback, a stale value kept |
| `Info` | state changes an operator wants in steady state: listening, resolved, reloaded |
| `Debug` | per-request detail; off by default (`--log-level debug`) |

- Message: short, lower case, what happened. Details as key/value pairs, keys in lower case.
- Never log tokens, passwords, API keys or the gateway key — log where a credential came from (`KeySource`), not its value.
- Packages that a caller may reuse return errors; they do not log and continue.

## Web (`web/`)

| Rule | |
|---|---|
| Checks | `npm run typecheck` (both build variants) and `npm test` before claiming done |
| Format | `prettier` defaults |
| Stack | React 19, TypeScript, Tailwind 4, `@modelsphere/ui` (`web/packages/ui`) components and tokens; TanStack Query for server state |
| Imports | `@/…` for `web/src`; `@swiss/…` inside the swiss module |
| Modules | a feature is a module under `web/src/modules/<name>` exporting a `ConsoleModule`, registered by one line in `modules/index.ts`. It does not reach into another module |
| Shell | `web/src/shell` is shared: layout, auth, permissions, preferences. Changes there affect every module — keep them deliberate |
| Permissions | pages and actions are gated with UI permissions (`swiss.view`, …) via `usePermissions` / `PermissionGuard`; the server enforces the same — the UI check is not the security boundary |
| API calls | through the module's `api.ts`, same-origin (`/api/...`, `/oauth/...`); no absolute URLs |
| Text | UI strings in the same language and wording as the existing menus |

### The swiss module is a copy

`web/src/modules/swiss` mirrors [modelsphere/swiss](https://github.com/modelsphere/swiss)'s UI (see "Bringing swiss in" in [console-design.md](../console-design.md#bringing-swiss-in)). A change to its pages belongs upstream in swiss, then a resync here; edits made only here are undone by the next sync. Console-side glue (`lib/host`, `components/ui/rise`) is changed here.

## Helm chart (`helm/console`)

- `values.yaml` keeps its prose comments — people choosing values read them. Every new value is commented.
- A new value that changes rendering gets a `helm template` case in CI or a test in `internal/config/chart_test.go`.
- Images must be pullable anonymously; CI checks it.
- CRDs under `helm/console/crds` follow the shared `iam.theriseunion.io` group — changing them is a compatibility decision (see [console-design.md](../console-design.md)), never a drive-by.

## Tests

- New packages and significant behaviour come with tests in the same PR.
- **Test names are claims**: `TestHelmDemoWithAGatewayIsRefused`, `it("rejects two modules on one basePath")` — not `TestDemo2`.
- Table-driven tests (`cases := []struct{…}` + `t.Run(tc.name, …)`) for many inputs to one behaviour.
- Kubernetes interactions: fake clients, not a live cluster. Tests pass on macOS and Linux with no cluster and no network.
- Asynchronous behaviour: wait for a condition with a timeout, never `time.Sleep` and hope.
- A bug fix starts with a test that fails without the fix.

## Files and directories

| Kind | Naming |
|---|---|
| Go files | lower case, underscores: `authz_scope_test.go` |
| Go packages / directories | lower case, one word, no separators; nest instead of joining words |
| React components | `PascalCase.tsx`; hooks and helpers `camelCase.ts`; tests next to the code as `*.test.ts(x)` |
| Docs | lower case, dashes: `docs/development/coding-conventions.md` |
| Scripts | `hack/<verb>.sh` |
