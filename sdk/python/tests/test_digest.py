import pytest

from controlrod import FloatNotAllowedError, canonical_sha256

# The shared vector: sha256 of the canonical bytes {"a":"x","b":1}. Checked in every language.
SHARED_VECTOR = "cdab067e9f3beb32d1252cfd63e492592fecbf591b0d08cadb24bb17f3864246"


def test_shared_vector() -> None:
    assert canonical_sha256('{"b":1,"a":"x"}') == SHARED_VECTOR


def test_key_order_does_not_matter() -> None:
    a = canonical_sha256('{"b":1,"a":"x","c":{"z":true,"y":null}}')
    b = canonical_sha256('{ "c": {"y": null, "z": true}, "a": "x", "b": 1 }')
    assert a == b


def test_floats_are_refused() -> None:
    with pytest.raises(FloatNotAllowedError) as err:
        canonical_sha256('{"exports":[{"value":42.5}]}')
    assert err.value.pointer == "/exports/0/value"


def test_non_ascii_keys_sort_by_utf16() -> None:
    # RFC 8785 sorts by UTF-16 code units; this matches the Rust and Go implementations.
    assert canonical_sha256('{"é":1,"z":2}') == canonical_sha256('{"z":2,"é":1}')
