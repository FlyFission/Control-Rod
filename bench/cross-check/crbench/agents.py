"""Agent calls (DESIGN.md §4, §5): the frozen isolation flags from agents.json, prompts on stdin,
an outer OS confinement (confine.py), output spooled to files, and the failure taxonomy.

Each call gets two opaque directories under the workspace root: the workspace (the tree, plus
scratch for a checker) and a private directory (its own sign-in copy, HOME and TMPDIR). Both are
deleted after the call. A CLI's own tool shell can read that CLI's own sign-in, as in Control
Rod's daemon; it can never read the other vendor's."""

from __future__ import annotations

import json
import os
import re
import shutil
import signal
import subprocess
import time
from pathlib import Path

from . import confine
from .common import HERE, read_json

BILLING_ENV = ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "OPENAI_API_KEY", "OPENAI_BASE_URL",
               "CODEX_API_KEY", "AZURE_OPENAI_API_KEY", "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX",
               "CLAUDE_CODE_USE_FOUNDRY", "AWS_BEARER_TOKEN_BEDROCK")
KEEP_ENV = ("PATH", "LANG", "LC_ALL", "TERM", "USER", "LOGNAME")
LOCAL_KEYS = {"config", "login_store", "bin", "read_allow"}
QUOTA = [r"usage limit", r"limit reached", r"rate.?limit", r"\b429\b", r"too many requests", r"quota"]
AUTH = re.compile(r"not (signed|logged) in|log ?in required|please (run )?(/)?login|unauthori[sz]ed|\b401\b|"
                  r"invalid (api key|token|bearer)|token (has )?expired|authentication_error|oauth token", re.I)
VERDICT = re.compile(r"<verdict>\s*(\{.*?\})\s*</verdict>", re.S)
OUTPUT_CAP = 256 * 1024 * 1024


# ------------------------------------------------------------------ local overrides


def load_local(name: str, agent: dict | None = None) -> dict:
    """agents.local.json: sign-in store, CLI path, extra readable install dirs and allowlisted
    transport values only. Never model, effort, tools or sandbox (§9)."""
    p = HERE / "agents.local.json"
    if not p.exists():
        return {}
    extra = read_json(p).get(name, {})
    bad = set(extra) - LOCAL_KEYS
    allow = (agent or {}).get("transport_allow", {})
    for k, v in extra.get("config", {}).items():
        if k not in allow or v not in allow[k]:
            bad.add(f"config.{k}={v}")
    if bad:
        raise SystemExit(f"agents.local.json may set only sign-in, CLI path and allowlisted transport for {name} "
                         f"(§9); refused: {sorted(bad)}")
    return extra


def effective(agent: dict, name: str) -> dict:
    """The frozen spec plus its local sign-in, binary and readable install dirs."""
    ex = load_local(name, agent)
    out = dict(agent)
    for k in ("login_store", "bin", "read_allow"):
        if k in ex:
            out[k] = ex[k]
    out["_local_config"] = ex.get("config", {})
    out["_name"] = name
    return out


def local_record(name: str, agent: dict | None = None) -> dict:
    """What the record keeps from agents.local.json: allowlisted transport values and the sign-in
    mode; never paths or secrets."""
    ex = load_local(name, agent)
    return {"config": ex.get("config", {}), "login_mode": ex.get("login_store", {}).get("mode"),
            "custom_bin": "bin" in ex, "extra_read_dirs": len(ex.get("read_allow", []))}


def resolve_bin(agent: dict) -> str | None:
    b = agent.get("bin", agent["kind"])
    found = shutil.which(os.path.expanduser(b))
    return str(Path(found).resolve()) if found else None


# ------------------------------------------------------------------ environment and sign-in


def clean_env(extra: dict) -> dict:
    keep = {k: v for k, v in os.environ.items() if k in KEEP_ENV}
    keep["PYTHONDONTWRITEBYTECODE"] = "1"
    keep.update(extra)
    for k in BILLING_ENV:
        keep.pop(k, None)
    return keep


