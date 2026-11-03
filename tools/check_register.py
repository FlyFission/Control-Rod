"""Check the borrowed code and asset register (workbench spec WB-23).

Three checks:
1. Every register row is complete, names a permissive license and a full
   commit, points at an existing local path, and has retained license
   evidence under third_party/licenses/<owner>__<repo>/.
2. Every tracked file carrying a provenance marker has a register row.
3. With --donors DIR, repository code is compared with pinned donor
   checkouts by runs of normalized lines; overlaps in unregistered files are
   reported for review.
"""

from __future__ import annotations

import argparse
import hashlib
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REGISTER = ROOT / "docs" / "third-party" / "register.md"
LICENSES = ROOT / "third_party" / "licenses"
PERMISSIVE = {"MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC"}
# The SIL Open Font License is the standard license for web fonts; it is accepted for font files only.
FONT_LICENSES = {"OFL-1.1"}
FONT_SUFFIXES = (".woff2", ".woff", ".ttf", ".otf")
COLUMNS = ["Local path", "Upstream repository", "Commit", "Upstream path", "License", "Notice retained", "Local changes"]
MARKER = re.compile(r"\b(?:Ported from|Adapted from|Translated from|Derived from|SPDX-FileCopyrightText)\b")
CODE_SUFFIXES = {".ts", ".tsx", ".js", ".mjs", ".go", ".rs", ".py"}
SKIP_PARTS = {"node_modules", "generated", "dist", ".git"}
RUN = 6  # consecutive normalized lines that count as an overlap
MIN_LINE = 12  # shorter lines (braces, imports of one name) are ignored


def parse_register(text: str) -> tuple[list[str], list[dict[str, str]]]:
    lines = [l for l in text.splitlines() if l.startswith("|")]
    if not lines:
        return [], []
    header = [c.strip() for c in lines[0].strip("|").split("|")]
    rows = []
    for line in lines[2:]:
        cells = [c.strip() for c in line.strip("|").split("|")]
        rows.append(dict(zip(header, cells)))
    return header, rows


def check_rows(header: list[str], rows: list[dict[str, str]], root: Path = ROOT) -> list[str]:
    problems = []
    if header != COLUMNS:
        problems.append(f"register header must be: {' | '.join(COLUMNS)}")
        return problems
    for row in rows:
        where = row.get("Local path", "?")
        if any(not row.get(c) for c in COLUMNS):
            problems.append(f"{where}: every column must be filled")
        license_ok = row.get("License") in PERMISSIVE or (
            row.get("License") in FONT_LICENSES and row.get("Local path", "").strip("`").endswith(FONT_SUFFIXES)
        )
        if not license_ok:
            problems.append(f"{where}: license {row.get('License')!r} is not on the permissive list for this file type")
        if not re.fullmatch(r"[0-9a-f]{40}", row.get("Commit", "")):
            problems.append(f"{where}: commit must be a full 40 character hash")
        local = row.get("Local path", "").strip("`")
        if not (root / local).exists():
            problems.append(f"{where}: local path does not exist")
        repo = row.get("Upstream repository", "").strip("`")
        evidence = root / "third_party" / "licenses" / repo.replace("/", "__")
        if not any(evidence.glob("LICENSE*")):
            problems.append(f"{where}: no retained license under third_party/licenses/{repo.replace('/', '__')}/")
    return problems


def tracked_files(root: Path = ROOT) -> list[Path]:
    out = subprocess.run(["git", "ls-files", "-z"], cwd=root, check=True, capture_output=True).stdout
    return [root / n for n in out.decode().split("\0") if n]


def unregistered_markers(files: list[Path], registered: set[str], root: Path = ROOT) -> list[str]:
    problems = []
    for path in files:
        rel = path.relative_to(root).as_posix()
        if rel.startswith(("third_party/", "docs/third-party/")) or rel == "tools/check_register.py" or rel == "tools/test_check_register.py":
            continue
        if path.suffix not in CODE_SUFFIXES | {".svg", ".css", ".md"} or not path.is_file():
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        if MARKER.search(text) and rel not in registered:
            problems.append(f"{rel}: carries a provenance marker but has no register row")
    return problems


def normalized_lines(text: str) -> list[str]:
    lines = []
    for line in text.splitlines():
        line = re.sub(r"\s+", " ", line.strip())
        if len(line) >= MIN_LINE and not line.startswith(("//", "#", "*", "/*")):
            lines.append(line)
    return lines


def shingles(text: str) -> set[str]:
    lines = normalized_lines(text)
    return {
        hashlib.sha256("\n".join(lines[i:i + RUN]).encode()).hexdigest()
        for i in range(len(lines) - RUN + 1)
    }


def code_files(base: Path, exclude: tuple[str, ...] = ()) -> list[Path]:
    return [
        p for p in base.rglob("*")
        if p.suffix in CODE_SUFFIXES and p.is_file() and not SKIP_PARTS.intersection(p.parts)
        and not any(p.relative_to(base).as_posix().startswith(e) for e in exclude)
    ]


def overlap_report(repo_files: list[Path], donors: Path, registered: set[str], root: Path = ROOT, exclude: tuple[str, ...] = ()) -> list[str]:
    donor_index: dict[str, str] = {}
    for path in code_files(donors, exclude):
        try:
            for digest in shingles(path.read_text(encoding="utf-8")):
                donor_index.setdefault(digest, path.relative_to(donors).as_posix())
        except (UnicodeDecodeError, OSError):
            continue
    findings = []
    for path in repo_files:
        rel = path.relative_to(root).as_posix()
        if path.suffix not in CODE_SUFFIXES or rel in registered or not path.is_file():
            continue
        try:
            hits = shingles(path.read_text(encoding="utf-8")) & donor_index.keys()
        except UnicodeDecodeError:
            continue
        if hits:
            sources = sorted({donor_index[h] for h in hits})[:3]
            findings.append(f"{rel}: {len(hits)} shared {RUN} line runs with {', '.join(sources)}")
    return findings


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--donors", type=Path, help="directory of pinned donor checkouts to compare against")
    parser.add_argument("--exclude", action="append", default=[], help="donor subdirectory to skip, such as a checkout of this repository")
    args = parser.parse_args(argv)
    header, rows = parse_register(REGISTER.read_text(encoding="utf-8"))
    registered = {r.get("Local path", "").strip("`") for r in rows}
    files = tracked_files()
    problems = check_rows(header, rows) + unregistered_markers(files, registered)
    for problem in problems:
        print(problem)
    review = overlap_report(files, args.donors, registered, exclude=tuple(args.exclude)) if args.donors else []
    for finding in review:
        print(f"review: {finding}")
    if problems:
        print(f"{len(problems)} register problem(s)")
        return 1
    print(f"register check passed ({len(rows)} rows; {len(review)} overlap(s) for review)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
