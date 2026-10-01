# Design proposals

Agree on the design before the code, for changes that are expensive to undo.

```
feature request ──▶ proposal (issue, kind/design) ──▶ discussion ──▶ accepted ──▶ PRs ──▶ docs/console-design.md updated
                                                          │
                                                          └─▶ declined, with the reason recorded
```

## When one is needed

| Needs a proposal | Does not |
|---|---|
| a new HTTP API or a change to an existing one (`/api/*`, `/v1`, `/oauth`) | a bug fix |
| a CRD field, token claim, or anything touching Rise Global compatibility | a UI change inside one module |
| a new config key or chart value with non-obvious defaults | a new chart value that only exposes an existing setting |
| a new module or backend | refactoring with no behaviour change |
| a change that spans console and another component | docs |

Not sure? Open the feature request and ask; a maintainer will say.

## How

1. Open an issue with the template below, labelled `kind/design`, titled `design: <topic>`.
2. Discuss there. Keep the issue body current as the design changes, so it is always the latest version.
3. A maintainer marks it accepted (`triage/accepted`) or declines it with the reason.
4. Implement in [small PRs](pull-requests.md#small-prs) that reference the issue.
5. The last PR records the decision in [console-design.md](../console-design.md) — rationale lives there, not in code comments.

## Template

```markdown
## Background
<!-- 4–8 sentences: the problem, who has it, why now. Link the feature request. -->

## Proposal
<!-- 4–8 sentences: the solution in brief. -->

## User experience
### Use cases
<!-- Numbered. Who does what, and what they get. -->
1.
2.

### What the user sees
<!-- UI sketch or screenshot, config example, API request and response. -->

## Design
### Overview
<!-- A diagram: which component calls which, what data moves. -->

### API and configuration
<!-- New or changed endpoints, config keys, chart values, CRD fields — with examples. -->

### Security
<!-- Who may do this (RBAC verb/resource, UI permission), what new data or credentials are held, what is logged. -->

### Compatibility and upgrade
<!-- Can an existing install upgrade with no action? Rise Global compatibility? What needs an "action required" note? -->

## Alternatives considered
<!-- Each with why it was not chosen. -->

## Out of scope
<!-- What this deliberately does not do, and whether it is a likely follow-up. -->

## Rollout
<!-- The PRs, in order. What is visible after each. -->
```
