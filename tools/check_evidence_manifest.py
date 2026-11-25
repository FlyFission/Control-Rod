#!/usr/bin/env python3
"""Check the evidence-manifest convention for change records.

Existing records keep their payloads in git and have no manifest: they pass.
A record with evidence/manifest.json passes when every row names a relative
path and a 64-hex SHA-256, even if the payload is not in git.
A record that cites an evidence file which is neither in the tree nor in a
manifest fails. That is the manifest-less, git-absent case.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

CITED = re.compile(r"`(evidence/[^`\s]+)`")
DIGEST = re.compile(r"^[0-9a-f]{64}$")


def check_manifest(record: Path, manifest_path: Path) -> list[str]:
    try:
        parsed = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return [f"{record.name}: evidence/manifest.json cannot be read ({exc})"]
    if not isinstance(parsed, dict):
        return [f"{record.name}: evidence/manifest.json is not an object"]
    store = parsed.get("store")
    files = parsed.get("files")
    problems: list[str] = []
    if not isinstance(store, str) or not store.strip():
        problems.append(f"{record.name}: manifest has no store to restore from")
    if not isinstance(files, list) or not files:
        problems.append(f"{record.name}: manifest lists no files")
        return problems
    for row in files:
        if not isinstance(row, dict):
            problems.append(f"{record.name}: manifest file row is not an object")
            continue
        rel = row.get("path")
        digest = row.get("sha256")
        if not isinstance(rel, str) or not rel or rel.startswith("/") or ".." in Path(rel).parts:
            problems.append(f"{record.name}: manifest path is empty, absolute, or walks upward")
            continue
        if not isinstance(digest, str) or not DIGEST.fullmatch(digest):
            problems.append(f"{record.name}: {rel} has no 64-hex SHA-256 digest")
    return problems


def cited_missing(record: Path) -> list[str]:
    missing: list[str] = []
    for md in record.glob("*.md"):
        text = md.read_text(encoding="utf-8", errors="replace")
        for match in CITED.finditer(text):
            rel = match.group(1)
            if any(ch in rel for ch in "*?[]") or rel.endswith("/"):
                continue
            if not (record / rel).is_file():
                missing.append(rel)
    return missing


def check_tree(root: Path) -> list[str]:
    problems: list[str] = []
    if not root.is_dir():
        return [f"{root} is not a changes directory"]
    for record in sorted(p for p in root.iterdir() if p.is_dir()):
        manifest = record / "evidence" / "manifest.json"
        if manifest.is_file():
            problems.extend(check_manifest(record, manifest))
            continue
        for rel in cited_missing(record):
            problems.append(f"{record.name}: cites `{rel}` which is not in git and has no manifest row")
    return problems


def main(argv: list[str]) -> int:
    root = Path(argv[1]) if len(argv) > 1 else Path(".nuclear/changes")
    problems = check_tree(root)
    if problems:
        for line in problems:
            print(f"FAIL  {line}")
        return 1
    print(f"OK  {root}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
