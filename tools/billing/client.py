"""HTTP client helpers for the isolated billing acceptance environment."""

import json
import threading
import urllib.error
import urllib.request
from urllib.parse import urlsplit

_thread_clients = threading.local()


def http_client():
    """Reuse per-thread handlers without routing loopback credentials through proxies."""
    client = getattr(_thread_clients, "opener", None)
    if client is None:
        client = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect)
        _thread_clients.opener = client
    return client


class NoRedirect(urllib.request.HTTPRedirectHandler):
    """Fixture credentials must never be redirected to another destination."""

    def redirect_request(self, request, response, code, message, headers, new_url):
        raise RuntimeError("acceptance HTTP redirects are disabled")


def call(base, token, method, path, payload=None):
    """Call Console's public API without printing credentials or response bodies."""
    target = urlsplit(base)
    if target.scheme != "http" or target.hostname not in ("127.0.0.1", "localhost", "::1") or target.username or target.password or target.path not in ("", "/") or target.query or target.fragment:
        raise ValueError("acceptance base must be a loopback HTTP origin")
    if not path.startswith("/") or path.startswith("//"):
        raise ValueError("acceptance API path must be relative to its origin")
    headers = {"Authorization": "Bearer " + token, "Content-Type": "application/json"}
    body = None if payload is None else json.dumps(payload).encode()
    request = urllib.request.Request(base + path, data=body, headers=headers, method=method)
    with http_client().open(request, timeout=60) as response:
        content = response.read()
        return json.loads(content) if content else None
