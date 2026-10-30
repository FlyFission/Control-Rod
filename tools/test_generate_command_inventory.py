"""Tests for tools/generate_command_inventory.py."""

from __future__ import annotations

import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

import generate_command_inventory as gen  # noqa: E402


class CommandInventoryTests(unittest.TestCase):
    def test_committed_inventory_is_current(self) -> None:
        r = subprocess.run([sys.executable, "-I", str(ROOT / "tools" / "generate_command_inventory.py"), "--check"],
                           capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_every_catalog_command_is_executed_somewhere(self) -> None:
        self.assertNotIn("| unused |", gen.build())

    def test_the_lease_sweep_timer_is_traced(self) -> None:
        row = next(line for line in gen.build().splitlines() if line.startswith("| `run.sweep-lost`"))
        self.assertIn("timer (lease sweep)", row)


if __name__ == "__main__":
    unittest.main()
