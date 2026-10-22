import hashlib
import json
from pathlib import Path

import pytest

from controlrod import digest
from controlrod.digest import (
    MAX_DEPTH,
    MAX_SAFE_INTEGER,
    DuplicateKeyError,
    InvalidJSONError,
    NumberNotAllowedError,
    TooDeepError,
    canonical_sha256,
)

VECTORS = json.loads(
    (Path(__file__).resolve().parents[3] / "spec" / "vectors" / "canonical-digest.json").read_text(
        encoding="utf-8"
    )
)
ERRORS = {
    "number": NumberNotAllowedError,
    "duplicate_key": DuplicateKeyError,
    "depth": TooDeepError,
    "invalid_json": InvalidJSONError,
}


def test_profile_constants_match_the_vector_file() -> None:
    assert VECTORS["max_safe_integer"] == MAX_SAFE_INTEGER
    assert VECTORS["max_depth"] == MAX_DEPTH


@pytest.mark.parametrize("case", VECTORS["valid"], ids=lambda c: c["name"])
def test_valid_vectors_hash_their_canonical_form(case: dict[str, str]) -> None:
    expected = hashlib.sha256(case["canonical"].encode("utf-8")).hexdigest()
    assert canonical_sha256(case["input"]) == expected


@pytest.mark.parametrize("case", VECTORS["invalid"], ids=lambda c: c["name"])
def test_invalid_vectors_are_refused_with_the_named_error(case: dict[str, str]) -> None:
    with pytest.raises(ERRORS[case["error"]]) as err:
        canonical_sha256(case["input"])
    if "pointer" in case:
        assert err.value.pointer == case["pointer"]


def test_all_errors_share_a_base_class() -> None:
    for error in ERRORS.values():
        assert issubclass(error, digest.DigestError)
