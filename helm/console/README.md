# Console Helm Chart

This chart installs the ModelSphere Console, its IAM resources, an optional built-in inference gateway, and an optional CPU demo model.

## Per-Commit Artifact

Every pushed commit runs the `Helm chart` GitHub Actions workflow:

```
push commit -> lint -> render install modes -> verify images -> package with SHA -> checksum -> upload artifact
```

For base version `0.1.0` and commit `0123456789abcdef0123456789abcdef01234567`, the workflow produces:

| Output | Name |
|---|---|
| Workflow artifact | `console-chart-0.1.0-git0123456789abcdef0123456789abcdef01234567` |
| Helm package | `console-0.1.0-git0123456789abcdef0123456789abcdef01234567.tgz` |
| Integrity check | `console-0.1.0-git0123456789abcdef0123456789abcdef01234567.tgz.sha256` |

GitHub can only package commits after they are pushed.

## Package Locally

Run from the repository root. The script uses the current Git commit in the chart version.

```bash
hack/chart.sh --output ./dist
```

To push the same chart to Huawei SWR, first configure an Enterprise Helm Chart repository and install the ChartMuseum push plugin:

```bash
helm plugin install https://github.com/chartmuseum/helm-push --version 0.11.1
export SWR_CHART_REPO_URL="https://<namespace>.swr.<region>.myhuaweicloud.com/chartrepo/<namespace>"
export SWR_CHART_USERNAME="<AccessKey>"
export SWR_CHART_PASSWORD="<SecretKey>"
hack/chart.sh --output ./dist --push
```

Basic-edition SWR image repositories do not accept Helm OCI manifests. `--push` therefore requires the Enterprise `chartrepo` URL and long-term credentials.

## Install

Install a downloaded workflow artifact:

```bash
PACKAGE=console-0.1.0-git0123456789abcdef0123456789abcdef01234567.tgz
sha256sum -c "${PACKAGE}.sha256"
helm upgrade --install console "./$PACKAGE" \
  --namespace modelsphere \
  --create-namespace \
  --wait \
  --timeout 20m
```

Or install from an SWR Enterprise Helm repository after the chart has been pushed:

```bash
VERSION=0.1.0-git0123456789abcdef0123456789abcdef01234567
printf '%s' "$SWR_CHART_PASSWORD" | helm repo add swr-console "$SWR_CHART_REPO_URL" \
  --username "$SWR_CHART_USERNAME" \
  --password-stdin
helm repo update swr-console
helm upgrade --install console swr-console/console \
  --version "$VERSION" \
  --namespace modelsphere \
  --create-namespace \
  --wait \
  --timeout 20m
```

The current default image is the public `swr.cn-east-3.myhuaweicloud.com/risecloud/console:0.1.0-dev.4f512ab` image.

## Install Modes

| Mode | Values |
|---|---|
| Standalone | Defaults include the OpenResty gateway and CPU demo model; requires a default StorageClass and approximately 2 CPU and 2 GiB of available memory |
| Existing ModelSphere stack | Set `gateway.enabled=false` and `demo.enabled=false`, then configure `backends` and `playground.gateway` |

For a private image override, create the pull Secret outside Helm and set `imagePullSecrets` to its name. This keeps registry credentials out of Helm release values.

The repository's `install.sh` remains an optional discovery and verification helper for an existing stack; the packaged chart does not run it in a Kubernetes Job.
