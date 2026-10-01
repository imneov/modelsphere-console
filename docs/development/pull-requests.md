# Pull requests

How a PR gets from opened to merged, and how to write one that gets through review quickly. For setting up and branching, see [development-workflow.md](development-workflow.md).

```
draft ──▶ ready for review ──▶ CI green ──▶ review ⇄ push fixes ──▶ approved ──▶ maintainer merges ──▶ issue closed
```

## Before you open it

- [ ] There is an issue, and the PR says `Fixes #N` (a typo or broken link needs none). Large changes have an accepted [design proposal](design-proposals.md).
- [ ] Rebased on current `main`.
- [ ] The checks pass locally:

  ```sh
  test -z "$(gofmt -l .)" && go vet ./... && go test ./...
  (cd web && npm run typecheck && npm test && npm run build)   # if web/ changed
  helm lint --strict helm/console                              # if the chart changed
  ```

- [ ] Docs updated where behaviour, a config key, or a chart value moved: `README.md`, `helm/console/README.md`, `examples/console.yaml`, `docs/console-design.md`.
- [ ] No internal hostnames, IPs, registries or credentials, including in screenshots.

## Small PRs

The right size is **one self-contained change**:

- It does one thing, and includes its tests.
- The reviewer can understand it from the PR, its description, and the existing code.
- `main` keeps working after it merges.
- Not so small that its point is lost: a new API comes with its first caller, not on its own.

About 100 changed lines is comfortable to review; 1000 is usually too many. Reviewers may ask for a split on size alone. Ways to split:

| Split | How |
|---|---|
| Refactor first | the move/rename in one PR, the behaviour change in the next |
| Stack | backend first, then the UI module that uses it |
| By area | `internal/router` change separate from the chart change that exposes it |
| Behind a flag | land pieces dark, switch on in the last PR |

Never break `main` between dependent PRs.

## Writing the description

The description is the permanent record of what changed and why — people find a PR by searching for it years later.

**Title** — the Conventional Commit line: `fix(router): reject an expired key on /v1`. It says *what this PR does*, specifically.

**Body** — the [template](../../.github/PULL_REQUEST_TEMPLATE.md), and in it:

- the problem being solved, and why this is the right approach;
- what would go wrong without it;
- shortcomings of the approach, if any, and what is deliberately left out;
- how it was tested; screenshots (before / after) for UI changes;
- links: the issue, the design proposal, related PRs.

| Bad | Good |
|---|---|
| `fix bug` | `fix(playground): keep compare columns when a model is removed` — then: the column index was the model's position in the list, so removing model 1 shifted every later column onto the wrong stream. Key columns by model id. |
| `update chart` | `fix(helm): metrics on a ClusterIP Service of their own` — then: with `service.type=NodePort` the metrics port was exposed on every node. A separate ClusterIP Service keeps it in-cluster and is what ServiceMonitor selects. |
| `phase 1` | `feat(router): store API keys as salted hashes in one Secret` — then: first of three PRs for API keys (`Refs #<issue>`); this one only stores and verifies, nothing calls it yet besides tests. |

### Release note

Every PR fills in the `release-note` block — it is how a tag's release notes are written.

| Change | Write |
|---|---|
| user- or operator-visible: a fix, a feature, a changed default | one line, from the user's point of view |
| needs action on upgrade: a renamed value, a config key, a CRD change | start with `action required:` and say what to do |
| invisible: refactor, tests, CI | `None` |

```release-note
action required: chart value <old.key> is renamed <new.key>; rename it in your values before upgrading.
```

## Not ready yet

Open the PR as a **draft**. Drafts get CI and early comments, never a merge. Mark it ready when the checklist is done. A draft title may say `WIP:`; remove it when ready.

## Review and merge

1. CI (`publish`: Go tests, chart lint and render, image build) must be green. A failure you believe is unrelated: say so in a comment; a maintainer re-runs it.
2. A maintainer reviews, usually within two working days. Ping on the PR after that, not in private.
3. Answer every comment — with a change, or with why not. Resolve a thread only when the reviewer agrees, or it is plainly done.
4. Push fixes as new commits during review (easier to re-review); fold them into the commits they fix before merge.
5. One maintainer approval merges. Changes to identity (`internal/iam`, token handling, RBAC), the CRDs, or `install.sh` want a second reviewer.
6. A maintainer merges — with a merge commit by default, squash when the PR is one logical change in several noisy commits. Authors do not merge their own PRs unless a second maintainer approved.

The reviewer's side of this is in [code-review.md](code-review.md).

## Backports

There are no release branches: fixes land on `main` and ship in the next tag. If a fix must reach users before `main` is ready to release, a maintainer may cut a patch release from a tag:

```sh
git switch -c release-0.1 0.1.1                 # branch from the last tag
git cherry-pick -x <sha-on-main>                # -x records where it came from
hack/bump.sh patch --tag                        # 0.1.2
```

Only for fixes that cannot wait:

- data loss or a security issue;
- console crashes, hangs or cannot be installed;
- login or authorization broken.

The backport PR targets the release branch, links the original PR, and explains why it cannot wait for the next release.
