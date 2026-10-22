"""Canonical digests of Control Rod records (RFC 8785).

Matches the Rust kernel and Go daemon byte for byte. Non-integer numbers are refused:
engineering values must be decimal strings with units.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any


class FloatNotAllowedError(ValueError):
    """A non-integer number was found; use a decimal string with units."""

    def __init__(self, pointer: str) -> None:
        super().__init__(f"non-integer number at {pointer}: use a decimal string with units")
        self.pointer = pointer


def _reject_floats(value: Any, pointer: str = "") -> None:
    if isinstance(value, float):
        raise FloatNotAllowedError(pointer or "/")
    if isinstance(value, list):
        for i, item in enumerate(value):
            _reject_floats(item, f"{pointer}/{i}")
    elif isinstance(value, dict):
        for key, item in value.items():
            escaped = key.replace("~", "~0").replace("/", "~1")
            _reject_floats(item, f"{pointer}/{escaped}")


def _canonical(value: Any) -> str:
    """RFC 8785 for records without floats: sorted keys by UTF-16 code units, no whitespace."""
    if isinstance(value, dict):
        items = sorted(value.items(), key=lambda kv: kv[0].encode("utf-16-be"))
        members = (json.dumps(k, ensure_ascii=False) + ":" + _canonical(v) for k, v in items)
        return "{" + ",".join(members) + "}"
    if isinstance(value, list):
        return "[" + ",".join(_canonical(v) for v in value) + "]"
    return json.dumps(value, ensure_ascii=False)


def canonical_sha256(json_text: str) -> str:
    """Return the lowercase hex SHA-256 of the RFC 8785 canonical form of ``json_text``."""
    value = json.loads(json_text)
    _reject_floats(value)
    return hashlib.sha256(_canonical(value).encode("utf-8")).hexdigest()
