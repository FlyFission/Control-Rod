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
BLOCK_SCALAR = re.compile(r"^[|>][+-]?[0-9]*[+-]?(\s+#.*)?$")
JOB_KV = re.compile(r"^( +)([A-Za-z0-9_-]+):(?:\s+(.*))?$")
DOC_MARKER = re.compile(r"^(---|\.\.\.)(\s.*)?$")


def _find_closing_quote(text: str, quote: str, start: int = 0) -> int | None:
    """Return index of the closing quote in `text` from `start`, or None if unclosed."""
    i = start
    while i < len(text):
        ch = text[i]
        if quote == '"' and ch == "\\":
            i += 2
            continue
        if ch == quote:
            if quote == "'" and i + 1 < len(text) and text[i + 1] == "'":
                i += 2
                continue
            return i
        i += 1
    return None


def _parse_scalar_value(raw: str | None) -> tuple[str, str | None]:
    """Return (value, unclosed_quote) from the text following `key:`."""
    if not raw:
        return "", None
    text = raw.lstrip(" ")
    if not text or text.startswith("#"):
        return "", None
    if text[0] in ('"', "'"):
        quote = text[0]
        end = _find_closing_quote(text, quote, start=1)
        if end is None:
            return text, quote
        return text[: end + 1], None
    # Strip trailing `# comment` only when `#` is preceded by whitespace.
    value = re.sub(r"\s+#.*$", "", text).strip()
    return value, None


def timeout_findings(text: str) -> list[str]:
    """Return one message per problem in one workflow file's text; empty means clean."""
    lines = text.splitlines()
    findings: list[str] = []

    start: int | None = None
    saw_content_before_doc = False
    doc_markers_before_jobs = 0
    for i, line in enumerate(lines):
        if DOC_MARKER.match(line):
            doc_markers_before_jobs += 1
            if line.startswith("...") or doc_markers_before_jobs > 1 or saw_content_before_doc:
                return ["multi-document YAML is not supported"]
            continue
        if not line.strip() or line.lstrip(" ").startswith("#"):
            continue
        if "\t" in line[: len(line) - len(line.lstrip(" \t"))]:
            return ["tab indentation is not supported"]
        if JOBS_HEADER.match(line):
            start = i
            break
        saw_content_before_doc = True

    if start is None:
        return ["no `jobs:` block found"]

    if sum(1 for line in lines if JOBS_HEADER.match(line)) > 1:
        findings.append("more than one `jobs:` block; only the first would be read")

    jobs: dict[str, dict[str, str]] = {}
    current_job: str | None = None
    current: dict[str, str] | None = None
    job_indent: int | None = None
    skip_until_indent: int | None = None
    skip_allow_seq = False
    in_quoted: str | None = None
    bad_job = False
    allow_job_seq = False

    for line in lines[start + 1 :]:
        if DOC_MARKER.match(line):
            findings.append("multi-document YAML is not supported")
            break

        if in_quoted is not None:
            if _find_closing_quote(line, in_quoted) is not None:
                in_quoted = None
            continue

        if not line.strip():
            continue

        leading_ws = line[: len(line) - len(line.lstrip(" \t"))]
        tab_prefix = leading_ws[: skip_until_indent + 1] if skip_until_indent is not None else leading_ws
        if "\t" in tab_prefix:
            findings.append("tab indentation is not supported")
            current_job = None
            current = None
            job_indent = None
            bad_job = True
            continue

        indent = len(leading_ws)
        if skip_until_indent is not None:
            if line.lstrip(" ").startswith("#"):
                if not skip_allow_seq and indent <= skip_until_indent:
                    skip_until_indent = None
                continue
            if indent > skip_until_indent:
                continue
            if skip_allow_seq and indent == skip_until_indent and (
                line.lstrip(" ") == "-" or line.lstrip(" ").startswith("- ")
            ):
                continue
            skip_until_indent = None
            skip_allow_seq = False

        if line.lstrip(" ").startswith("#"):
            continue

        if indent == 0:
            if TOP_LEVEL_KEY.match(line):
                break
            findings.append(f"unsupported top-level line inside jobs block: {line.strip()!r}")
            break

        if indent == 2:
            allow_job_seq = False
            header = JOB_HEADER.match(line)
            if header:
                name = header.group(1)
                if name in jobs:
                    findings.append(f"{name}: duplicate job name")
                    current_job = name
                    current = {}
                else:
                    current_job = name
                    current = {}
                    jobs[name] = current
                bad_job = False
                job_indent = None
            else:
                findings.append(f"unsupported job declaration: {line.strip()!r}")
                current_job = None
                current = None
                job_indent = None
                bad_job = True
            continue

        if indent == 1:
            allow_job_seq = False
            findings.append(f"unsupported job declaration: {line.strip()!r}")
            current_job = None
            current = None
            job_indent = None
            bad_job = True
            continue

        # indent >= 3
        if current is None:
            if not bad_job:
                findings.append(f"unsupported job declaration: {line.strip()!r}")
                bad_job = True
            continue

        if job_indent is None:
            job_indent = indent

        if indent < job_indent:
            findings.append(
                f"{current_job}: inconsistent indentation or unsupported job declaration: {line.strip()!r}"
            )
            current_job = None
            current = None
            job_indent = None
            bad_job = True
            allow_job_seq = False
            continue

        if indent > job_indent:
            kv = JOB_KV.match(line)
            if kv:
                val, unclosed = _parse_scalar_value(kv.group(3))
                if unclosed is not None:
                    in_quoted = unclosed
                elif BLOCK_SCALAR.match(val):
                    skip_until_indent = indent
                    skip_allow_seq = False
            continue

        # indent == job_indent
        if allow_job_seq and (line.lstrip(" ") == "-" or line.lstrip(" ").startswith("- ")):
            continue
        allow_job_seq = False

        kv = JOB_KV.match(line)
        if not kv:
            findings.append(f"{current_job}: unsupported job key: {line.strip()!r}")
            continue

        key = kv.group(2)
        val, unclosed = _parse_scalar_value(kv.group(3))
        current[key] = val
        if unclosed is not None:
            in_quoted = unclosed
        elif key == "steps":
            skip_until_indent = indent
            skip_allow_seq = True
        elif BLOCK_SCALAR.match(val):
            skip_until_indent = indent
            skip_allow_seq = False
        elif val == "":
            allow_job_seq = True

    if in_quoted is not None:
        findings.append("unterminated quoted scalar")

    if not jobs and not findings:
        return ["`jobs:` block has no jobs this check recognises"]

    for name, keys in jobs.items():
        if "runs-on" in keys and "uses" in keys:
            findings.append(f"{name}: has both runs-on and uses")
            continue
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
        print(f"{len(problems)} workflow timeout finding(s)")
        return 1
    print(f"workflow timeouts check passed ({len(files)} file(s))")
    return 0


if __name__ == "__main__":
    sys.exit(main())
