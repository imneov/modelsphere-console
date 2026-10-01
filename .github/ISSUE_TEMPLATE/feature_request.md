---
name: Feature request
about: Something console should be able to do
labels: ["kind/feature", "needs-triage"]
---

<!--
This comment is not shown on the issue page; no need to delete it.

- Search existing issues first; if it is there, add a 👍 and your use case.
- A usage question? Title it "question: …" and skip the sections that do not apply.
- Large changes (a new API, CRD field, config key, or anything crossing into another component)
  need a design proposal before code: docs/development/design-proposals.md
-->

**What are you trying to do?**
<!-- The problem, not only the solution. There is often more than one solution. -->

**What do you do today instead?**

**Use cases**
<!-- At least one, concrete: who does what, and what they get. -->
- 
- 

**Proposed solution, if you have one**

**Which seam does it fit?**
<!--
Tick what applies; leave it if unsure. A change that fits an existing seam is easier to land.
-->
- [ ] a UI module (`web/src/modules/*`)
- [ ] a new backend console federates to (`backends:`)
- [ ] identity: users, roles, login (`internal/iam`)
- [ ] the router: `/v1`, API keys, metrics (`internal/router`)
- [ ] install and chart (`helm/console`, `install.sh`)
- [ ] it belongs in another component (swiss, llm-openresty, …)

**Area**
<!--
Maintainers set the labels; suggest one or more if you like:
area/iam · area/server · area/gateway · area/router · area/playground · area/swiss · area/shell · area/helm · area/ci · area/docs
-->
