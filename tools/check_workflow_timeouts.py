"""Fail when a GitHub Actions job lacks a bounded `timeout-minutes`.

GitHub lets a job run for 360 minutes unless the workflow says otherwise. A stuck step then
occupies a runner for hours. This check wants an integer from 1 to MAX_TIMEOUT_MINUTES on
every job; the ceiling exists so a 300-minute value cannot pass as "bounded".

It uses only the standard library and reads the workflow as text. Anything it cannot read is
reported, never skipped: a file with no recognisable jobs fails, and so does a job header
written in a form it does not understand (quoted name, anchor, inline mapping), because an
unread job is an unchecked job. Jobs that delegate through `uses:` to a reusable workflow are exempt since
GitHub does not accept `timeout-minutes` there.

Not yet run in CI. `.github/workflows/` is a trust surface (AGENTS rule 2), so wiring this in
needs a maintainer signature; see `.nuclear/changes/xerj-patterns-and-timeout-guard/`.
The idea comes from the XERJ project's CI timeout gate (`docs/patterns/xerj.md`); the code and
wording here are our own.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAX_TIMEOUT_MINUTES = 60

JOBS_HEADER = re.compile(r"^jobs:\s*(#.*)?$")
TOP_LEVEL_KEY = re.compile(r"^[A-Za-z0-9_'\"-]+\s*:")
JOB_HEADER = re.compile(r"^  ([A-Za-z0-9_-]+):\s*(#.*)?$")
JOB_LEVEL_LINE = re.compile(r"^  \S")
JOB_KEY = re.compile(r"^    ([A-Za-z0-9_-]+):\s*(.*?)\s*(#.*)?$")


def timeout_findings(text: str) -> list[str]:
    """Return one message per problem in one workflow file's text; empty means clean."""
    lines = text.splitlines()
    try:
        start = next(i for i, line in enumerate(lines) if JOBS_HEADER.match(line))
    except StopIteration:
        return ["no `jobs:` block found"]

    findings = []
    if sum(1 for line in lines if JOBS_HEADER.match(line)) > 1:
        findings.append("more than one `jobs:` block; only the first would be read")

    jobs: dict[str, dict[str, str]] = {}
    current: dict[str, str] | None = None
    for line in lines[start + 1:]:
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if TOP_LEVEL_KEY.match(line):
            break
        header = JOB_HEADER.match(line)
        if header:
            current = jobs.setdefault(header.group(1), {})
            continue
        if JOB_LEVEL_LINE.match(line):
            # Two-space indent is where a job name belongs; if it is not a plain header,
            # a job may exist that this reader cannot see.
            findings.append(f"unsupported job declaration: {line.strip()!r}")
            current = None
            continue
        key = JOB_KEY.match(line)
        if key and current is not None:
            current[key.group(1)] = key.group(2)

    if not jobs and not findings:
        return ["`jobs:` block has no jobs this check recognises"]

    for name, keys in jobs.items():
        if "uses" in keys:
            continue
        if "runs-on" not in keys:
            findings.append(f"{name}: has neither runs-on nor uses; the parser may have lost the job")
            continue
        value = keys.get("timeout-minutes")
        if value is None:
            findings.append(f"{name}: no timeout-minutes (GitHub's default is 360)")
        elif not re.fullmatch(r"[0-9]+", value):
            findings.append(f"{name}: timeout-minutes must be a plain integer, found '{value}'")
        elif not 1 <= int(value) <= MAX_TIMEOUT_MINUTES:
            findings.append(f"{name}: timeout-minutes {value} is outside 1..{MAX_TIMEOUT_MINUTES}")
    return findings


def workflow_files(root: Path = ROOT) -> list[Path]:
    return sorted((root / ".github" / "workflows").glob("*.y*ml"))


def main() -> int:
    files = workflow_files()
    if not files:
        print("no workflow files found under .github/workflows")
        return 1
    problems = []
    for path in files:
        for finding in timeout_findings(path.read_text(encoding="utf-8")):
            problems.append(f"{path.relative_to(ROOT)}: {finding}")
    for problem in problems:
        print(problem)
    if problems:
        print(f"{len(problems)} job(s) without a bounded timeout")
        return 1
    print(f"workflow timeouts check passed ({len(files)} file(s))")
    return 0


if __name__ == "__main__":
    sys.exit(main())
