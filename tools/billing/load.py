"""Measure the complete billing pipeline in the dedicated acceptance cluster."""

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
from pathlib import Path
import subprocess
import time
import urllib.request

from client import call


def kubectl(options, *arguments):
    """Run only against the explicitly selected fixture cluster."""
    return subprocess.check_output(["kubectl", "--kubeconfig", str(options.kubeconfig),
        "-n", options.namespace, *arguments], text=True)


def snapshot(options):
    """Capture financial facts and native container resource counters."""
    query = "SELECT (SELECT count(*) FROM billing_requests), (SELECT count(*) FROM billing_events), (SELECT count(*) FROM billing_charges), (SELECT coalesce(sum(amount),0) FROM billing_charges), (SELECT count(*) FROM billing_charges WHERE state != 'settled'), (SELECT count(*) FROM billing_projection WHERE delivered_revision < revision), pg_current_wal_lsn(), (SELECT count(*) FROM billing_ledger WHERE kind='charge'), (SELECT coalesce(sum(amount),0) FROM billing_ledger WHERE kind='charge'), (SELECT count(*) FROM billing_wallets w WHERE w.balance != (SELECT coalesce(sum(l.amount),0) FROM billing_ledger l WHERE l.owner_uid=w.owner_uid))"
    row = kubectl(options, "exec", "deploy/billing-postgres", "--", "psql", "-U", "postgres", "-At", "-c", query).strip().split("|")
    node = json.loads(kubectl(options, "get", "nodes", "-o", "json"))["items"][0]["metadata"]["name"]
    stats = json.loads(kubectl(options, "get", "--raw", f"/api/v1/nodes/{node}/proxy/stats/summary"))
    pods = {pod["podRef"]["name"]: {"cpu": pod.get("cpu", {}), "memory": pod.get("memory", {})}
        for pod in stats["pods"] if pod["podRef"]["namespace"] == options.namespace}
    return {"requests": int(row[0]), "events": int(row[1]), "charges": int(row[2]),
        "amount": int(row[3]), "unsettled": int(row[4]), "unprojected": int(row[5]), "wal": row[6], "debits": int(row[7]), "debit_amount": int(row[8]), "wallet_mismatches": int(row[9]), "pods": pods, "metrics": metrics_snapshot(options)}


def metrics_snapshot(options):
    """Retain raw Prometheus counters for stage and fsync comparisons."""
    result = {}
    for address in options.metrics:
        target = urllib.parse.urlsplit(address)
        if target.scheme != "http" or target.hostname not in ("localhost", "127.0.0.1", "::1") or target.username or target.password:
            raise ValueError("metrics address must use loopback HTTP")
        with urllib.request.urlopen(address, timeout=10) as response:
            result[address] = response.read().decode()
    return result


def invoke(options, keys, index, scheduled):
    """Include scheduling delay in latency so overload remains visible."""
    payload = {"model": "qwen", "messages": [{"role": "user", "content": "acceptance fixture"}]}
    dispatched = time.monotonic()
    result = {"queue_delay": max(0, dispatched - scheduled)}
    try:
        call(options.base[index % len(options.base)], keys[index % len(keys)]["key"],
            "POST", "/v1/chat/completions", payload)
        result["ok"] = True
    except Exception as error:
        result.update(ok=False, error=type(error).__name__)
    finished = time.monotonic()
    result.update(latency=finished - scheduled, roundtrip=finished - dispatched)
    return result


def timing_summary(responses):
    """Separate generator waiting from HTTP round trips; keep quantiles distinct."""
    result = {}
    for name in ("queue_delay", "roundtrip"):
        values = sorted(response[name] for response in responses)
        result[name + "_p95_ms"] = values[max(0, int(len(values) * .95) - 1)] * 1000
        result[name + "_mean_ms"] = sum(values) / len(values) * 1000
    return result


