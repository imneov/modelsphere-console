#!/usr/bin/env bash
# Create or update the issue labels docs/development/issues.md describes.
#
#   hack/labels.sh                       on modelsphere/console
#   hack/labels.sh --repo <owner/name>   elsewhere
#   hack/labels.sh --dry-run             print, change nothing
#
# Idempotent: existing labels get their colour and description reset. Labels not
# listed here are left alone. Needs `gh` logged in with write access.
set -euo pipefail

repo="modelsphere/console"
dry=0
while [ $# -gt 0 ]; do
  case "$1" in
    --repo) repo="$2"; shift 2 ;;
    --dry-run) dry=1; shift ;;
    -h|--help) sed -n '2,9p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

# name|colour|description
labels=(
  "kind/bug|d73a4a|Behaviour differs from the docs or the design"
  "kind/feature|a2eeef|New capability"
  "kind/install|e99695|Install, upgrade or chart problem"
  "kind/documentation|0075ca|Docs are missing, wrong or unclear"
  "kind/cleanup|c5def5|Refactor, tech debt, dependency bumps; no behaviour change"
  "kind/design|5319e7|A design proposal or a decision to be made"
  "kind/question|d876e3|Usage question"
  "kind/regression|b60205|Worked in an earlier version"

  "area/iam|1d76db|Users, roles, login, password"
  "area/server|1d76db|HTTP server, auth middleware, backend proxy, config"
  "area/gateway|1d76db|Resolving the inference entrypoint"
  "area/router|1d76db|/v1, API keys, metrics"
  "area/playground|1d76db|The Playground module"
  "area/swiss|1d76db|The mounted model deployment pages"
  "area/shell|1d76db|UI shell: layout, navigation, permissions, preferences"
  "area/helm|1d76db|Helm chart and install.sh"
  "area/ci|1d76db|.github and hack scripts"
  "area/docs|1d76db|README, docs/, chart README"

  "priority/critical|b60205|Data loss, security, console down or install broken for everyone"
  "priority/high|d93f0b|A main flow broken for some users, no workaround"
  "priority/medium|fbca04|Has a workaround, or planned for the next release"
  "priority/low|0e8a16|Nice to have; not scheduled"

  "needs-triage|ededed|Not yet looked at by a maintainer"
  "triage/accepted|0e8a16|Confirmed and wanted"
  "triage/needs-information|fef2c0|Waiting on the reporter"
  "triage/duplicate|cfd3d7|Closed in favour of the linked issue"
  "triage/not-reproducible|cfd3d7|Could not reproduce with the information given"
  "triage/wont-fix|ffffff|Works as intended, or out of scope"
  "good first issue|7057ff|Small and well described; a good first contribution"
  "help wanted|008672|Accepted; an outside PR is welcome"
  "lifecycle/stale|795548|No activity for 90 days"
  "lifecycle/frozen|bfdadc|Never goes stale"
)

for entry in "${labels[@]}"; do
  IFS='|' read -r name colour description <<<"$entry"
  if [ "$dry" -eq 1 ]; then
    printf '%-28s #%s  %s\n' "$name" "$colour" "$description"
  else
    gh label create "$name" --repo "$repo" --color "$colour" --description "$description" --force >/dev/null
    echo "ok  $name"
  fi
done
