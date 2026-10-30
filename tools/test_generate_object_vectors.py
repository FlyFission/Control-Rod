"""Tests for tools/generate_object_vectors.py."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

import generate_object_vectors as gen  # noqa: E402


class ObjectVectorTests(unittest.TestCase):
    def test_committed_vectors_are_current(self) -> None:
        r = subprocess.run([sys.executable, "-I", str(ROOT / "tools" / "generate_object_vectors.py"), "--check"],
                           capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_each_vector_hashes_its_canonical_form(self) -> None:
        doc = json.loads(gen.OUT.read_text(encoding="utf-8"))
        for v in doc["vectors"]:
            with self.subTest(v["type"]):
                self.assertEqual(v["canonical"], gen.canonical(v["body"]))
                self.assertEqual(v["sha256"], hashlib.sha256(v["canonical"].encode("utf-8")).hexdigest())

    def test_canonical_form_sorts_keys_and_drops_whitespace(self) -> None:
        self.assertEqual(gen.canonical({"b": 1, "a": {"d": [True, None], "c": "x"}}), '{"a":{"c":"x","d":[true,null]},"b":1}')

    def test_examples_stay_inside_the_safe_subset(self) -> None:
        def walk(value: object) -> None:
            if isinstance(value, float):
                self.fail("floats are outside the subset where sorted JSON equals RFC 8785")
            if isinstance(value, int) and not isinstance(value, bool):
                self.assertLessEqual(abs(value), 2**53 - 1)
            for child in (value.values() if isinstance(value, dict) else value if isinstance(value, list) else []):
                walk(child)
        for body in gen.EXAMPLES.values():
            walk(body)


if __name__ == "__main__":
    unittest.main()
