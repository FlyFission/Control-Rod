"""Checks the red-team catalog is well formed. Run: uv run --with pyyaml python tools/check_redteam.py"""

import pathlib
import sys

import yaml

REQUIRED = {"id", "title", "attempt", "expected", "status"}
catalog = yaml.safe_load(pathlib.Path("tests/redteam/catalog.yaml").read_text())
errors, seen = [], set()
for case in catalog["cases"]:
    missing = REQUIRED - case.keys()
    if missing:
        errors.append(f"{case.get('id', '?')}: missing {sorted(missing)}")
    if case.get("id") in seen:
        errors.append(f"{case['id']}: duplicate id")
    seen.add(case.get("id"))
    if case.get("status") not in {"pending", "active"}:
        errors.append(f"{case.get('id')}: status must be pending or active")
if errors:
    sys.exit("\n".join(errors))
active = sum(c["status"] == "active" for c in catalog["cases"])
print(f"{len(seen)} red-team cases ({active} active, {len(seen) - active} pending)")
