"""Agent calls: matched capabilities, isolation flags mirroring daemon/internal/runner, prompts on
stdin, and the failure taxonomy (DESIGN.md §4, §5)."""

from __future__ import annotations

import json
import os
import re
import shutil
import signal
import subprocess
import time
from pathlib import Path

from .common import HERE, read_json

# Mirrors daemon/internal/runner/sandbox.go ClaudeIsolationArgs and CodexDisabledFeatures.
CLAUDE_ISOLATION = ["--restricted", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}',
                    "--setting-sources", "", "--disable-slash-commands", "--no-session-persistence"]
CODEX_DISABLED = ["apps", "browser_use", "browser_use_external", "browser_use_full_cdp_access", "computer_use",
                  "daemon_auto_start", "deferred_tool_world_state", "goals", "guardian_approval", "hooks",
                  "image_generation", "in_app_browser", "in_app_local_automation", "memories", "multi_agent",
                  "plugin_discovery_prefetch", "plugin_sharing", "plugins", "remote_plugin", "shell_snapshot",
                  "skill_mcp_dependency_install", "skill_search", "tool_call_mcp_elicitation", "tool_suggest",
                  "view_image", "workspace_dependencies"]
CLAUDE_TOOLS = {"author": "Read,Edit,Write,Glob,Grep,Bash", "checker": "Read,Glob,Grep,Bash"}
CLAUDE_DENIED_TOOLS = "mcp__*,Agent,WebSearch,WebFetch,Task"
BILLING_ENV = ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "OPENAI_API_KEY", "CODEX_API_KEY",
               "AZURE_OPENAI_API_KEY", "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX")
# Local flags that may come from agents.local.json: transport only, never model, effort, tools or sandbox.
LOCAL_ALLOWED = {"codex": {"openai_base_url"}, "claude": set()}
LOCAL_KEYS = {"config", "login_store", "bin"}
DEFAULT_QUOTA = [r"usage limit", r"rate.?limit", r"quota", r"\b429\b", r"too many requests", r"limit reached",
                 r"resets? (at|in)"]
DEFAULT_AUTH = [r"not (signed|logged) in", r"\blogin\b required", r"unauthori[sz]ed", r"\b401\b", r"invalid.*token"]
VERDICT = re.compile(r"<verdict>\s*(\{.*?\})\s*</verdict>", re.S)


def load_local(name: str) -> dict:
    p = HERE / "agents.local.json"
    if not p.exists():
        return {}
    extra = read_json(p).get(name, {})
    bad = (set(extra.get("config", {})) - LOCAL_ALLOWED.get(name, set())) | (set(extra) - LOCAL_KEYS)
    if bad:
        raise SystemExit(f"agents.local.json may only set transport and sign-in for {name} (§9); refused: "
                         f"{sorted(bad)}")
    return extra


def local_record(name: str) -> dict:
    """What the run record keeps from agents.local.json (§9): allowlisted transport values and the
    sign-in mode. Paths and anything secret stay out."""
    ex = load_local(name)
    return {"config": ex.get("config", {}), "login_mode": ex.get("login_store", {}).get("mode"),
            "custom_bin": "bin" in ex}


def effective(agent: dict) -> dict:
    """The frozen agent spec plus its local sign-in and binary location, nothing else."""
    ex = load_local(agent.get("local_name", agent["kind"]))
    out = dict(agent)
    if "login_store" in ex:
        out["login_store"] = ex["login_store"]
    if "bin" in ex:
        out["bin"] = ex["bin"]
    out["_local_config"] = ex.get("config", {})
    return out


# ------------------------------------------------------------------ environment and login stores


def clean_env(extra: dict) -> dict:
    keep = {k: v for k, v in os.environ.items() if k in ("PATH", "LANG", "LC_ALL", "TERM", "TMPDIR", "USER", "LOGNAME")}
    keep.update({"PYTHONDONTWRITEBYTECODE": "1"})
    keep.update(extra)
    for k in BILLING_ENV:
        keep.pop(k, None)
    return keep