def run_rate(options, keys, rate):
    """Offer a fixed arrival rate, then wait for durable financial convergence."""
    before = snapshot(options)
    started = time.monotonic()
    with ThreadPoolExecutor(max_workers=options.concurrency) as executor:
        futures = []
        for index in range(rate * options.seconds):
            scheduled = started + index / rate
            time.sleep(max(0, scheduled - time.monotonic()))
            futures.append(executor.submit(invoke, options, keys, index, scheduled))
        responses = [future.result() for future in as_completed(futures)]
    elapsed = time.monotonic() - started
    successful = sum(response["ok"] for response in responses)
    if successful != rate * options.seconds:
        failures = [response.get("error") for response in responses if not response["ok"]]
        raise RuntimeError(f"load failed: {len(failures)} HTTP failures: {sorted(set(failures))}")
    after = wait_settled(options, before, successful)
    latencies = sorted(response["latency"] for response in responses)
    result = {"offered_qps": rate, "seconds": options.seconds, "completed_qps": successful / elapsed,
        "success": successful, "failed": len(responses) - successful, "p95_ms": latencies[int(len(latencies) * .95) - 1] * 1000,
        "p99_ms": latencies[int(len(latencies) * .99) - 1] * 1000, "drain_seconds": time.monotonic() - started - elapsed,
        "before": before, "after": after}
    result.update(timing_summary(responses))
    print(json.dumps({key: value for key, value in result.items() if key not in ("before", "after")}), flush=True)
    return result


def accounting_complete(after, before, successful):
    """Wait for terminal and financial facts, not only the start-created row."""
    return all(after[name] - before[name] == expected for name, expected in
        (("requests", successful), ("events", successful * 2), ("charges", successful), ("debits", successful)))


def wait_settled(options, before, successful):
    """Drain asynchronous consumers and check immutable financial invariants."""
    deadline = time.monotonic() + options.drain_timeout
    while True:
        after = snapshot(options)
        if accounting_complete(after, before, successful) and not after["unsettled"] and not after["unprojected"]:
            break
        if time.monotonic() > deadline:
            raise RuntimeError("billing pipeline did not converge before drain timeout")
        time.sleep(2)
    assert after["events"] - before["events"] == successful * 2, "missing or duplicate event facts"
    assert after["charges"] - before["charges"] == successful, "missing or duplicate charges"
    assert after["amount"] - before["amount"] == successful * options.expected_cost, "incorrect exact charge sum"
    assert after["debits"] - before["debits"] == successful, "missing or duplicate immutable debits"
    assert after["debit_amount"] - before["debit_amount"] == -successful * options.expected_cost, "incorrect immutable debit sum"
    assert after["wallet_mismatches"] == 0, "wallet projection differs from immutable ledger"
    return after


def main():
    """Require private fixture credentials and an explicit result destination."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--kubeconfig", type=Path, required=True)
    parser.add_argument("--state", type=Path, required=True)
    parser.add_argument("--base", action="append", required=True)
    parser.add_argument("--metrics", action="append", default=[])
    parser.add_argument("--namespace", default="billing-acceptance")
    parser.add_argument("--rate", type=int, action="append", required=True)
    parser.add_argument("--seconds", type=int, default=15)
    parser.add_argument("--concurrency", type=int, default=64)
    parser.add_argument("--drain-timeout", type=int, default=300)
    parser.add_argument("--expected-cost", type=int, required=True)
    parser.add_argument("--output", type=Path, required=True)
    options = parser.parse_args()
    if options.seconds <= 0 or options.concurrency <= 0 or options.drain_timeout <= 0 or options.expected_cost <= 0 or any(rate <= 0 for rate in options.rate):
        parser.error("rates, duration, concurrency, drain timeout and expected cost must be positive")
    context = kubectl(options, "config", "current-context").strip()
    if context != "kind-console-billing-acceptance":
        parser.error("load testing requires the dedicated billing acceptance cluster")
    state = json.loads(options.state.read_text())
    keys = list(state["keys"].values())
    if not keys:
        parser.error("seed at least one fixture key before loading")
    results = []
    for rate in options.rate:
        results.append(run_rate(options, keys, rate))
        options.output.write_text(json.dumps({"users": len(keys), "runs": results}, indent=2))


if __name__ == "__main__":
    main()
