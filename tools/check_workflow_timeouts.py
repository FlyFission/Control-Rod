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
NESTED_KV = re.compile(r"^(?:[^:#]|:(?!\s|$))(?:[^:]|:(?!\s|$))*:(?:\s+(.*))?$")
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


def _check_trailing_after_quote(line_slice: str) -> str | None:
    """Return an error if `line_slice` has non-comment text after a closing quote."""
    rest = line_slice.strip()
    if not rest:
        return None
    if rest.startswith("#") and line_slice[0] in (" ", "\t"):
        return None
    return f"trailing text after closing quote: {rest!r}"


def _parse_flow_collection(text: str) -> tuple[str, str | None]:
    """Return (value, error_message) for a flow collection starting with `[` or `{`."""
    pairs = {"[": "]", "{": "}"}
    stack: list[str] = []
    i = 0
    while i < len(text):
        ch = text[i]
        if ch in ('"', "'"):
            end = _find_closing_quote(text, ch, start=i + 1)
            if end is None:
                return text, "multiline flow collections are not supported"
            i = end + 1
            continue
        if ch == "#" and i > 0 and text[i - 1] in (" ", "\t"):
            break
        if ch in pairs:
            stack.append(pairs[ch])
        elif ch in ("]", "}"):
            if not stack or stack[-1] != ch:
                return text, "malformed flow collection"
            stack.pop()
            if not stack:
                rest = text[i + 1 :].strip()
                if rest and not rest.startswith("#"):
                    return text, f"trailing text after flow collection: {rest!r}"
                return text[: i + 1], None
        i += 1
    return text, "multiline flow collections are not supported"


def _unsupported_yaml_prefix(text: str) -> str | None:
    """Return an error if `text` starts with an unsupported YAML prefix."""
    if text[0] in ("&", "*", "!"):
        return f"unsupported YAML anchor, alias, or tag: {text!r}"
    if text in ("?", ":") or text.startswith(("? ", "?\t", ": ", ":\t")):
        return f"unsupported YAML explicit mapping syntax: {text!r}"
    return None


def _parse_scalar_value(raw: str | None) -> tuple[str, str | None, str | None]:
    """Return (value, unclosed_quote, flow_error) from the text following `key:`."""
    if not raw:
        return "", None, None
    text = raw.lstrip(" ")
    if not text or text.startswith("#"):
        return "", None, None
    prefix_err = _unsupported_yaml_prefix(text)
    if prefix_err is not None:
        return text, None, prefix_err
    if text[0] in ('"', "'"):
        quote = text[0]
        end = _find_closing_quote(text, quote, start=1)
        if end is None:
            return text, quote, None
        return text[: end + 1], None, _check_trailing_after_quote(text[end + 1 :])
    if text[0] in ("[", "{"):
        val, flow_err = _parse_flow_collection(text)
        return val, None, flow_err
    # Strip trailing `# comment` only when `#` is preceded by whitespace.
    value = re.sub(r"\s+#.*$", "", text).strip()
    return value, None, None


def _parse_nested_line(line: str) -> tuple[str, str | None, str | None, int]:
    """Return (scalar_or_block, unclosed_quote, flow_error, owner_indent) for a nested line."""
    base_indent = len(line) - len(line.lstrip(" "))
    text = line.lstrip(" ")
    dash_indent = base_indent
    while text == "-" or text.startswith("- "):
        dash_indent = len(line) - len(text)
        text = text[1:].lstrip(" ")
    key_indent = len(line) - len(text)
    if not text or text.startswith("#"):
        return "", None, None, key_indent
    prefix_err = _unsupported_yaml_prefix(text)
    if prefix_err is not None:
        return text, None, prefix_err, dash_indent
    if text[0] in ('"', "'"):
        end = _find_closing_quote(text, text[0], start=1)
        if end is None:
            return text, text[0], None, key_indent
        after = text[end + 1 :].lstrip(" ")
        if after.startswith(":") and (len(after) == 1 or after[1] in (" ", "\t")):
            val, unclosed, flow_err = _parse_scalar_value(after[1:])
            return val, unclosed, flow_err, key_indent
        return text[: end + 1], None, _check_trailing_after_quote(text[end + 1 :]), key_indent
    if text[0] in ("[", "{"):
        val, flow_err = _parse_flow_collection(text)
        return val, None, flow_err, dash_indent
    kv = NESTED_KV.match(text)
    if kv:
        val, unclosed, flow_err = _parse_scalar_value(kv.group(1))
        return val, unclosed, flow_err, key_indent
    if BLOCK_SCALAR.match(text):
        return text, None, None, dash_indent
    return "", None, None, key_indent


def _find_jobs_start(lines: list[str]) -> tuple[int | None, str | None]:
    """Return (jobs_header_index, error_message) from lines preceding `jobs:`."""
    saw_content_before_doc = False
    doc_markers_before_jobs = 0
    for i, line in enumerate(lines):
        if DOC_MARKER.match(line):
            doc_markers_before_jobs += 1
            if line.startswith("...") or doc_markers_before_jobs > 1 or saw_content_before_doc:
                return None, "multi-document YAML is not supported"
            continue
        if not line.strip() or line.lstrip(" ").startswith("#"):
            continue
        if "\t" in line[: len(line) - len(line.lstrip(" \t"))]:
            return None, "tab indentation is not supported"
        if JOBS_HEADER.match(line):
            return i, None
        saw_content_before_doc = True
    return None, "no `jobs:` block found"


