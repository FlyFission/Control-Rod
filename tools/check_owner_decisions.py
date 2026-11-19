"""Check owner-decision tables in change records (pattern PL8, docs/patterns/plannotator.md).

Every `basis.md` dated on or after EFFECTIVE that has an "Owner decisions" section must use the
table in docs/collaboration.md#recording-owner-decisions: the owner's words quoted exactly, or the
row marked as the authoring agent's own choice; when and where they were given; the reading; and
what the words do not cover. Records dated earlier keep the form they were written in.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHANGES = ROOT / ".nuclear" / "changes"
EFFECTIVE = "2026-11-19"
COLUMNS = ["#", "Decision", "Owner's words", "Given", "Reading", "Out of scope"]
AGENT_CHOICE = "none: authoring agent's choice, open to the owner"
DATE = re.compile(r"\*\*Date:\*\*\s*(\d{4}-\d{2}-\d{2})")


def cells(line: str) -> list[str]:
    return [c.strip() for c in line.strip().strip("|").split("|")]


def owner_table(text: str) -> list[str] | None:
    """The table lines of the "Owner decisions" section, or None when there is no such section."""
    m = re.search(
        r"^## Owner decisions[^\n]*\n(.*?)(?=^## |\Z)", text, re.MULTILINE | re.DOTALL
    )
    if not m:
        return None
    return [line for line in m.group(1).splitlines() if line.strip().startswith("|")]


def check_basis(text: str, where: str) -> list[str]:
    date = DATE.search(text)
    if not date or date.group(1) < EFFECTIVE:
        return []
    table = owner_table(text)
    if table is None:
        return []
    if not table or cells(table[0]) != COLUMNS:
        return [
            f"{where}: Owner decisions table must have the columns: {' | '.join(COLUMNS)}"
        ]
    problems = []
    rows = table[2:]
    if not rows:
        problems.append(f"{where}: Owner decisions table has no rows")
    for row in rows:
        values = dict(zip(COLUMNS, cells(row)))
        rid = values.get("#") or "?"
        words = values.get("Owner's words", "")
        if words != AGENT_CHOICE and not re.search(r'"[^"]+"', words):
            problems.append(
                f"{where} {rid}: Owner's words must be quoted exactly, or read: {AGENT_CHOICE}"
            )
        if not re.search(r"\d{4}-\d{2}-\d{2}", values.get("Given", "")):
            problems.append(
                f"{where} {rid}: Given needs the date (YYYY-MM-DD) and where"
            )
        for column in ("Decision", "Reading", "Out of scope"):
            if not values.get(column):
                problems.append(f"{where} {rid}: {column} is empty")
    return problems


def main() -> int:
    problems = []
    for basis in sorted(CHANGES.glob("*/basis.md")):
        problems += check_basis(
            basis.read_text(encoding="utf-8"), basis.relative_to(ROOT).as_posix()
        )
    for p in problems:
        print(p)
    if problems:
        print(f"{len(problems)} owner decision problem(s)")
        return 1
    print("owner decision check passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
