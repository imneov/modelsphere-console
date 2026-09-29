#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
output="$root/dist"
push=0
cm_push_version=0.11.1

usage() {
  cat <<'EOF'
Usage: hack/chart.sh [--output DIR] [--push]

Packages helm/console as console-<chart-version>-git<commit-sha>.tgz and writes
its SHA256 checksum. --push uploads the same package to a configured Huawei SWR
Enterprise Helm Chart repository.

Environment for --push:
  SWR_CHART_REPO_URL       enterprise chartrepo URL (required)
  SWR_CHART_REPO_NAME      local Helm repository name (default swr-console)
  SWR_CHART_USERNAME       long-term credential AccessKey (required)
  SWR_CHART_PASSWORD       long-term credential SecretKey (required)
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --output) output=${2:?--output needs a directory}; shift 2 ;;
    --push) push=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

command -v helm >/dev/null || { echo "helm is required" >&2; exit 1; }

base_version=$(sed -n 's/^version: *"\{0,1\}\([^"]*\)"\{0,1\}/\1/p' "$root/helm/console/Chart.yaml")
[ -n "$base_version" ] || { echo "helm/console/Chart.yaml has no version" >&2; exit 1; }
commit=${GITHUB_SHA:-$(git -C "$root" rev-parse HEAD)}
case "$commit" in
  *[!0-9a-fA-F]*|'') echo "invalid git commit: $commit" >&2; exit 1 ;;
esac
[ "${#commit}" -eq 40 ] || { echo "git commit must be the full 40-character SHA: $commit" >&2; exit 1; }
if [ -n "$(git -C "$root" status --porcelain)" ]; then
  echo "refusing to package a dirty worktree as commit $commit" >&2
  exit 1
fi
case "$base_version" in
  *-*) version="${base_version}.git${commit}" ;;
  *)   version="${base_version}-git${commit}" ;;
esac

mkdir -p "$output"
output=$(cd "$output" && pwd)
package="$output/console-${version}.tgz"
helm package "$root/helm/console" --version "$version" --destination "$output"
test -f "$package"
test "$(helm show chart "$package" | sed -n 's/^version: *//p')" = "$version"
(
  cd "$output"
  sha256sum "$(basename "$package")" >"$(basename "$package").sha256"
  sha256sum -c "$(basename "$package").sha256"
)

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  {
    echo "base-version=$base_version"
    echo "commit-sha=$commit"
    echo "version=$version"
    echo "package=$package"
  } >>"$GITHUB_OUTPUT"
fi

if [ "$push" -eq 1 ]; then
  repo_url=${SWR_CHART_REPO_URL:-}
  repo_name=${SWR_CHART_REPO_NAME:-swr-console}
  username=${SWR_CHART_USERNAME:-}
  password=${SWR_CHART_PASSWORD:-}
  if [ -z "$repo_url" ]; then
    echo "SWR_CHART_REPO_URL is required for --push" >&2
    exit 1
  fi
  if [ -z "$username" ] || [ -z "$password" ]; then
    echo "SWR_CHART_USERNAME and SWR_CHART_PASSWORD are required for --push" >&2
    exit 1
  fi
  plugin_version=$(helm plugin list | awk '$1 == "cm-push" {print $2}')
  if [ "$plugin_version" != "$cm_push_version" ]; then
    echo "install cm-push $cm_push_version: helm plugin install https://github.com/chartmuseum/helm-push --version $cm_push_version" >&2
    exit 1
  fi

  repository_config=$(mktemp)
  repository_cache=$(mktemp -d)
  trap 'rm -f "$repository_config"; rm -rf "$repository_cache"' EXIT
  chmod 600 "$repository_config"
  printf '%s' "$password" | \
    HELM_REPOSITORY_CONFIG="$repository_config" HELM_REPOSITORY_CACHE="$repository_cache" \
    helm repo add "$repo_name" "$repo_url" --username "$username" --password-stdin
  HELM_REPOSITORY_CONFIG="$repository_config" HELM_REPOSITORY_CACHE="$repository_cache" \
    helm cm-push "$package" "$repo_name"
  echo "pushed: $repo_name/console $version"
fi

echo "chart: $package"
echo "sha256: ${package}.sha256"