def login_store(agent: dict, call_dir: Path) -> dict:
    """call_dir here is a private opaque directory beside the workspace, deleted after the call."""
    """A minimal, isolated login store for one CLI process (§4). Returns env additions."""
    ls = agent.get("login_store", {})
    if agent["kind"] == "stub" or not ls or ls.get("mode") == "none":
        return {}
    home = {"HOME": str(call_dir / "home")}
    if ls["mode"] == "files":  # e.g. an isolated CODEX_HOME holding only auth.json
        src = Path(os.path.expanduser(ls["source"]))
        dst = call_dir / "login"
        dst.mkdir(parents=True)
        for f in ls["files"]:
            if not (src / f).exists():
                raise SystemExit(f"sign-in file {f} not found for {agent['kind']}")
            shutil.copy2(src / f, dst / f)
            os.chmod(dst / f, 0o600)
        return {ls["env"]: str(dst), **home}
    if ls["mode"] == "token_file":  # e.g. a `claude setup-token` subscription token kept in a 0600 file
        src = Path(os.path.expanduser(ls["source"]))
        if src.stat().st_mode & 0o077:
            raise SystemExit(f"{src} must be readable by its owner only (chmod 600)")
        return {ls["env"]: src.read_text().strip(), **home}
    raise SystemExit(f"unknown login_store mode {ls['mode']!r}")


# ------------------------------------------------------------------ commands


def claude_settings(workspace: Path, denied: list[str]) -> str:
    rules = []
    for d in denied:  # "//" marks an absolute path in Claude Code permission rules
        a = "/" + str(d) if str(d).startswith("/") else str(d)
        rules += [f"Read({a})", f"Read({a}/**)", f"Edit({a})", f"Edit({a}/**)"]
    return json.dumps({
        "sandbox": {"enabled": True, "failIfUnavailable": True, "allowUnsandboxedCommands": False,
                    "autoAllowBashIfSandboxed": False, "filesystem": {"denyRead": denied},
                    "network": {"allowedDomains": []}},
        "permissions": {"defaultMode": "acceptEdits", "blockReadsOutsideWorkingDirectories": True, "deny": rules},
        "autoMemoryEnabled": False,
    }, separators=(",", ":"))


def toml_str(s: str) -> str:
    return json.dumps(s)


def codex_args(role: str, workspace: Path, scratch: Path | None, denied: list[str], model: str,
               effort: str | None, last: Path, local: dict) -> list[str]:
    fs = {":root": "read", ":slash_tmp": "read", ":tmpdir": "read"}
    for d in denied:
        fs[str(d)] = "deny"
    fs[str(workspace)] = "write" if role == "author" else "read"
    if scratch:
        fs[str(scratch)] = "write"
    inline = ",".join(f"{toml_str(k)}={toml_str(fs[k])}" for k in sorted(fs))
    args = ["exec", "--json", "--skip-git-repo-check", "-C", str(workspace), "-m", model, "-o", str(last),
            "--ignore-user-config", "--ignore-rules", "--ephemeral", "-c", 'default_permissions="control-rod"']
    if role == "author":
        args += ["-c", 'permissions.control-rod.extends=":workspace"']
    args += ["-c", "permissions.control-rod.filesystem={" + inline + "}",
             "-c", "permissions.control-rod.network.enabled=false",
             "-c", 'approval_policy="never"', "-c", 'web_search="disabled"', "-c", "notify=[]",
             "-c", 'shell_environment_policy.inherit="core"', "-c", "check_for_update_on_startup=false"]
    if effort:
        args += ["-c", f"model_reasoning_effort={toml_str(effort)}"]
    for k, v in sorted(local.get("config", {}).items()):
        args += ["-c", f"{k}={toml_str(v)}"]
    for f in CODEX_DISABLED:
        args += ["--disable", f]
    return args + ["-"]


def claude_args(role: str, workspace: Path, denied: list[str], model: str, effort: str | None,
                max_turns: int | None) -> list[str]:
    tools = CLAUDE_TOOLS[role]
    args = ["-p", "--output-format", "json", "--model", model, "--permission-mode", "acceptEdits",
            "--tools", tools, "--allowedTools", tools, "--disallowedTools", CLAUDE_DENIED_TOOLS,
            *CLAUDE_ISOLATION, "--settings", claude_settings(workspace, denied)]
    if effort:
        args += ["--effort", effort]
    if max_turns:
        args += ["--max-turns", str(max_turns)]
    return args


# ------------------------------------------------------------------ usage and identity


