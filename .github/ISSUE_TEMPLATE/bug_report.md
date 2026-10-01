---
name: Bug report
about: Console does something other than what the docs say
labels: ["kind/bug", "needs-triage"]
---

<!--
This comment is not shown on the issue page; no need to delete it.

- Security problem? Do not file it here. See SECURITY.md.
- Search existing issues first, open and closed: https://github.com/modelsphere/console/issues?q=is%3Aissue
- Title: "<area>: <symptom>", e.g. "playground: compare view drops a column after a model is removed".
- One problem per issue. English or Chinese.
- Redact hostnames, IPs, tokens, API keys, the gateway key and passwords.
- Rules in full: docs/development/issues.md
-->

**What happened**
<!-- For UI problems, add a screenshot. -->

**What you expected instead**

**How to reproduce**
<!-- Numbered, from a fresh login, the smallest set of steps that shows it. -->
1. Log in as …
2. Go to …
3. Click …
4. See …

**Versions**
- Console: <!-- `curl <console>/healthz` shows it, or the chart version from `helm list` -->
- Installed with: <!-- `helm install` (chart version, non-default values) / `./install.sh` (flags) / from source -->
- Kubernetes:
- Browser, for UI problems:
- Swiss / gateway, if the problem is in model deployment or chat:

**Evidence**
<!--
- console logs: kubectl -n <ns> logs deploy/<release>-console --since=10m
- the failing request from the browser's network tab: method, path, status, response body
Use fenced code blocks; attach long logs as files.
-->

**Anything else**
<!-- A workaround you found, the last version where it worked (then this is also a regression), related issues. -->
