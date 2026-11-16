"""Keep the root agent guide a map (pattern note PL6, docs/patterns/plannotator.md).

AGENTS.md is read whole by every agent on every session (AGENTS rule 6). Two checks:

1. Size: AGENTS.md is no larger than the budget recorded in
   tools/agents_map_budget.json. The budget is never typed by hand (AGENTS
   rule 5): `--record` measures the file and writes its size and SHA-256, so
   growing the guide is a deliberate, reviewed change to that file.
2. References: every relative Markdown link, every `@import` line and every
   backticked repository path in AGENTS.md and CLAUDE.md names a file or
   folder that exists. Paths with placeholders (`<slug>`) or wildcards are
   skipped.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GUIDES = ("AGENTS.md", "CLAUDE.md")
BUDGETED = "AGENTS.md"
BUDGET_FILE = ROOT / "tools" / "agents_map_budget.json"

MD_LINK = re.compile(r"\]\(([^)\s]+)\)")
IMPORT = re.compile(r"^@(\S+)\s*$", re.MULTILINE)
CODE = re.compile(r"`([^`\s]+)`")


def looks_like_path(token: str) -> bool:
    if any(ch in token for ch in "<>*?{}$"):
        return False
    if re.match(r"^[a-z][a-z0-9+.-]*:", token, re.IGNORECASE):
        return False
    return "/" in token or token.endswith(".md")


def references(text: str) -> list[str]:
    refs: list[str] = []
    for match in MD_LINK.finditer(text):
        target = match.group(1).split("#", 1)[0]
        if target and not re.match(r"^[a-z][a-z0-9+.-]*:", target, re.IGNORECASE):
            refs.append(target)
    refs.extend(m.group(1) for m in IMPORT.finditer(text))
    refs.extend(
        t for t in (m.group(1) for m in CODE.finditer(text)) if looks_like_path(t)
    )
    return refs


def missing_references(root: Path = ROOT) -> list[str]:
    problems = []
    for name in GUIDES:
        guide = root / name
        if not guide.exists():
            problems.append(f"{name}: missing")
            continue
        for ref in references(guide.read_text(encoding="utf-8")):
            if not (guide.parent / ref).exists():
                problems.append(f"{name}: names `{ref}`, which does not exist")
    return problems


def measure(path: Path) -> dict[str, object]:
    data = path.read_bytes()
    return {
        "file": path.name,
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
    }


def budget_problems(root: Path = ROOT, budget_file: Path = BUDGET_FILE) -> list[str]:
    if not budget_file.exists():
        return [
            f"{budget_file.name}: missing; run python3 tools/check_agents_map.py --record"
        ]
    budget = json.loads(budget_file.read_text(encoding="utf-8"))
    now = measure(root / BUDGETED)
    if now["bytes"] > budget["bytes"]:
        message = (
            f"{BUDGETED}: {now['bytes']} bytes, over the recorded budget of {budget['bytes']} "
            f"(sha256 {budget['sha256'][:12]}). Move detail into the files it points to, "
            "or re-record the budget in a reviewed change."
        )
        return [message]
    return []


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--record",
        action="store_true",
        help="measure AGENTS.md and write the budget file",
    )
    args = parser.parse_args(argv)
    if args.record:
        BUDGET_FILE.write_text(
            json.dumps(measure(ROOT / BUDGETED), indent=2) + "\n", encoding="utf-8"
        )
        print(f"recorded {BUDGET_FILE.relative_to(ROOT)}")
        return 0
    problems = budget_problems() + missing_references()
    for problem in problems:
        print(problem)
    if problems:
        print(f"{len(problems)} agent map problem(s)")
        return 1
    print("agent map check passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
