"""HTTP access to public services, with a citation for every response.

Every call has a timeout. A failure returns an error record that callers turn into a hold;
nothing downstream may guess a value in its place. Tests replace the transport with recorded
or documented-shape fixtures so no test touches the network.
"""

from __future__ import annotations

import hashlib
import json
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime

Transport = Callable[[str, dict, float], bytes]

TIMEOUT_S = 30.0
RETRIES = 1  # one retry after a transport failure; a second failure is a hold
USER_AGENT = "control-rod-cr-site/0.1 (+https://github.com/FlyFission/control-rod)"


def _urllib_transport(url: str, params: dict, timeout: float) -> bytes:
    full = url + ("?" + urllib.parse.urlencode(params) if params else "")
    if not full.startswith("https://"):
        raise ValueError("only https sources are allowed")
    req = urllib.request.Request(full, headers={"User-Agent": USER_AGENT})  # noqa: S310 - https only, checked above
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 - https only, checked above
        return resp.read()


@dataclass
class Fetcher:
    """Calls services and keeps a citation for each response."""

    transport: Transport = _urllib_transport
    timeout: float = TIMEOUT_S
    clock: Callable[[], datetime] = field(default=lambda: datetime.now(UTC))
    log: list[dict] = field(default_factory=list)

    def get_json(self, source: str, url: str, params: dict) -> tuple[dict | None, dict]:
        """Returns (parsed JSON or None, citation). The citation records failures too."""
        at = self.clock().strftime("%Y-%m-%dT%H:%M:%SZ")
        cite: dict = {"source": source, "url": url, "query": dict(params), "retrieved_at": at}
        body = None
        for attempt in range(RETRIES + 1):
            try:
                body = self.transport(url, params, self.timeout)
                break
            except (urllib.error.URLError, TimeoutError, OSError) as e:
                cite["error"] = f"{type(e).__name__}: {e}"
                cite["attempts"] = attempt + 1
            except ValueError as e:
                cite["error"] = f"{type(e).__name__}: {e}"
                break
        if body is None:
            self.log.append(cite)
            return None, cite
        cite.pop("error", None)
        cite["sha256"] = hashlib.sha256(body).hexdigest()
        cite["bytes"] = len(body)
        try:
            data = json.loads(body)
        except json.JSONDecodeError as e:
            cite["error"] = f"response is not JSON: {e}"
            self.log.append(cite)
            return None, cite
        if isinstance(data, dict) and "error" in data and "features" not in data:
            cite["error"] = f"service error: {json.dumps(data['error'])[:300]}"
            self.log.append(cite)
            return None, cite
        self.log.append(cite)
        return data, cite


def public_citation(cite: dict) -> dict:
    """The citation as it appears on a fact: no response bytes, only their digest."""
    keep = ("source", "url", "query", "retrieved_at", "sha256")
    return {k: cite[k] for k in keep if k in cite}