def login_store(agent: dict, private: Path) -> dict:
    """A minimal, isolated login store in the call's private directory. Returns env additions."""
    ls = agent.get("login_store") or {}
    home, tmp = private / "home", private / "tmp"
    home.mkdir(parents=True, exist_ok=True)
    tmp.mkdir(parents=True, exist_ok=True)
    env = {"HOME": str(home), "TMPDIR": str(tmp)}
    if agent["kind"] == "stub" or not ls or ls.get("mode") == "none":
        return env
    src = Path(os.path.expanduser(ls["source"]))
    if ls["mode"] == "files":  # e.g. an isolated CODEX_HOME holding only auth.json
        dst = private / "login"
        dst.mkdir(parents=True)
        for f in ls["files"]:
            if not (src / f).is_file() or (src / f).is_symlink():
                raise SystemExit(f"sign-in file {f} not found (or a link) for {agent['kind']}")
            shutil.copyfile(src / f, dst / f)
            os.chmod(dst / f, 0o600)
        return {**env, ls["env"]: str(dst)}
    if ls["mode"] == "token_file":  # a `claude setup-token` subscription token in a 0600 file
        if src.is_symlink() or src.stat().st_mode & 0o077:
            raise SystemExit(f"{src} must be a regular file readable by its owner only (chmod 600)")
        return {**env, ls["env"]: src.read_text().strip()}
    raise SystemExit(f"unknown login_store mode {ls['mode']!r}")


# ------------------------------------------------------------------ commands


def claude_settings(denied: list[str]) -> str:
    rules = []
    for d in denied:  # "//" marks an absolute path in Claude Code permission rules
        a = "/" + d
        rules += [f"Read({a})", f"Read({a}/**)", f"Edit({a})", f"Edit({a}/**)"]
    return json.dumps({
        "sandbox": {"enabled": True, "failIfUnavailable": True, "allowUnsandboxedCommands": False,
                    "autoAllowBashIfSandboxed": False, "filesystem": {"denyRead": denied},
                    "network": {"allowedDomains": []}},
        "permissions": {"defaultMode": "acceptEdits", "blockReadsOutsideWorkingDirectories": True, "deny": rules},
    }, separators=(",", ":"))


def claude_args(agent: dict, role: str, workspace: Path, scratch: Path | None, denied: list[str]) -> list[str]:
    iso = agent["isolation"]
    tools = iso["tools"][role]
    # a denial containing the workspace is left to blockReadsOutsideWorkingDirectories and to the
    # outer confinement, as in daemon ClaudeSettings
    ws = confine.canonical(workspace)
    own = [d for d in denied if not (ws == d or ws.startswith(d.rstrip("/") + "/"))]
    args = ["-p", "--output-format", "stream-json", "--verbose", "--model", agent["model"],
            "--permission-mode", "acceptEdits", "--tools", tools, "--allowedTools", tools,
            "--disallowedTools", iso["denied_tools"], *iso["args"], "--settings", claude_settings(own)]
    if scratch is not None:
        args += ["--add-dir", confine.canonical(scratch)]
    if agent.get("effort"):
        args += ["--effort", agent["effort"]]
    if agent.get("max_turns"):
        args += ["--max-turns", str(agent["max_turns"])]
    return args


def toml_str(s: str) -> str:
    return json.dumps(s)


def codex_args(agent: dict, role: str, workspace: Path, scratch: Path | None, denied: list[str], last: Path) -> list[str]:
    """Mirrors daemon codexPolicyArgsFor: an author extends :workspace; a checker gets :root and
    its tree read-only plus scratch writable. Denials are outermost-only."""
    iso = agent["isolation"]
    fs = {":slash_tmp": "read", ":tmpdir": "read"}
    if role == "checker":
        fs[":root"] = "read"
        fs[confine.canonical(workspace)] = "read"
        if scratch is not None:
            fs[confine.canonical(scratch)] = "write"
    for d in confine.outermost(denied):
        fs[d] = "deny"
    inline = ",".join(f"{toml_str(k)}={toml_str(fs[k])}" for k in sorted(fs))
    args = ["exec", "--json", "--skip-git-repo-check", "-C", confine.canonical(workspace), "-m", agent["model"],
            "-o", str(last), *iso["args"], "-c", 'default_permissions="control-rod"']
    if role == "author":
        args += ["-c", 'permissions.control-rod.extends=":workspace"']
    args += ["-c", "permissions.control-rod.filesystem={" + inline + "}"]
    for c in iso["config"]:
        args += ["-c", c]
    if agent.get("effort"):
        args += ["-c", f"model_reasoning_effort={toml_str(agent['effort'])}"]
    for k, v in sorted(agent.get("_local_config", {}).items()):
        args += ["-c", f"{k}={toml_str(v)}"]
    for f in iso["disabled_features"]:
        args += ["--disable", f]
    return args + ["-"]


# ------------------------------------------------------------------ output parsing


