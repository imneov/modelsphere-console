"""Fund real fixture users and issue their keys through authorized Console APIs."""

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import os
from pathlib import Path
import subprocess
import threading

from client import call


def persist(path, state):
    """Keep test credentials private and replace the checkpoint atomically."""
    temporary = path.with_suffix(".next")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, "w") as output:
        json.dump(state, output)
    temporary.replace(path)


def fund(base, token, name, uid):
    """Reuse one business reference for every retry of a fixture top-up."""
    return call(base, token, "POST", "/api/billing/credits", {
        "operationID": "acceptance-fund/" + uid, "user": name, "principalUID": uid,
        "currency": "USD", "amount": "1000000000", "kind": "topup",
    })


def seed_user(index, user, options, state, lock):
    """Record a top-up and a one-time key, then checkpoint its response."""
    name, uid = user["metadata"]["name"], user["metadata"]["uid"]
    with lock:
        if uid in state["keys"]:
            return
    base = options.base[index % len(options.base)]
    fund(base, state["adminToken"], name, uid)
    key = call(base, state["adminToken"], "POST", "/api/router/apikeys", {
        "name": "acceptance-load", "user": name, "principalUID": uid,
        "expiresInDays": 0, "models": ["qwen"],
    })
    if not key["key"].startswith("sk-"):
        raise RuntimeError("issued key does not follow the Global credential format")
    with lock:
        state["keys"][uid] = {"name": name, "uid": uid, "key": key["key"], "id": key["id"]}
        persist(options.state, state)


def seed(options, state):
    """Read authoritative User UIDs and seed both gateway replicas."""
    command = ["kubectl", "--kubeconfig", str(options.kubeconfig), "get", "users",
        "-l", "console.modelsphere.io/billing-acceptance=true", "-o", "json"]
    users = json.loads(subprocess.check_output(command))["items"]
    users.sort(key=lambda user: user["metadata"]["name"])
    admin = json.loads(subprocess.check_output(["kubectl", "--kubeconfig", str(options.kubeconfig),
        "get", "user", "admin", "-o", "json"]))
    fund(options.base[0], state["adminToken"], "admin", admin["metadata"]["uid"])
    call(options.base[0], state["adminToken"], "PUT", "/api/billing/prices", {
        "model": "qwen", "priceVersion": "acceptance-v1", "currency": "USD",
        "unitTokens": 1000000, "inputRate": "1000000000",
        "cacheRate": "250000000", "outputRate": "2000000000",
    })
    lock = threading.Lock()
    with ThreadPoolExecutor(max_workers=20) as executor:
        futures = [executor.submit(seed_user, index, user, options, state, lock)
            for index, user in enumerate(users)]
        for completed, future in enumerate(as_completed(futures), 1):
            future.result()
            if completed % 100 == 0:
                print(f"Funded users and issued keys: {completed}/{len(users)}", flush=True)


def main():
    """Resume an existing fixture state; never issue keys into another cluster."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--kubeconfig", type=Path, required=True)
    parser.add_argument("--state", type=Path, required=True)
    parser.add_argument("--base", action="append", required=True)
    options = parser.parse_args()
    context = subprocess.check_output(["kubectl", "--kubeconfig", str(options.kubeconfig),
        "config", "current-context"], text=True).strip()
    if context != "kind-console-billing-acceptance":
        parser.error("seeding requires the dedicated billing acceptance cluster")
    state = json.loads(options.state.read_text())
    state.setdefault("keys", {})
    seed(options, state)
    print("Seed complete:", len(state["keys"]), "users", flush=True)


if __name__ == "__main__":
    main()
