"""Run chart processes with go run in an isolated acceptance cluster."""

import argparse
import sys

import yaml


def patch_workload(document, options):
    """Attach source and compiler cache to a chart workload."""
    pod = document["spec"]["template"]["spec"]
    pod.setdefault("volumes", []).extend([
        {"name": "source", "hostPath": {"path": options.source, "type": "Directory"}},
        {"name": "compiler-cache", "persistentVolumeClaim": {"claimName": options.cache_claim}},
    ])
    for container in pod["containers"]:
        container["image"] = options.image
        container["command"] = ["/usr/local/go/bin/go"]
        container["args"] = ["run", "./cmd/console", *container.get("args", [])]
        container["workingDir"] = "/source"
        container.setdefault("volumeMounts", []).extend([
            {"name": "source", "mountPath": "/source", "readOnly": True},
            {"name": "compiler-cache", "mountPath": "/cache"},
        ])
        container.setdefault("env", []).extend([
            {"name": "GOMODCACHE", "value": "/cache/mod"},
            {"name": "GOCACHE", "value": "/cache/build"},
            {"name": "GOPROXY", "value": options.go_proxy},
            {"name": "GOMAXPROCS", "value": "2"},
            {"name": "CGO_ENABLED", "value": "0"},
        ])
        container["startupProbe"]["failureThreshold"] = 180


def main():
    """Transform generated manifests; never mutate a live cluster."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True)
    parser.add_argument("--cache-claim", default="billing-compiler-cache")
    parser.add_argument("--image", required=True)
    parser.add_argument("--go-proxy", default="https://proxy.golang.org,direct")
    options = parser.parse_args()
    documents = list(yaml.safe_load_all(sys.stdin))
    for document in documents:
        if document and document.get("kind") in {"Deployment", "StatefulSet"}:
            patch_workload(document, options)
    yaml.safe_dump_all(documents, sys.stdout, sort_keys=False)


if __name__ == "__main__":
    main()