def norm_usage(kind: str, usage: dict | None) -> dict:
    """Token counts on one scale, each token once. Missing or malformed counters make the usage
    unknown, never zero."""
    unknown = {"known": False, "input": None, "cached_input": None, "output": None, "total": None}
    if not isinstance(usage, dict) or not usage:
        return unknown
    need = {"claude": ("input_tokens", "output_tokens"), "codex": ("input_tokens", "output_tokens"),
            "stub": ("input", "output")}[kind]
    if any(not isinstance(usage.get(k), int) or usage[k] < 0 for k in need):
        return unknown
    g = lambda k: usage.get(k) if isinstance(usage.get(k), int) and usage[k] >= 0 else 0  # noqa: E731
    if kind == "claude":
        inp, cached, out = g("input_tokens") + g("cache_creation_input_tokens"), g("cache_read_input_tokens"), g("output_tokens")
    elif kind == "codex":
        cached = g("cached_input_tokens")
        inp, out = max(g("input_tokens") - cached, 0), g("output_tokens")  # cached input sits inside input_tokens
    else:
        inp, cached, out = g("input"), g("cached_input"), g("output")
    return {"known": True, "input": inp, "cached_input": cached, "output": out, "total": inp + cached + out}


def parse_claude(stdout: str) -> dict:
    """stream-json: the init event (tools, model) and the result event (text, usage, errors)."""
    out = {"tools": None, "model": None, "result": None, "events": 0, "tool_uses": []}
    for line in stdout.splitlines():
        try:
            e = json.loads(line)
        except json.JSONDecodeError:
            continue
        out["events"] += 1
        if e.get("type") == "system" and e.get("subtype") == "init":
            out["tools"], out["model"] = e.get("tools"), e.get("model")
        elif e.get("type") == "assistant":
            for c in (e.get("message") or {}).get("content") or []:
                if isinstance(c, dict) and c.get("type") == "tool_use":
                    out["tool_uses"].append({"name": c.get("name"), "input": json.dumps(c.get("input"))})
        elif e.get("type") == "result":
            out["result"] = e
    return out


def parse_codex(stdout: str) -> dict:
    out = {"usage": {}, "failed": None, "model": None, "events": 0, "tool_uses": [], "usage_bad": False}
    for line in stdout.splitlines():
        try:
            e = json.loads(line)
        except json.JSONDecodeError:
            continue
        out["events"] += 1
        t = e.get("type")
        if t == "turn.completed":
            u = e.get("usage")
            if not isinstance(u, dict):
                out["usage_bad"] = True
                continue
            for k, v in u.items():
                if isinstance(v, int):
                    out["usage"][k] = out["usage"].get(k, 0) + v
        elif t in ("turn.failed", "error"):
            out["failed"] = json.dumps(e.get("error") or e)[:500]
        elif t and t.startswith("item."):
            it = e.get("item") or {}
            if it.get("type") in ("command_execution", "web_search", "mcp_tool_call", "file_change"):
                out["tool_uses"].append({"name": it.get("type"), "input": json.dumps(it.get("command") or it.get("query")
                                                                                      or it.get("tool") or "")})
        for k in ("model", "model_slug"):
            v = e.get(k)
            if not isinstance(v, str) and isinstance(e.get("session"), dict):
                v = e["session"].get(k)
            if isinstance(v, str):
                out["model"] = v
    if out["usage_bad"]:
        out["usage"] = {}
    return out


def parse_verdict(text: str) -> tuple[dict | None, str | None]:
    """Strict schema (§5): {"verdict": "pass"|"fail", "defects": [{"location", "reason"}]}; a fail
    cites at least one defect and a pass cites none."""
    m = VERDICT.findall(text or "")
    if len(m) != 1:
        return None, f"expected exactly one <verdict> block, found {len(m)}"
    try:
        v = json.loads(m[0])
    except json.JSONDecodeError:
        return None, "verdict block is not JSON"
    if not isinstance(v, dict) or set(v) != {"verdict", "defects"}:
        return None, "verdict must have exactly the keys verdict and defects"
    if v["verdict"] not in ("pass", "fail") or not isinstance(v["defects"], list):
        return None, "verdict must be pass or fail, defects a list"
    for d in v["defects"]:
        if not (isinstance(d, dict) and set(d) == {"location", "reason"}
                and all(isinstance(d[k], str) and d[k].strip() for k in d)):
            return None, "each defect needs a non-empty location and reason"
    if v["verdict"] == "fail" and not v["defects"]:
        return None, "a fail must cite at least one defect"
    if v["verdict"] == "pass" and v["defects"]:
        return None, "a pass must cite no defects"
    return v, None


