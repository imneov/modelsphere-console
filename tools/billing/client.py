"""HTTP client helpers for the isolated billing acceptance environment."""

import json
import urllib.error
import urllib.request


def call(base, token, method, path, payload=None):
    """Call Console's public API without printing credentials or response bodies."""
    headers = {"Authorization": "Bearer " + token, "Content-Type": "application/json"}
    body = None if payload is None else json.dumps(payload).encode()
    request = urllib.request.Request(base + path, data=body, headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=60) as response:
        content = response.read()
        return json.loads(content) if content else None
