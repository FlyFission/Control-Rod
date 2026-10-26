"""Validate this specification packet, not proposed product behavior."""

import argparse
import hashlib
import json
from pathlib import Path
import re


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write-inventory", action="store_true")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[3]
    packet = root / ".nuclear/changes/overlay-themes"
    spec = root / "docs/superpowers/specs/2026-10-25-overlay-themes-design.md"
    catalog = root / "docs/superpowers/specs/2026-10-25-overlay-themes-catalog.md"
    plan = root / "docs/superpowers/plans/2026-10-25-overlay-themes.md"
    files = sorted(packet.glob("*.md")) + [spec, catalog, plan, root / "docs/README.md", root / 'docs/overlay-themes/user-guide.md', root / 'docs/overlay-themes/asset-workflow.md']
    errors = []
    for path in files:
        content = path.read_text()
        for target in re.findall(r"\]\(([^)]+)\)", content):
            if "://" not in target and not target.startswith("#"):
                if not (path.parent / target.split("#")[0]).exists():
                    errors.append(f"{path.name}: unresolved link {target}")
        if re.search(r"\b(?:TODO|TBD|FIXME)\b", content):
            errors.append(f"{path.name}: unresolved placeholder")
        for number, line in enumerate(content.splitlines(), 1):
            if line.rstrip() != line:
                errors.append(f"{path.name}:{number}: trailing whitespace")
        if not content.endswith("\n"):
            errors.append(f"{path.name}: missing final newline")
    spec_text, catalog_text, plan_text = [p.read_text() for p in (spec, catalog, plan)]
    for number in range(1, 16):
        for token in (f"OT-{number:02}", f"AC-{number:02}"):
            if token not in spec_text:
                errors.append(f"Missing specification ID {token}")
        if not re.search(rf"^\| OT-{number:02} \|", plan_text, re.MULTILINE):
            errors.append(f"Missing plan coverage OT-{number:02}")
    tasks = re.findall(r"^## Task (\d+):", plan_text, re.MULTILINE)
    if tasks != [str(n) for n in range(1, 14)]:
        errors.append("Expected tasks 1–13 exactly once and in order")
    entries = re.findall(r"^## (\d+)\. ", catalog_text, re.MULTILINE)
    if entries != [str(n) for n in range(1, 16)]:
        errors.append("Expected catalog entries 1–15 exactly once and in order")
    ids = re.findall(r"\. ID `([a-z-]+)`\.", catalog_text)
    if len(ids) != 15 or len(set(ids)) != 15:
        errors.append("Expected fifteen distinct catalog IDs")
    for pack_id in ids:
        if pack_id not in plan_text:
            errors.append(f"Missing task for catalog ID {pack_id}")
    if re.search(r"^- \[[xX]\]", plan_text, re.MULTILINE):
        errors.append("Implementation steps must remain unchecked")
    print(f"Checked {len(files)} Markdown files, {len(ids)} pack IDs, 15 requirement/scenario pairs, {len(tasks)} tasks.")
    if errors:
        print("\n".join(errors))
        raise SystemExit(1)
    print("PASS: local links, catalog, requirement coverage, task sequence, unchecked status and whitespace.")
    if args.write_inventory:
        evidence = packet / "evidence"
        evidence.mkdir(exist_ok=True)
        inventory = {
            "baseline": "465b084a04c6a99bb80c29aa890146eea5a55bd1",
            "scope": "documentation identity only; no product test or rights clearance",
            "files": [
                {"path": str(p.relative_to(root)), "bytes": p.stat().st_size,
                 "sha256": hashlib.sha256(p.read_bytes()).hexdigest()}
                for p in files + [Path(__file__).resolve()]
            ],
        }
        (evidence / "document-inventory.json").write_text(json.dumps(inventory, indent=2) + "\n")
        print("Wrote evidence/document-inventory.json with actual SHA-256 hashes.")


if __name__ == "__main__":
    main()
