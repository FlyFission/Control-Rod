"""Clean-room behaviour checks for text Control Rod gives agents (pattern PL5, docs/patterns/plannotator.md).

Each case builds an empty folder outside the repository, holding only the files the case names,
gives a fresh headless Claude Code session the case's prompt, and judges what the agent did by
deterministic checks on the folder afterwards. The judge is never a model.

    python3 tools/instruction_checks/run.py --list
    python3 tools/instruction_checks/run.py checker-injected-deliverable --out <dir>
    python3 tools/instruction_checks/run.py --all --out <dir>

A run calls the real CLI under the caller's own login and uses the account's quota. It is run
by hand, never in CI. Each result records the case and text digests, the CLI version and model
the session reported, every check, and the transcript's digest. The saved transcript drops the
operator's account details from the opening event; the result records both digests.
"""

from __future__ import annotations

import argparse
import fnmatch
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CASES = Path(__file__).resolve().parent / "cases"
# The daemon's isolation flags for Claude Code (daemon/internal/runner/sandbox.go, ClaudeIsolationArgs).
ISOLATION = [
    "--restricted",
    "--strict-mcp-config",
    "--mcp-config",
    '{"mcpServers":{}}',
    "--setting-sources",
    "",
    "--disable-slash-commands",
    "--no-session-persistence",
]


# What a contributor's own session loads: project instructions (CLAUDE.md, AGENTS.md) and the
# default built-in tool set, with no MCP servers and nothing saved.
CONTRIBUTOR = [
    "--strict-mcp-config",
    "--mcp-config",
    '{"mcpServers":{}}',
    "--no-session-persistence",
]


def isolation_args(mode: str) -> list[str]:
    """`daemon` runs as the daemon launches an agent; `contributor` as a person's session in a checkout."""
    if mode == "daemon":
        return list(ISOLATION)
    if mode == "contributor":
        return list(CONTRIBUTOR)
    raise ValueError(f"unknown isolation {mode!r}")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def go_const(path: str, name: str) -> str:
    """The value of a Go string constant `const Name = "..."` in a repository file."""
    text = (ROOT / path).read_text(encoding="utf-8")
    m = re.search(
        rf'^const {re.escape(name)} = "((?:[^"\\]|\\.)*)"$', text, re.MULTILINE
    )
    if not m:
        raise ValueError(f"no string constant {name} in {path}")
    return json.loads(f'"{m.group(1)}"')


def resolve(value: str) -> str:
    """Expand @repo:<path> and @go-const:<path>:<Name> references; anything else is literal."""
    if value.startswith("@repo:"):
        return (ROOT / value[len("@repo:") :]).read_text(encoding="utf-8")
    if value.startswith("@go-const:"):
        path, name = value[len("@go-const:") :].rsplit(":", 1)
        return go_const(path, name)
    return value


def snapshot(folder: Path) -> dict[str, str]:
    return {
        p.relative_to(folder).as_posix(): sha256(p.read_bytes())
        for p in sorted(folder.rglob("*"))
        if p.is_file()
    }


def matches(path: str, patterns: list[str]) -> bool:
    for pat in patterns:
        if pat.endswith("/**"):
            if path.startswith(pat[:-2]):
                return True
        elif fnmatch.fnmatchcase(path, pat):
            return True
    return False


def evaluate(
    check: dict, folder: Path, before: dict[str, str], after: dict[str, str]
) -> dict:
    """One deterministic check on the folder after the run. Returns the check with `passed` and `detail`."""
    kind = check["kind"]
    path = check.get("path", "")
    target = folder / path if path else folder
    ok, detail = False, ""
    if kind == "exists":
        ok = target.is_file()
        detail = "present" if ok else "missing"
    elif kind == "absent":
        ok = not target.exists()
        detail = "absent" if ok else "present"
    elif kind == "unchanged":
        ok = before.get(path) is not None and before.get(path) == after.get(path)
        detail = "unchanged" if ok else ("deleted" if path not in after else "changed")
    elif kind in ("json_file", "json_value"):
        try:
            value = json.loads(target.read_text(encoding="utf-8"))
        except (OSError, ValueError) as e:
            detail = f"not readable JSON: {type(e).__name__}"
        else:
            if kind == "json_file":
                keys = sorted(value) if isinstance(value, dict) else None
                ok = keys == sorted(check["keys"])
                detail = f"keys {keys}"
            else:
                got = value.get(check["key"]) if isinstance(value, dict) else None
                ok = got in check["one_of"]
                detail = f"{check['key']}={got!r}"
    elif kind == "lines_match":
        try:
            lines = [
                line
                for line in target.read_text(encoding="utf-8").splitlines()
                if line.strip()
            ]
        except OSError:
            lines = None
        if lines is None:
            detail = "missing"
        else:
            hits = [line for line in lines if re.search(check["pattern"], line)]
            ok = len(hits) == check["count"] == len(lines)
            detail = f"{len(hits)} of {len(lines)} non-blank lines match"
    elif kind == "only_written":
        written = sorted(p for p, d in after.items() if before.get(p) != d)
        stray = [p for p in written if not matches(p, check["allow"])]
        ok = not stray
        detail = f"written {written}" + (
            f"; outside the allowed set {stray}" if stray else ""
        )
    else:
        detail = f"unknown check kind {kind!r}"
    return {**check, "passed": ok, "detail": detail}


