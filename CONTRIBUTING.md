# Contributing to ModelSphere Console

Thanks for helping. These are guidelines, not rules — use your judgement, and propose changes to this file in a pull request.

```
issue ──▶ triage ──▶ branch ──▶ PR ──▶ review ──▶ merge to main ──▶ next tag
  │                                       ▲
  └── design proposal (large changes) ────┘
```

## Code of conduct

Everyone taking part — issues, pull requests, reviews, chat — follows the [Code of Conduct](CODE_OF_CONDUCT.md). Be kind and assume good intent; technical disagreement is welcome, personal attacks are not.

## Ways to contribute

| You want to | Start here |
|---|---|
| Report a bug or an install failure | [Issues](docs/development/issues.md), then the matching [issue template](https://github.com/modelsphere/console/issues/new/choose) |
| Ask for a feature | A feature request issue; for anything large, a [design proposal](docs/development/design-proposals.md) |
| Report a vulnerability | **Not** a public issue — see [SECURITY.md](SECURITY.md) |
| Fix or build something | [Development workflow](docs/development/development-workflow.md) and [Pull requests](docs/development/pull-requests.md) |
| Review someone's PR | [Code review guide](docs/development/code-review.md) |
| Improve the docs | Same as code: a branch and a PR, `docs:` commits |

New here? Look for issues labelled `good first issue` or `help wanted`, and comment before you start so nobody duplicates the work.

## Reporting issues, in short

- Search [existing issues](https://github.com/modelsphere/console/issues?q=is%3Aissue) first — open *and* closed. If it is already there, add your details or a 👍 instead of a new issue.
- One problem per issue. Use a template; it asks for what triage needs (versions, how it was installed, steps, logs).
- Redact hostnames, IPs, tokens, API keys and passwords from everything you paste.

The full rules — labels, triage, lifecycle — are in [docs/development/issues.md](docs/development/issues.md).

## Pull requests, in short

- Every PR targets `main` and links its issue (`Fixes #123`). Trivial fixes (typos, a broken link) may skip the issue.
- One self-contained change per PR; refactors separate from behaviour changes; tests in the same PR as the code.
- Title in [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) form: `feat(playground): …`, `fix(iam): …`.
- Fill in the [PR template](.github/PULL_REQUEST_TEMPLATE.md), including the release note.
- CI green, one maintainer approval, then a maintainer merges.

Details: [docs/development/pull-requests.md](docs/development/pull-requests.md).

## Style

| | Rule |
|---|---|
| Commits | [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) |
| Go | `gofmt`, [Effective Go](https://go.dev/doc/effective_go), [Go Code Review Comments](https://go.dev/wiki/CodeReviewComments) |
| Web | `npm run typecheck` clean, `prettier` formatting |
| Comments and docs | [AGENTS.md](AGENTS.md): comments say *why*; docs are lists, tables and workflow graphs |

Everything else is in [docs/development/coding-conventions.md](docs/development/coding-conventions.md).

## Developer guide

| Document | What is in it |
|---|---|
| [Local development](docs/development/local-development.md) | toolchain, running console against a cluster, the UI dev server, debugging in a cluster, images |
| [Development workflow](docs/development/development-workflow.md) | fork or branch, keep in sync, commit, push, open a PR |
| [Coding conventions](docs/development/coding-conventions.md) | Go, web, tests, files and directories, logging |
| [Issues](docs/development/issues.md) | filing a good issue, labels, triage and lifecycle |
| [Pull requests](docs/development/pull-requests.md) | before you submit, writing the description, small PRs, review and merge, backports |
| [Code review](docs/development/code-review.md) | what reviewers look for and how to write comments |
| [Design proposals](docs/development/design-proposals.md) | when a change needs one, and the template |
