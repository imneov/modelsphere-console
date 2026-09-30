#!/usr/bin/env bash
# Bump the one version console has.
#
#   hack/bump.sh                 show the current version
#   hack/bump.sh patch|minor|major
#   hack/bump.sh 0.3.1           set it explicitly
#
# Chart.yaml (version and appVersion) and internal/version move together; a test
# in internal/version refuses a commit where they disagree. image.tag stays empty
# in the chart, so helm follows appVersion.
set -euo pipefail
cd "$(dirname "$0")/.."

chart=helm/console/Chart.yaml
gofile=internal/version/version.go
current=$(sed -n 's/^appVersion: *"\{0,1\}\([^"]*\)"\{0,1\}/\1/p' "$chart")

if [ $# -eq 0 ]; then
  echo "$current"
  exit 0
fi

case "$1" in
  major|minor|patch)
    IFS=. read -r a b c <<<"${current%%-*}"
    case "$1" in
      major) next="$((a + 1)).0.0" ;;
      minor) next="${a}.$((b + 1)).0" ;;
      patch) next="${a}.${b}.$((c + 1))" ;;
    esac
    ;;
  [0-9]*) next=$1 ;;
  *) echo "usage: $0 [major|minor|patch|X.Y.Z]" >&2; exit 2 ;;
esac

if ! [[ "$next" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
  echo "not a semver: $next" >&2
  exit 2
fi

# Line-targeted, so the rest of Chart.yaml -- the dependencies included -- is untouched.
tmp=$(mktemp)
sed -e "s/^version: .*/version: $next/" -e "s/^appVersion: .*/appVersion: \"$next\"/" "$chart" >"$tmp" && mv "$tmp" "$chart"
sed -e "s/^const Version = .*/const Version = \"$next\"/" "$gofile" >"$tmp" && mv "$tmp" "$gofile"

go test ./internal/version >/dev/null
echo "$current -> $next"