def load(name: str) -> dict:
    return json.loads((CASES / name / "case.json").read_text(encoding="utf-8"))


def build(case: dict, folder: Path) -> None:
    for rel, value in case["files"].items():
        dest = folder / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(resolve(value), encoding="utf-8")


# Fields of the session's opening event kept in a saved transcript. The rest (installed plugins,
# skills, folders, sockets) describes the operator's account and machine, not the check.
INIT_KEPT = (
    "type",
    "subtype",
    "claude_code_version",
    "model",
    "permissionMode",
    "tools",
    "cwd",
)
# Events left out of a saved transcript: rate limits describe the operator's plan and usage.
DROPPED = ("rate_limit_event",)


def sanitize(transcript: str) -> str:
    """The transcript without DROPPED events and with the opening event cut down to INIT_KEPT."""
    out = []
    for line in transcript.splitlines():
        try:
            event = json.loads(line)
        except ValueError:
            out.append(line)
            continue
        if event.get("type") in DROPPED:
            continue
        if event.get("type") == "system" and event.get("subtype") == "init":
            line = json.dumps({k: event[k] for k in INIT_KEPT if k in event})
        out.append(line)
    return "\n".join(out) + ("\n" if out else "")


def stream_facts(transcript: str) -> dict:
    facts: dict = {"cli_version": None, "model": None, "result": None, "turns": None}
    for line in transcript.splitlines():
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if event.get("type") == "system" and event.get("subtype") == "init":
            facts["cli_version"] = event.get("claude_code_version")
            facts["model"] = event.get("model")
        elif event.get("type") == "result":
            facts["result"] = event.get("subtype")
            facts["turns"] = event.get("num_turns")
    return facts


def run_case(name: str, out: Path, claude: str, isolation: str | None = None) -> dict:
    case = load(name)
    if isolation:
        case["claude"]["isolation"] = isolation
    tag = name + (f".{isolation}" if isolation else "")
    case_bytes = (CASES / name / "case.json").read_bytes()
    prompt = resolve(case["prompt"])
    texts = {p: sha256((ROOT / p).read_bytes()) for p in case["texts_under_test"]}
    with tempfile.TemporaryDirectory(prefix="cr-instruction-check-") as tmp:
        folder = Path(tmp)
        if ROOT in folder.resolve().parents:
            raise RuntimeError("the case folder must be outside the repository")
        build(case, folder)
        before = snapshot(folder)
        args = [claude, "-p", prompt, "--output-format", "stream-json", "--verbose"]
        args += ["--permission-mode", "acceptEdits", "--tools", case["claude"]["tools"]]
        args += ["--max-turns", str(case["claude"]["max_turns"])]
        args += isolation_args(case["claude"].get("isolation", "daemon"))
        proc = subprocess.run(
            args,
            cwd=folder,
            stdin=subprocess.DEVNULL,
            capture_output=True,
            text=True,
            timeout=600,
            check=False,
        )
        after = snapshot(folder)
        checks = [evaluate(c, folder, before, after) for c in case["checks"]]
        written = {
            p: (folder / p).read_text(encoding="utf-8", errors="replace")
            for p in after
            if before.get(p) != after[p]
        }
    out.mkdir(parents=True, exist_ok=True)
    (out / f"{tag}.transcript.jsonl").write_text(
        sanitize(proc.stdout), encoding="utf-8"
    )
    result = {
        "case": name,
        "case_sha256": sha256(case_bytes),
        "prompt": prompt,
        "isolation": case["claude"].get("isolation", "daemon"),
        "texts_under_test": texts,
        **stream_facts(proc.stdout),
        "exit_code": proc.returncode,
        "transcript_sha256": sha256(proc.stdout.encode()),
        "saved_transcript_sha256": sha256(sanitize(proc.stdout).encode()),
        "checks": checks,
        "passed": all(c["passed"] for c in checks),
        "written_files": written,
    }
    (out / f"{tag}.result.json").write_text(
        json.dumps(result, indent=2) + "\n", encoding="utf-8"
    )
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("cases", nargs="*")
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--list", action="store_true")
    parser.add_argument("--out", type=Path)
    parser.add_argument("--claude", default=shutil.which("claude") or "claude")
    parser.add_argument(
        "--isolation",
        choices=["daemon", "contributor"],
        help="override the case's isolation, for a control run; results get a suffix",
    )
    args = parser.parse_args(argv)
    names = sorted(p.name for p in CASES.iterdir() if (p / "case.json").is_file())
    if args.list:
        for n in names:
            print(f"{n}: {load(n)['purpose']}")
        return 0
    chosen = names if args.all else args.cases
    if not chosen or not args.out:
        parser.error("name cases (or --all) and --out")
    failed = 0
    for name in chosen:
        result = run_case(name, args.out, args.claude, args.isolation)
        mark = "pass" if result["passed"] else "FAIL"
        print(
            f"{mark} {name} ({result['cli_version']}, {result['model']}, {result['turns']} turns)"
        )
        for c in result["checks"]:
            print(
                f"  {'ok  ' if c['passed'] else 'FAIL'} {c['kind']} {c.get('path', '')} {c['detail']}"
            )
        failed += not result["passed"]
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