def _scan_job_lines(lines: list[str], findings: list[str]) -> dict[str, dict[str, str]]:
    """Parse lines inside `jobs:` into `{job_name: {key: value}}`, appending parse findings."""
    jobs: dict[str, dict[str, str]] = {}
    current_job: str | None = None
    current: dict[str, str] | None = None
    job_indent: int | None = None
    skip_until_indent: int | None = None
    in_quoted: str | None = None
    bad_job = False
    allow_job_seq = False

    def reset_job() -> None:
        nonlocal current_job, current, job_indent, skip_until_indent, bad_job, allow_job_seq
        current_job = None
        current = None
        job_indent = None
        skip_until_indent = None
        bad_job = True
        allow_job_seq = False

    def apply_scalar_state(
        val: str, unclosed: str | None, flow_err: str | None, owner_indent: int
    ) -> None:
        nonlocal in_quoted, skip_until_indent
        if flow_err is not None:
            findings.append(f"{current_job or 'workflow'}: {flow_err}")
        elif unclosed is not None:
            in_quoted = unclosed
        elif BLOCK_SCALAR.match(val):
            skip_until_indent = owner_indent

    def track_nested(line_text: str) -> None:
        apply_scalar_state(*_parse_nested_line(line_text))

    for idx, line in enumerate(lines):
        if DOC_MARKER.match(line):
            findings.append("multi-document YAML is not supported")
            break

        if in_quoted is not None:
            end = _find_closing_quote(line, in_quoted)
            if end is not None:
                in_quoted = None
                err = _check_trailing_after_quote(line[end + 1 :])
                if err is not None:
                    findings.append(f"{current_job or 'workflow'}: {err}")
            continue

        if not line.strip():
            continue

        leading_ws = line[: len(line) - len(line.lstrip(" \t"))]
        tab_prefix = leading_ws[: skip_until_indent + 1] if skip_until_indent is not None else leading_ws
        if "\t" in tab_prefix:
            findings.append("tab indentation is not supported")
            reset_job()
            continue

        indent = len(leading_ws)
        if skip_until_indent is not None:
            if indent > skip_until_indent:
                continue
            skip_until_indent = None

        if line.lstrip(" ").startswith("#"):
            continue

        if indent == 0:
            if TOP_LEVEL_KEY.match(line):
                if any(DOC_MARKER.match(rest) for rest in lines[idx + 1 :]):
                    findings.append("multi-document YAML is not supported")
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
                    current = {}
                else:
                    current = {}
                    jobs[name] = current
                current_job = name
                job_indent = None
                bad_job = False
            else:
                findings.append(f"unsupported job declaration: {line.strip()!r}")
                reset_job()
            continue

        if indent == 1:
            findings.append(f"unsupported job declaration: {line.strip()!r}")
            reset_job()
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
            reset_job()
            continue

        if indent > job_indent:
            track_nested(line)
            continue

        # indent == job_indent
        stripped = line.lstrip(" ")
        if allow_job_seq and (stripped == "-" or stripped.startswith("- ")):
            track_nested(line)
            continue
        allow_job_seq = False

        kv = JOB_KV.match(line)
        if not kv:
            findings.append(f"{current_job}: unsupported job key: {stripped!r}")
            continue

        key = kv.group(2)
        val, unclosed, flow_err = _parse_scalar_value(kv.group(3))
        current[key] = val
        apply_scalar_state(val, unclosed, flow_err, indent)
        if flow_err is None and unclosed is None and val == "":
            allow_job_seq = True

    if in_quoted is not None:
        findings.append("unterminated quoted scalar")
    return jobs


def _check_jobs(jobs: dict[str, dict[str, str]]) -> list[str]:
    """Validate parsed job dictionaries and return timeout/key findings."""
    findings: list[str] = []
    for name, keys in jobs.items():
        if "runs-on" in keys and "uses" in keys:
            findings.append(f"{name}: has both runs-on and uses")
            continue
        if "uses" in keys:
            uses_val = keys["uses"]
            if (
                not uses_val
                or uses_val in ('""', "''", "null", "~")
                or BLOCK_SCALAR.match(uses_val)
                or uses_val.startswith(("[", "{"))
            ):
                findings.append(f"{name}: uses must be a non-empty workflow path")
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


def timeout_findings(text: str) -> list[str]:
    """Return one message per problem in one workflow file's text; empty means clean."""
    lines = text.splitlines()
    start, error = _find_jobs_start(lines)
    if error is not None or start is None:
        return [error or "no `jobs:` block found"]

    findings: list[str] = []
    if sum(1 for line in lines if JOBS_HEADER.match(line)) > 1:
        findings.append("more than one `jobs:` block; only the first would be read")

    jobs = _scan_job_lines(lines[start + 1 :], findings)
    if not jobs and not findings:
        return ["`jobs:` block has no jobs this check recognises"]

    findings.extend(_check_jobs(jobs))
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
