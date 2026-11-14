"""Exercise durable replay and failover only in the disposable billing cluster."""

import argparse
import json
from pathlib import Path
import time

from client import call
from load import invoke, kubectl, snapshot, wait_settled


def scale(options, deployment, replicas):
    """Change fixture availability, never edit application CRD data."""
    kubectl(options, "scale", "deployment/" + deployment, "--replicas=" + str(replicas))
    if replicas:
        kubectl(options, "rollout", "status", "deployment/" + deployment, "--timeout=180s")
    else:
        workload = json.loads(kubectl(options, "get", "deployment/" + deployment, "-o", "json"))
        labels = workload["spec"]["selector"]["matchLabels"]
        selector = ",".join(key + "=" + value for key, value in labels.items())
        kubectl(options, "wait", "--for=delete", "pod", "-l", selector, "--timeout=90s")


def generate(options, keys, count):
    """Require inference to succeed while downstream infrastructure is absent."""
    for index in range(count):
        response = invoke(options, keys, index, time.monotonic())
        if not response["ok"]:
            raise RuntimeError("inference failed during fixture outage: " + response["error"])


def outage(options, keys, deployment, count):
    """Recover durable events and assert exactly one charge/debit per response."""
    before = snapshot(options)
    scale(options, deployment, 0)
    try:
        generate(options, keys, count)
    finally:
        scale(options, deployment, 1)
    after = wait_settled(options, before, count)
    return {"scenario": deployment + "-outage", "requests": count, "before": before, "after": after}


def gateway_takeover(options, keys, count):
    """Restart a journal owner while Redis is absent, retaining its claim."""
    before = snapshot(options)
    scale(options, "billing-redis", 0)
    try:
        journal_before = journal_bytes(options, "billing-console-0")
        generate(options, keys, count)
        if journal_bytes(options, "billing-console-0") <= journal_before:
            raise RuntimeError("no durable fixture events reached the journal owner being replaced")
        kubectl(options, "delete", "pod", "billing-console-0", "--wait=true")
        kubectl(options, "wait", "--for=condition=Ready", "pod/billing-console-0", "--timeout=180s")
    finally:
        scale(options, "billing-redis", 1)
    after = wait_settled(options, before, count)
    return {"scenario": "gateway-journal-pvc-takeover", "requests": count, "before": before, "after": after}


def journal_bytes(options, pod):
    """Verify that the replaced owner actually recorded undelivered facts."""
    sizes = kubectl(options, "exec", pod, "--", "find", options.journal_directory,
        "-type", "f", "-name", "*.wal", "-exec", "stat", "-c", "%s", "{}", "+")
    return sum(int(size) for size in sizes.split())


def leader_takeover(options, keys, count):
    """Remove the elected process and require a newer database fence."""
    before = snapshot(options)
    query = "SELECT generation FROM billing_fence WHERE singleton=1"
    old = kubectl(options, "exec", "deploy/billing-postgres", "--", "psql", "-U", "postgres", "-At", "-c", query).strip()
    lease = json.loads(kubectl(options, "get", "lease", "console-billing-settlement", "-o", "json"))
    holder = lease["spec"]["holderIdentity"]
    pods = json.loads(kubectl(options, "get", "pods", "-o", "json"))["items"]
    matches = [pod["metadata"]["name"] for pod in pods if holder.startswith(pod["metadata"]["name"])]
    if len(matches) != 1:
        raise RuntimeError("cannot resolve the elected fixture process")
    kubectl(options, "delete", "pod", matches[0], "--wait=false")
    generate(options, keys, count)
    after = wait_settled(options, before, count)
    current = kubectl(options, "exec", "deploy/billing-postgres", "--", "psql", "-U", "postgres", "-At", "-c", query).strip()
    if int(current) <= int(old):
        raise RuntimeError("settlement takeover did not advance its database fence")
    return {"scenario": "settlement-leader-takeover", "requests": count, "fence_before": int(old), "fence_after": int(current), "before": before, "after": after}


def publish_price(options, version, multiplier):
    """Publish immutable versions through the same management API as the UI."""
    state = json.loads(options.state.read_text())
    call(options.base[0], state["adminToken"], "PUT", "/api/billing/prices", {
        "model": "qwen", "priceVersion": version, "currency": "USD", "unitTokens": 1000000,
        "inputRate": str(1000000000 * multiplier), "cacheRate": str(250000000 * multiplier),
        "outputRate": str(2000000000 * multiplier)})


def price_change(options, keys, count):
    """A delayed consumer uses its first current price and preserves older charges."""
    before = snapshot(options)
    original_cost = options.expected_cost
    scale(options, "billing-console-billing-usage", 0)
    try:
        generate(options, keys, count)
        publish_price(options, "acceptance-v2", 2)
    finally:
        scale(options, "billing-console-billing-usage", 2)
    options.expected_cost = original_cost * 2
    try:
        after = wait_settled(options, before, count)
    finally:
        options.expected_cost = original_cost
        publish_price(options, "acceptance-v3", 1)
    state = json.loads(options.state.read_text())
    history = call(options.base[0], state["adminToken"], "GET", "/api/billing/prices/history?page=1&limit=20&model=qwen")
    versions = {price["priceVersion"] for price in history["items"]}
    if not {"acceptance-v1", "acceptance-v2", "acceptance-v3"}.issubset(versions):
        raise RuntimeError("immutable published price history is incomplete")
    return {"scenario": "first-consumer-price-and-history", "requests": count,
        "versions": sorted(versions), "before": before, "after": after}


def main():
    """Use explicit fixture state and checkpoint each completed scenario."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--kubeconfig", type=Path, required=True)
    parser.add_argument("--state", type=Path, required=True)
    parser.add_argument("--base", action="append", required=True)
    parser.add_argument("--namespace", default="billing-acceptance")
    parser.add_argument("--journal-directory", default="/var/lib/console/billing")
    parser.add_argument("--scenario", choices=["redis", "postgres", "gateway", "leader", "price"], action="append", required=True)
    parser.add_argument("--count", type=int, default=20)
    parser.add_argument("--drain-timeout", type=int, default=300)
    parser.add_argument("--expected-cost", type=int, required=True)
    parser.add_argument("--output", type=Path, required=True)
    options = parser.parse_args()
    options.metrics = []
    if kubectl(options, "config", "current-context").strip() != "kind-console-billing-acceptance":
        parser.error("fault testing requires the dedicated billing acceptance cluster")
    if options.count < 1 or options.drain_timeout < 1 or options.expected_cost < 1:
        parser.error("count, timeout and expected cost must be positive")
    keys = list(json.loads(options.state.read_text())["keys"].values())
    if not keys:
        parser.error("seed fixture keys first")
    scenarios = {"redis": lambda: outage(options, keys, "billing-redis", options.count),
        "postgres": lambda: outage(options, keys, "billing-postgres", options.count),
        "gateway": lambda: gateway_takeover(options, keys, options.count),
        "leader": lambda: leader_takeover(options, keys, options.count),
        "price": lambda: price_change(options, keys, options.count)}
    results = []
    for scenario in options.scenario:
        results.append(scenarios[scenario]())
        options.output.write_text(json.dumps(results, indent=2))
        print("Passed:", results[-1]["scenario"], flush=True)


if __name__ == "__main__":
    main()