def quota_reset_hours(text: str) -> float | None:
    m = re.search(r"(?:try again|resets?|reset) in (\d+(?:\.\d+)?)\s*(minute|min|hour|hr|h)\w*", text, re.I)
    if not m:
        return None
    n = float(m.group(1))
    return n / 60 if m.group(2).lower().startswith("m") else n


def classify_failure(text: str, agent: dict) -> dict:
    if AUTH.search(text):
        return {"status": "infra_error", "auth": True}
    if any(re.search(p, text, re.I) for p in (agent.get("quota_patterns") or QUOTA)):
        return {"status": "quota_paused", "reset_hours": quota_reset_hours(text)}
    return {"status": "infra_error"}


# ------------------------------------------------------------------ the call


def run_proc(args: list[str], cwd: Path, stdin: str, timeout: int, env: dict, out: Path, err: Path) -> tuple[int | None, bool]:
    """Run in its own process group with output spooled to files. Returns (exit code, timed out)."""
    with out.open("wb") as fo, err.open("wb") as fe:
        p = subprocess.Popen(args, cwd=cwd, stdin=subprocess.PIPE, stdout=fo, stderr=fe, env=env,
                             start_new_session=True)
        try:
            p.communicate(stdin.encode(), timeout=timeout)
            return p.returncode, False
        except subprocess.TimeoutExpired:
            try:
                os.killpg(p.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            p.wait()
            return None, True


def confinement_for(role: str, ws: dict) -> dict:
    """What the outer confinement allows: the call's own two directories, the CLI install dirs."""
    writable = [ws["private"]] + ([ws["workspace"].parent] if role == "author" else [ws["scratch"]])
    return {"deny_read": ws["deny"], "allow_read": [ws["workspace"].parent, ws["private"], *ws.get("read_allow", [])],
            "writable": writable, "read_only": [ws["workspace"]] if role == "checker" else []}


def run_call(agent: dict, role: str, prompt: str, ws: dict, call_dir: Path, timeout: int, stub: dict | None = None,
             verdict: bool = True) -> dict:
    """One agent call. ws: {"workspace", "scratch", "private", "deny", "read_allow"}. Returns a
    record whose status is ok, quota_paused, infra_error, author_timeout or inconclusive (§5)."""
    call_dir.mkdir(parents=True, exist_ok=True)
    (call_dir / "prompt.md").write_text(prompt)
    kind = agent["kind"]
    start = time.monotonic()
    rec: dict = {"kind": kind, "role": role, "model_requested": agent.get("model"), "model_resolved": None}
    if kind == "stub":
        rec.update(stub_call(agent, role, prompt, ws["workspace"], stub or {}))
        rec["usage"] = norm_usage("stub", rec.pop("usage_raw", None))
    else:
        rec.update(_real_call(agent, role, prompt, ws, call_dir, timeout))
    rec["seconds"] = round(time.monotonic() - start, 1)
    if role == "checker" and verdict and rec["status"] == "ok":
        v, why = parse_verdict(rec.get("text", ""))
        if v is None:
            rec.update({"status": "inconclusive", "why": why})
        else:
            rec["verdict"] = v
    return rec


def _real_call(agent: dict, role: str, prompt: str, ws: dict, call_dir: Path, timeout: int) -> dict:
    kind = agent["kind"]
    priv = Path(ws["private"])
    last = priv / "last-message.txt"
    env = clean_env(login_store(agent, priv))
    env.update(agent.get("isolation", {}).get("env", {}))
    binp = resolve_bin(agent)
    if not binp:
        return {"status": "infra_error", "why": f"{kind} CLI not found", "usage": norm_usage(kind, None)}
    deny = [confine.canonical(d) for d in ws["deny"]]
    if kind == "claude":
        args = [binp, *claude_args(agent, role, ws["workspace"], ws.get("scratch"), deny)]
    elif kind == "codex":
        args = [binp, *codex_args(agent, role, ws["workspace"], ws.get("scratch"), deny, last)]
    else:
        raise SystemExit(f"unknown agent kind {kind}")
    c = confinement_for(role, ws)
    argv, conf = confine.wrap(args, deny_read=c["deny_read"], allow_read=c["allow_read"] + [str(Path(binp).parent)],
                              writable=c["writable"], read_only=c["read_only"], network=True)
    (call_dir / "argv.json").write_text(json.dumps(args[1:], indent=1))
    so, se = call_dir / "stdout.jsonl", call_dir / "stderr.txt"
    code, timed_out = run_proc(argv, ws["workspace"], prompt, timeout, env, so, se)
    rec: dict = {"exit": code, "confinement": conf}
    if so.stat().st_size + se.stat().st_size > OUTPUT_CAP:
        return {**rec, "status": "infra_error", "why": "output over the cap", "usage": norm_usage(kind, None)}
    stdout, stderr = so.read_text(errors="replace"), se.read_text(errors="replace")
    text, usage, failed = None, None, None
    if kind == "claude":
        p = parse_claude(stdout)
        rec["tools_offered"] = p["tools"]
        rec["tool_uses"] = p["tool_uses"]
        rec["model_resolved"] = p["model"]
        res = p["result"]
        if res:
            usage = res.get("usage")
            rec["model_usage"] = res.get("modelUsage")
            sub = res.get("subtype") or ""
            if res.get("is_error") or sub.startswith("error"):
                failed = f"{sub}: {str(res.get('result') or '')[:300]}"
                if sub == "error_max_turns":
                    rec["max_turns"] = True
            else:
                text = res.get("result") if isinstance(res.get("result"), str) else None
    else:
        p = parse_codex(stdout)
        rec["tool_uses"] = p["tool_uses"]
        rec["model_resolved"] = p["model"]
        usage = p["usage"]
        failed = p["failed"]
        if last.exists():
            text = last.read_text(errors="replace")
    rec["usage"] = norm_usage(kind, usage)
    if timed_out:
        return {**rec, "status": "author_timeout" if role == "author" else "inconclusive",
                "why": f"timeout after {timeout} s"}
    if rec.get("max_turns"):
        return {**rec, "status": "author_timeout" if role == "author" else "inconclusive", "why": "turn limit reached"}
    if code != 0 or failed:
        return {**rec, **classify_failure(stdout[-4000:] + stderr[-4000:] + (failed or ""), agent),
                "why": (failed or stderr or stdout)[-500:]}
    if text is None:
        return {**rec, "status": "infra_error", "why": "no final message"}
    return {**rec, "status": "ok", "text": text}


# ------------------------------------------------------------------ offline stand-in


def stub_call(agent: dict, role: str, prompt: str, workspace: Path, stub: dict) -> dict:
    """Deterministic stand-in for the offline tests. The author applies the fixture's stub patch;
    the checker fails an added TODO line, and a strict checker also fails a diff that adds no
    `raise` when the issue asks for an error, so the two stubs can disagree."""
    if stub.get("force"):
        return {"status": stub["force"], "why": "simulated", "usage_raw": {"input": 10, "output": 5}}
    usage = {"input": 100, "cached_input": 0, "output": 20}
    model = agent.get("model")
    if "ISOLATION PROBE" in prompt:
        out = []
        for ln in prompt.splitlines():
            if ln.startswith("READ: "):
                path = Path(ln[6:].strip())
                inside = not path.is_absolute()
                if inside or agent.get("leaky"):
                    try:
                        out.append((workspace / path if inside else path).read_text().strip())
                    except OSError:
                        out.append("denied")
        out.append("COUNT=1")
        uses = [{"name": "Bash", "input": ln[6:]} for ln in prompt.splitlines() if ln.startswith("READ: ")]
        if not agent.get("lazy"):
            uses.append({"name": "Bash", "input": "curl"})
        return {"status": "ok", "text": "\n".join(out), "usage_raw": usage, "model_resolved": model,
                "tool_uses": [] if agent.get("lazy") else uses, "tools_offered": ["Read", "Bash"]}
    if role == "author":
        p = stub.get("patch_file")
        if p and Path(p).exists():
            subprocess.run(["git", "apply", str(p)], cwd=workspace, check=True, capture_output=True)
        return {"status": "ok", "text": "done", "usage_raw": usage, "model_resolved": model}
    diff = prompt.split("<diff>")[-1]
    added = [ln for ln in diff.splitlines() if ln.startswith("+") and not ln.startswith("+++")]
    defects = [{"location": "patch", "reason": "added line still marked TODO"}] if any("TODO" in ln for ln in added) else []
    if agent.get("strict") and "Error" in prompt.split("<diff>")[0] and not any("raise" in ln for ln in added):
        defects.append({"location": "patch", "reason": "no error raised for invalid input"})
    if agent.get("malformed"):
        return {"status": "ok", "text": "looks fine to me", "usage_raw": usage, "model_resolved": model}
    v = {"verdict": "fail" if defects else "pass", "defects": defects}
    return {"status": "ok", "text": f"<verdict>{json.dumps(v)}</verdict>", "usage_raw": usage, "model_resolved": model}