def norm_usage(kind: str, usage: dict) -> dict:
    """Token counts on one scale for both vendors, each token counted once."""
    g = lambda k: int(usage.get(k) or 0)  # noqa: E731
    if kind == "claude":
        inp = g("input_tokens") + g("cache_creation_input_tokens")
        cached = g("cache_read_input_tokens")
        out = g("output_tokens")
    elif kind == "codex":
        cached = g("cached_input_tokens")
        inp = g("input_tokens") - cached  # Codex counts cached input inside input_tokens
        out = g("output_tokens")  # reasoning_output_tokens are inside output_tokens
    else:
        inp, cached, out = g("input"), g("cached_input"), g("output")
    if not usage:
        return {"known": False, "input": 0, "cached_input": 0, "output": 0, "total": 0}
    return {"known": True, "input": max(inp, 0), "cached_input": cached, "output": out,
            "total": max(inp, 0) + cached + out}


def codex_events(stdout: str) -> tuple[dict, str | None]:
    usage, model = {}, None
    for line in stdout.splitlines():
        try:
            e = json.loads(line)
        except json.JSONDecodeError:
            continue
        if e.get("type") == "turn.completed" and isinstance(e.get("usage"), dict):
            for k, v in e["usage"].items():
                if isinstance(v, int):
                    usage[k] = usage.get(k, 0) + v
        for k in ("model", "model_slug"):
            if isinstance(e.get(k), str):
                model = e[k]
    return usage, model


# ------------------------------------------------------------------ verdicts


def parse_verdict(text: str) -> tuple[dict | None, str | None]:
    """Strict schema (§5): {"verdict": "pass"|"fail", "defects": [{"location", "reason"}]}.
    Returns (verdict, None) or (None, why it is malformed)."""
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
    return v, None


# ------------------------------------------------------------------ the call


