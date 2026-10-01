---
name: Installation issue
about: helm install or ./install.sh fails, or console never becomes ready
labels: ["kind/install", "needs-triage"]
---

<!--
This comment is not shown on the issue page; no need to delete it.

- Check the install guide first: helm/console/README.md
- Search existing issues: https://github.com/modelsphere/console/issues?q=is%3Aissue+label%3Akind%2Finstall
- Redact hostnames, IPs, registry credentials, tokens and passwords.
-->

**What failed**
<!-- The command you ran and the step that failed. -->

```sh

```

**Install method**
- [ ] `helm upgrade --install` from `oci://ghcr.io/modelsphere/charts/console` — chart version:
- [ ] `helm` from a checkout of `helm/console` — commit:
- [ ] `./install.sh` — flags:

Values that differ from the defaults:

```yaml

```

**Environment**
<!-- Be specific: it decides most install problems. -->
- Kubernetes version and distribution: <!-- e.g. v1.31, kubeadm / k3s / a managed service -->
- Nodes: <!-- count, OS, CPU/memory, amd64/arm64, GPU or not -->
- Default StorageClass: <!-- name, or none -->
- Can the nodes pull from ghcr.io? <!-- yes / through a mirror / no -->
- Already on the cluster: <!-- swiss, llm-openresty, another console, Rise Global -->
- helm version:

**Output and logs**
<!--
- the failing command's output (for install.sh, the whole run)
- kubectl -n <ns> get pods,events --sort-by=.lastTimestamp
- kubectl -n <ns> describe pod <the pod that is not ready>
- kubectl -n <ns> logs <that pod> --previous
-->

```

```
