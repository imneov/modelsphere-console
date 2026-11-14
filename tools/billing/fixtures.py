"""Generate disposable infrastructure for billing acceptance, never production data."""

import argparse
import json
import os
from pathlib import Path
import secrets
import sys

import yaml


def resource(kind, name, namespace, **fields):
    """Construct a fixture resource with an explicit namespace."""
    metadata = {"name": name}
    if namespace:
        metadata["namespace"] = namespace
    return {"apiVersion": "v1", "kind": kind, "metadata": metadata, **fields}


def claim(name, namespace, size):
    """Retain a fixture service's data across pod replacement."""
    return resource("PersistentVolumeClaim", name, namespace, spec={
        "accessModes": ["ReadWriteOnce"], "resources": {"requests": {"storage": size}},
    })


def deployment(name, namespace, container, volumes):
    """Create a fixture Deployment and its private Service."""
    labels = {"app": name}
    workload = resource("Deployment", name, namespace, spec={
        "replicas": 1, "selector": {"matchLabels": labels},
        "template": {"metadata": {"labels": labels}, "spec": {
            "containers": [container], "volumes": volumes,
        }},
    })
    workload["apiVersion"] = "apps/v1"
    port = container["ports"][0]["containerPort"]
    service = resource("Service", name, namespace, spec={
        "selector": labels, "ports": [{"port": port, "targetPort": port}],
    })
    return [workload, service]


def database_fixtures(namespace, password):
    """Use persistent, disposable PostgreSQL and Redis instances."""
    postgres = {"name": "postgres", "image": "postgres:16-alpine",
        "env": [{"name": "POSTGRES_PASSWORD", "value": password},
                {"name": "PGDATA", "value": "/var/lib/postgresql/data/pgdata"}],
        "ports": [{"containerPort": 5432}],
        "volumeMounts": [{"name": "data", "mountPath": "/var/lib/postgresql/data"}]}
    redis = {"name": "redis", "image": "redis:7.4-alpine",
        "args": ["redis-server", "--appendonly", "yes", "--appendfsync", "always", "--dir", "/data"],
        "ports": [{"containerPort": 6379}], "volumeMounts": [{"name": "data", "mountPath": "/data"}]}
    documents = []
    for name, container, size in [("billing-postgres", postgres, "2Gi"), ("billing-redis", redis, "1Gi")]:
        documents.append(claim(name, namespace, size))
        documents.extend(deployment(name, namespace, container, [
            {"name": "data", "persistentVolumeClaim": {"claimName": name}},
        ]))
    return documents


def compiler_volumes(source, cache_claim):
    """Share only test source and the fixture compiler cache."""
    return [
        {"name": "source", "hostPath": {"path": source, "type": "Directory"}},
        {"name": "cache", "persistentVolumeClaim": {"claimName": cache_claim}},
    ]


def go_container(image, package, proxy):
    """Run the real source using the requested Go toolchain image."""
    return {"name": "go", "image": image, "workingDir": "/source",
        "command": ["/usr/local/go/bin/go"], "args": ["run", package],
        "env": [{"name": name, "value": value} for name, value in {
            "GOCACHE": "/cache/build", "GOMODCACHE": "/cache/mod", "GOPROXY": proxy,
            "GOMAXPROCS": "2", "CGO_ENABLED": "0",
        }.items()],
        "volumeMounts": [{"name": "source", "mountPath": "/source", "readOnly": True},
                         {"name": "cache", "mountPath": "/cache"}]}


def source_fixtures(options, key):
    """Prewarm compilation and serve deterministic protocol responses."""
    compiler = go_container(options.image, "./cmd/console", options.go_proxy)
    compiler["args"].append("--version")
    pod = {"restartPolicy": "Never", "securityContext": {"runAsUser": 65532, "runAsGroup": 65532, "fsGroup": 65532},
        "containers": [compiler], "volumes": compiler_volumes(options.source, options.cache_claim)}
    job = resource("Job", options.cache_claim + "-prewarm", options.namespace,
        spec={"backoffLimit": 1, "template": {"spec": pod}})
    job["apiVersion"] = "batch/v1"
    upstream = go_container(options.image, "./internal/testservices/upstream", options.go_proxy)
    upstream["env"].append({"name": "BILLING_FIXTURE_KEY", "value": key})
    upstream["ports"] = [{"containerPort": 8080}]
    documents = [claim(options.cache_claim, options.namespace, "4Gi"), job]
    upstream_documents = deployment("billing-upstream", options.namespace, upstream, compiler_volumes(options.source, options.cache_claim))
    upstream_documents[0]["spec"]["template"]["spec"]["securityContext"] = pod["securityContext"]
    documents.extend(upstream_documents)
    return documents


def gateway_fixtures(namespace, key, password):
    """Wire the existing gateway resolver to the isolated upstream."""
    profile = {"route": {"nginxConfigMap": f"{namespace}/billing-routes",
        "nginxService": f"{namespace}/billing-upstream", "nginxPort": 8080,
        "auth": {"secretRef": f"{namespace}/billing-upstream-key"}}}
    return [
        resource("ConfigMap", "billing-profile", namespace, data={"profile.yaml": yaml.safe_dump(profile)}),
        resource("ConfigMap", "billing-routes", namespace,
            data={"session_route_llm.conf": 'peers_by_model = {["qwen"]={}}'}),
        resource("Secret", "billing-upstream-key", namespace, stringData={"keys": f"{key}:fixture"}),
        resource("Secret", "billing-credentials", namespace, stringData={
            "postgres-dsn": f"postgres://postgres:{password}@billing-postgres:5432/postgres?sslmode=disable",
            "redis-url": "redis://billing-redis:6379/0",
        }),
    ]


def main():
    """Emit a fixture List that the caller applies to its isolated cluster."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--namespace", required=True)
    parser.add_argument("--source", required=True)
    parser.add_argument("--image", required=True)
    parser.add_argument("--cache-claim", default="billing-compiler-cache")
    parser.add_argument("--credentials-file", type=Path)
    parser.add_argument("--go-proxy", default="https://proxy.golang.org,direct")
    options = parser.parse_args()
    credentials = {"key": secrets.token_hex(24), "password": secrets.token_hex(24)}
    if options.credentials_file:
        if options.credentials_file.exists():
            credentials = json.loads(options.credentials_file.read_text())
        else:
            descriptor = os.open(options.credentials_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, "w") as output:
                json.dump(credentials, output)
    key, password = credentials["key"], credentials["password"]
    documents = database_fixtures(options.namespace, password)
    documents.extend(source_fixtures(options, key))
    documents.extend(gateway_fixtures(options.namespace, key, password))
    json.dump({"apiVersion": "v1", "kind": "List", "items": documents}, sys.stdout)


if __name__ == "__main__":
    main()
