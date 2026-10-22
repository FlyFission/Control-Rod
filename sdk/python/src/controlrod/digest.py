"""Canonical digests of Control Rod records (RFC 8785).

Matches the Rust kernel and Go daemon byte for byte. RFC 8785 alone leaves room for
implementations to disagree, so every implementation enforces the same profile and is tested
against ``spec/vectors/canonical-digest.json``:

- numbers are integers with ``|n| <= 2**53 - 1`` (no fractions, exponents or negative zero);
  engineering values are decimal strings with units;
- no object has the same key twice;
- containers nest at most ``MAX_DEPTH`` deep.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

MAX_SAFE_INTEGER = 2**53 - 1
MAX_DEPTH = 64


class DigestError(ValueError):
    """A record could not be digested. ``pointer`` is a JSON pointer; ``/`` is the root."""

    def __init__(self, message: str, pointer: str = "/") -> None:
        super().__init__(message)
        self.pointer = pointer


class InvalidJSONError(DigestError):
    """The input was not valid JSON."""


class NumberNotAllowedError(DigestError):
    """A number that is not an integer within +/-(2**53 - 1); use a decimal string with units."""


class DuplicateKeyError(DigestError):
    """An object repeats a key."""


class TooDeepError(DigestError):
    """A container nests deeper than ``MAX_DEPTH``."""


class _BadNumber:
    """Stands in for a number outside the profile until its pointer is known."""


class _Pairs(list[tuple[str, Any]]):
    """An object's members in document order, duplicates kept so they can be reported."""


_BAD = _BadNumber()


def _parse_int(text: str) -> int | _BadNumber:
    # JSON forbids leading zeros, so "-0" is the only spelling of negative zero.
    if text == "-0" or len(text.lstrip("-")) > len(str(MAX_SAFE_INTEGER)):
        return _BAD
    return int(text)


def _parse_constant(name: str) -> None:
    raise InvalidJSONError(f"{name} is not JSON")


def _check(value: Any, pointer: str, depth: int) -> Any:
    """Return ``value`` as plain dicts and lists, or raise the first violation in document order."""
    at = pointer or "/"
    unsafe_int = (
        isinstance(value, int) and not isinstance(value, bool) and abs(value) > MAX_SAFE_INTEGER
    )
    if value is _BAD or isinstance(value, float) or unsafe_int:
        message = f"number at {at} is not a safe integer: use a decimal string with units"
        raise NumberNotAllowedError(message, at)
    if isinstance(value, (list, _Pairs)) and depth >= MAX_DEPTH:
        raise TooDeepError(f"container at {at} nests deeper than {MAX_DEPTH}", at)
    if isinstance(value, _Pairs):
        out: dict[str, Any] = {}
        for key, item in value:
            child = pointer + "/" + key.replace("~", "~0").replace("/", "~1")
            if key in out:
                raise DuplicateKeyError(f"duplicate key at {child}", child)
            out[key] = _check(item, child, depth + 1)
        return out
    if isinstance(value, list):
        return [_check(item, f"{pointer}/{i}", depth + 1) for i, item in enumerate(value)]
    return value


def _canonical(value: Any) -> str:
    """RFC 8785 for checked values: keys sorted by UTF-16 code units, no whitespace."""
    if isinstance(value, dict):
        items = sorted(value.items(), key=lambda kv: kv[0].encode("utf-16-be"))
        members = (json.dumps(k, ensure_ascii=False) + ":" + _canonical(v) for k, v in items)
        return "{" + ",".join(members) + "}"
    if isinstance(value, list):
        return "[" + ",".join(_canonical(v) for v in value) + "]"
    return json.dumps(value, ensure_ascii=False)


def canonical_sha256(json_text: str) -> str:
    """Return the lowercase hex SHA-256 of the RFC 8785 canonical form of ``json_text``."""
    try:
        parsed = json.loads(
            json_text,
            object_pairs_hook=_Pairs,
            parse_int=_parse_int,
            parse_float=lambda _text: _BAD,
            parse_constant=_parse_constant,
        )
    except DigestError:
        raise
    except (ValueError, RecursionError) as err:
        raise InvalidJSONError(f"invalid JSON: {err}") from err
    checked = _check(parsed, "", 0)
    try:
        # Key sorting and the final encode both reach every string, keys included.
        data = _canonical(checked).encode("utf-8")
    except UnicodeEncodeError as err:  # a lone surrogate such as "\ud800", in a key or value
        raise InvalidJSONError(f"invalid JSON string: {err}") from err
    return hashlib.sha256(data).hexdigest()
