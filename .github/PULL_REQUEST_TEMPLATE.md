<!--
Thanks for the pull request. Before you submit:
- docs/development/pull-requests.md       how a PR gets reviewed and merged
- docs/development/coding-conventions.md  what reviews will ask for
Title: Conventional Commits, e.g. "fix(playground): keep the compare columns after a model is removed".
-->

### What type of PR is this?

<!-- Keep the ones that apply, delete the rest. -->
- [ ] bug fix
- [ ] feature
- [ ] cleanup / refactor (no behaviour change)
- [ ] documentation
- [ ] install / chart
- [ ] CI / tooling
- [ ] breaking: API, config key, chart value, or CRD field changed

### What this PR does and why

<!--
The problem, why this is the right fix, and what would go wrong without it.
Shortcomings of the approach, if any.
-->

### Which issue(s) this PR fixes

<!--
"Fixes #123" closes the issue on merge; "Refs #123" links without closing.
A typo or a broken link needs no issue.
-->
Fixes #

### How it was tested

<!-- Unit tests added or changed; manual steps on a cluster; screenshots for UI changes (before / after). -->

### Checks

- [ ] `go test ./...` and `gofmt -l .` is empty
- [ ] `npm run typecheck && npm test && npm run build` in `web/` (if `web/` changed)
- [ ] `helm lint --strict helm/console` (if the chart changed)
- [ ] Docs updated where behaviour, a config key or a chart value moved
- [ ] No internal hostnames, IPs, registries or credentials

### Notes for reviewers

<!-- Where to start reading, what you are unsure about, what is deliberately left out. -->

### Release note

<!--
Does this change something a user or operator sees? Write one line for the release notes.
If it needs action on upgrade, start with "action required:".
If not, write "None".
-->
```release-note

```