def run_proc(args: list[str], cwd: Path, stdin: str, timeout: int, env: dict) -> subprocess.CompletedProcess:
    """Run in its own process group so a timeout stops the CLI and everything it started."""
    p = subprocess.Popen(args, cwd=cwd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                         text=True, env=env, start_new_session=True)
    try:
        out, err = p.communicate(stdin, timeout=timeout)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(p.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        p.communicate()
        raise
    return subprocess.CompletedProcess(args, p.returncode, out, err)


def classify_failure(text: str, agent: dict) -> str:
    pats = agent.get("quota_patterns") or DEFAULT_QUOTA
    if any(re.search(p, text, re.I) for p in pats):
        return "quota_paused"
    return "infra_error"


def run_call(agent: dict, role: str, prompt: str, workspace: Path, scratch: Path | None, call_dir: Path,
             denied: list[str], timeout: int, stub: dict | None = None, private: Path | None = None,
             verdict: bool = True) -> dict:
    """One agent call. Returns a record whose `status` is one of: ok, quota_paused, infra_error,
    author_timeout, inconclusive (§5 taxonomy). call_dir keeps the record; private holds the
    per-call sign-in and HOME and is emptied afterwards."""
    call_dir.mkdir(parents=True, exist_ok=True)
    (call_dir / "prompt.md").write_text(prompt)
    kind = agent["kind"]
    start = time.monotonic()
    rec: dict = {"kind": kind, "role": role, "model_requested": agent.get("model")}
    if kind == "stub":
        out = stub_call(agent, role, prompt, workspace, stub or {})
        rec.update(out)
    else:
        last = call_dir / "last-message.txt"
        last.unlink(missing_ok=True)
        private = private or call_dir
        env = clean_env({**login_store(agent, private), **{k: v for k, v in agent.get("env", {}).items()}})
        if "HOME" in env:
            Path(env["HOME"]).mkdir(parents=True, exist_ok=True)
        if kind == "claude":
            denied = [d for d in denied if not str(workspace).startswith(str(d).rstrip("/") + "/")]
            env.update({"CLAUDE_CODE_DISABLE_AUTO_MEMORY": "1", "CLAUDE_CODE_DISABLE_BACKGROUND_TASKS": "1",
                        "DISABLE_AUTOUPDATER": "1", "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1"})
            args = [agent.get("bin", "claude"), *claude_args(role, workspace, denied, agent["model"],
                                                            agent.get("effort"), agent.get("max_turns"))]
        elif kind == "codex":
            args = [agent.get("bin", "codex"), *codex_args(role, workspace, scratch, denied, agent["model"],
                                                          agent.get("effort"), last,
                                                          {"config": agent.get("_local_config", {})})]
        else:
            raise SystemExit(f"unknown agent kind {kind}")
        (call_dir / "argv.json").write_text(json.dumps(args[1:], indent=1))
        try:
            r = run_proc(args, workspace, prompt, timeout, env)
        except subprocess.TimeoutExpired:
            rec.update({"status": "author_timeout" if role == "author" else "inconclusive",
                        "why": f"timeout after {timeout} s", "exit": None, "usage_raw": {}})
        else:
            (call_dir / "stdout.txt").write_text(r.stdout)
            (call_dir / "stderr.txt").write_text(r.stderr)
            rec["exit"] = r.returncode
            text, usage, model = "", {}, None
            if kind == "claude":
                try:
                    j = json.loads(r.stdout)
                except json.JSONDecodeError:
                    j = {}
                text, usage = j.get("result", ""), j.get("usage", {})
                model = ",".join(sorted((j.get("modelUsage") or {}).keys())) or None
                if j.get("is_error") and r.returncode == 0:
                    r = subprocess.CompletedProcess(args, 1, r.stdout, r.stderr)
                    rec["exit"] = 1
            else:
                usage, model = codex_events(r.stdout)
                text = last.read_text() if last.exists() else None
            rec.update({"usage_raw": usage, "model_resolved": model})
            if r.returncode != 0:
                rec.update({"status": classify_failure(r.stdout + r.stderr + (text or ""), agent),
                            "why": (r.stderr or text or "")[-500:]})
            elif text is None:
                rec.update({"status": "infra_error", "why": "stale or missing final message"})
            else:
                rec["text"] = text
                rec["status"] = "ok"
        for f in ("login", "home"):
            shutil.rmtree(private / f, ignore_errors=True)
    rec["seconds"] = round(time.monotonic() - start, 1)
    rec["usage"] = norm_usage(kind, rec.get("usage_raw") or {})
    if role == "checker" and verdict and rec["status"] == "ok":
        v, why = parse_verdict(rec.get("text", ""))
        if v is None:
            rec.update({"status": "inconclusive", "why": why})
        else:
            rec["verdict"] = v
    return rec


# ------------------------------------------------------------------ offline stand-in


def stub_call(agent: dict, role: str, prompt: str, workspace: Path, stub: dict) -> dict:
    """Deterministic stand-in for the offline tests. The author applies the fixture's stub patch;
    the checker fails an added TODO line, and a strict checker also fails a diff that adds no
    `raise` when the issue asks for an error, so the two stubs can disagree."""
    if stub.get("force"):
        return {"status": stub["force"], "why": "simulated", "usage_raw": {"input": 10, "output": 5}}
    usage = {"input": 100, "cached_input": 0, "output": 20}
    if "ISOLATION PROBE" in prompt:
        # a sealed stub reads only its own tree; a leaky one (for the tests) reads every path it is shown
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
        if agent.get("leaky") and role == "checker":
            try:
                (workspace / "PROBE_WRITE.txt").write_text("x")
            except OSError:
                pass
        out.append("COUNT=1")
        return {"status": "ok", "text": "\n".join(out), "usage_raw": usage, "model_resolved": agent.get("model")}
    if role == "author":
        p = stub.get("patch_file")
        if p and Path(p).exists():
            subprocess.run(["git", "apply", str(p)], cwd=workspace, check=True, capture_output=True)
        return {"status": "ok", "text": "done", "usage_raw": usage, "model_resolved": agent.get("model")}
    diff = prompt.split("<diff>")[-1]
    added = [ln for ln in diff.splitlines() if ln.startswith("+") and not ln.startswith("+++")]
    bad = [ln for ln in added if "TODO" in ln]
    defects = [{"location": "patch", "reason": "added line still marked TODO"}] if bad else []
    if agent.get("strict") and "Error" in prompt.split("<diff>")[0] and not any("raise" in ln for ln in added):
        defects.append({"location": "patch", "reason": "no error raised for invalid input"})
    if agent.get("malformed"):
        return {"status": "ok", "text": "looks fine to me", "usage_raw": usage, "model_resolved": agent.get("model")}
    v = {"verdict": "fail" if defects else "pass", "defects": defects}
    return {"status": "ok", "text": f"<verdict>{json.dumps(v)}</verdict>", "usage_raw": usage,
            "model_resolved": agent.get("model")}
