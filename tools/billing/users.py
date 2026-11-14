"""Generate isolated billing callers for the 1,000-user acceptance workload."""

import argparse
import json
from pathlib import Path
import sys

import yaml


def caller_resources(count, password_hash):
    """Grant model invocation and create callers with server-assigned UIDs."""
    group = "iam.theriseunion.io"
    labels = {f"{group}/scope": "platform", f"{group}/scope-value": "global"}
    role = {"apiVersion": f"{group}/v1alpha1", "kind": "IAMRole",
        "metadata": {"name": "billing-callers", "labels": labels},
        "spec": {"rules": [{"apiGroups": [group], "resources": ["backends"],
            "resourceNames": ["llm"], "verbs": ["get", "create"]}]}}
    binding = {"apiVersion": f"{group}/v1alpha1", "kind": "IAMRoleBinding",
        "metadata": {"name": "billing-callers", "labels": labels},
        "spec": {"roleRef": {"kind": "IAMRole", "apiGroup": group, "name": "billing-callers"},
            "subjects": [{"kind": "Group", "apiGroup": group, "name": "billing-callers"}]}}
    users = [{"apiVersion": f"{group}/v1alpha1", "kind": "User",
        "metadata": {"name": f"billing-user-{index:04}",
            "labels": {"console.modelsphere.io/billing-acceptance": "true"}},
        "spec": {"groups": ["billing-callers"], "encryptedPassword": password_hash}}
        for index in range(count)]
    return [role, binding, *users]


def main():
    """Read the chart's public demo password hash and emit test fixtures."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--count", type=int, default=1000)
    parser.add_argument("--values", type=Path, default=Path("helm/console/values.yaml"))
    options = parser.parse_args()
    if options.count < 1:
        parser.error("count must be positive")
    values = yaml.safe_load(options.values.read_text())
    resources = caller_resources(options.count, values["admin"]["encryptedPassword"])
    json.dump({"apiVersion": "v1", "kind": "List", "items": resources}, sys.stdout)


if __name__ == "__main__":
    main()
