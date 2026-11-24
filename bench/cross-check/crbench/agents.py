"""Agent calls (DESIGN.md §4, §5): the frozen isolation flags from agents.json, prompts on stdin,
an outer OS confinement (confine.py), output spooled to files, and the failure taxonomy.

Each call gets two opaque directories under the workspace root: the workspace (the tree, plus
scratch for a checker) and a private directory (its own sign-in copy, HOME and TMPDIR). Both are
deleted after the call. A CLI's own tool shell can read that CLI's own sign-in, as in Control
Rod's daemon; it can never read the other vendor's."""

from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
import shutil
import signal
import subprocess
import threading
import time
from pathlib import Path

from . import confine
from . import container as ctr
from .common import HERE, Refused, read_json

BILLING_ENV = ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "OPENAI_API_KEY", "OPENAI_BASE_URL",
               "CODEX_API_KEY", "AZURE_OPENAI_API_KEY", "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX",
               "CLAUDE_CODE_USE_FOUNDRY", "AWS_BEARER_TOKEN_BEDROCK")
KEEP_ENV = ("PATH", "LANG", "LC_ALL", "TERM", "USER", "LOGNAME")
CREDENTIAL_ENV = ("CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "OPENAI_API_KEY",
                  "CODEX_API_KEY")
LOCAL_KEYS = {"config", "login_store"}
LOCAL_LOGIN_KEYS = {"source"}
QUOTA = [r"usage limit", r"limit reached", r"rate.?limit", r"\b429\b", r"too many requests", r"quota"]
AUTH = re.compile(r"not (signed|logged) in|log ?in required|please (run )?(/)?login|unauthori[sz]ed|\b401\b|"
                  r"invalid (api key|token|bearer)|token (has )?expired|authentication_error|oauth token", re.I)
VERDICT = re.compile(r"<verdict>\s*(\{.*?\})\s*</verdict>", re.S)
OUTPUT_CAP = 64 * 1024 * 1024


# ------------------------------------------------------------------ local overrides


def load_local(name: str, agent: dict | None = None) -> dict:
    """agents.local.json: where the sign-in store lives and allowlisted transport values only.
    Never the store's mode, model, effort, tools, sandbox or CLI binary (the CLI is in the pinned
    image) (§9)."""
    p = HERE / "agents.local.json"
    if not p.exists():
        return {}
    extra = read_json(p).get(name, {})
    bad = set(extra) - LOCAL_KEYS
    bad |= {f"login_store.{k}" for k in set(extra.get("login_store", {})) - LOCAL_LOGIN_KEYS}
    allow = (agent or {}).get("transport_allow", {})
    for k, v in extra.get("config", {}).items():
        if k not in allow or v not in allow[k]:
            bad.add(f"config.{k}={v}")
    if bad:
        raise SystemExit(f"agents.local.json may set only the sign-in source and allowlisted transport for {name} "
                         f"(§9); refused: {sorted(bad)}")
    return extra


def effective(agent: dict, name: str) -> dict:
    """The frozen spec plus its local sign-in, binary and readable install dirs."""
    ex = load_local(name, agent)
    out = dict(agent)
    if "login_store" in ex:
        out["login_store"] = {**(agent.get("login_store") or {}), **ex["login_store"]}
    out["_local_config"] = ex.get("config", {})
    out["_name"] = name
    return out


def local_record(name: str, agent: dict | None = None) -> dict:
    """What the record keeps from agents.local.json: allowlisted transport values and the sign-in
    mode; never paths or secrets."""
    ex = load_local(name, agent)
    return {"config": ex.get("config", {}), "login_mode": (agent or {}).get("login_store", {}).get("mode"),
            "custom_sign_in_source": "source" in ex.get("login_store", {})}


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


TOKEN_PREFIX = "sk-ant-oat"  # a subscription OAuth token; an API key starts "sk-ant-api"


def read_token_file(src: Path) -> str:
    if src.is_symlink() or not src.is_file() or src.stat().st_mode & 0o077:
        raise SystemExit(f"{src} must be a regular file readable by its owner only (chmod 600)")
    tok = src.read_text().strip()
    if not tok.startswith(TOKEN_PREFIX) or any(c.isspace() for c in tok):
        raise SystemExit(f"{src} does not hold a subscription token from `claude setup-token`")
    return tok


def write_claude_credentials(cdir: Path, tok: str) -> Path:
    """Claude Code's own credentials file (`.credentials.json` in its config directory), holding
    the long-lived setup token as the access token. No refresh token: nothing rotates."""
    cdir.mkdir(parents=True, exist_ok=True, mode=0o700)
    f = cdir / ".credentials.json"
    body = {"claudeAiOauth": {"accessToken": tok, "refreshToken": None,
                              "expiresAt": int((time.time() + 300 * 86400) * 1000), "scopes": ["user:inference"]}}
    fd = os.open(f, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "w") as fh:
        json.dump(body, fh)
    return f


def synthetic_login(agent: dict, private: Path, sentinel: str) -> dict:
    """The same layout as login_store, holding a sentinel instead of a credential: admission and
    the boundary probes never copy a real sign-in."""
    ls = agent.get("login_store") or {}
    home, tmp = private / "home", private / "tmp"
    home.mkdir(parents=True, exist_ok=True)
    tmp.mkdir(parents=True, exist_ok=True)
    env = {"HOME": str(home), "TMPDIR": str(tmp)}
    if ls.get("mode") == "files":
        dst = private / "login"
        dst.mkdir(parents=True)
        for f in ls["files"]:
            (dst / f).write_text(json.dumps({"sentinel": sentinel}))
        return {**env, ls["env"]: str(dst)}
    if ls.get("mode") == "token_file":
        cdir = private / "claude"
        write_claude_credentials(cdir, sentinel)
        return {**env, ls["config_env"]: str(cdir)}
    return env


WRITE_BACK_MAX = 256 * 1024
_CHECKOUT: dict[str, dict[str, str]] = {}  # private dir -> digest of each store file when it was copied


def _store_ok_for_write_back(src: Path) -> bool:
    """Write-back goes only to a dedicated store: never the owner's everyday ~/.codex, never a link."""
    try:
        everyday = (Path.home() / ".codex").resolve(strict=False)
        return not src.is_symlink() and src.resolve(strict=False) != everyday and everyday not in src.resolve().parents
    except OSError:
        return False


def _valid_codex_auth(j) -> bool:
    if not isinstance(j, dict) or not isinstance(j.get("tokens"), dict):
        return False
    t = j["tokens"]
    if not (isinstance(t.get("access_token"), str) and isinstance(t.get("refresh_token"), str)):
        return False
    if j.get("OPENAI_API_KEY") or j.get("api_key") or str(j.get("auth_mode", "")).lower().startswith("api"):
        return False  # a refreshed sign-in never turns into a billed API key
    return True


def write_back_login(agent: dict, private: Path) -> bool:
    """A CLI may refresh its sign-in during a call (Codex rotates its refresh token). For a store
    marked write_back (the benchmark's own sign-in, never the owner's everyday one), the refreshed
    copy replaces the store atomically after the container is gone, so the next call starts from
    the live token. Guards: no link anywhere on the path, a size cap, the expected shape with no
    API key, and no overwrite if the store changed since this call's copy was taken (a conflict
    is left for the owner, never resolved by rolling back). Returns True if the store was updated."""
    ls = agent.get("login_store") or {}
    if ls.get("mode") != "files" or not ls.get("write_back"):
        return False
    src = Path(os.path.expanduser(ls["source"]))
    checkout = _CHECKOUT.get(str(private))
    login = private / "login"
    if checkout is None or not _store_ok_for_write_back(src) or login.is_symlink() or not login.is_dir():
        return False
    changed = False
    for f in ls["files"]:
        new, old = login / f, src / f
        if new.is_symlink() or old.is_symlink() or not new.is_file() or not old.is_file():
            continue
        if new.stat().st_size > WRITE_BACK_MAX:
            continue
        data = new.read_bytes()
        cur = old.read_bytes()
        if data == cur:
            continue
        if hashlib.sha256(cur).hexdigest() != checkout.get(f):
            continue  # the store moved on since this copy was taken: never roll it back
        try:
            j = json.loads(data)
        except (json.JSONDecodeError, UnicodeDecodeError):
            continue  # a half-written or foreign file never replaces a working sign-in
        if not _valid_codex_auth(j):
            continue
        tmp = src / f".{f}.{secrets.token_hex(4)}"
        try:
            fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            with os.fdopen(fd, "wb") as fh:
                fh.write(data)
                fh.flush()
                os.fsync(fh.fileno())
            os.replace(tmp, old)
        except BaseException:
            tmp.unlink(missing_ok=True)
            raise
        changed = True
    return changed


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
        digests = {}
        for f in ls["files"]:
            if not (src / f).is_file() or (src / f).is_symlink():
                raise SystemExit(f"sign-in file {f} not found (or a link) for {agent['kind']}")
            data = (src / f).read_bytes()
            digests[f] = hashlib.sha256(data).hexdigest()
            (dst / f).write_bytes(data)
            os.chmod(dst / f, 0o600)
        _CHECKOUT[str(private)] = digests
        return {**env, ls["env"]: str(dst)}
    if ls["mode"] == "token_file":  # a `claude setup-token` subscription token in a 0600 file
        tok = read_token_file(src)
        # The token goes into a credentials file in the CLI's own config directory, never into the
        # environment: every tool process inherits the environment, and the CLI's sandbox denies
        # this directory to tool processes (preflight admission proves it with a sentinel).
        cdir = private / "claude"
        write_claude_credentials(cdir, tok)
        return {**env, ls["config_env"]: str(cdir)}
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
    def num(v):  # bool is an int subclass; True is not a token count
        return isinstance(v, int) and not isinstance(v, bool) and v >= 0
    if any(not num(usage.get(k)) for k in need):
        return unknown
    g = lambda k: usage.get(k) if num(usage.get(k)) else 0  # noqa: E731
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
    """text is the CLI's own error output (stderr and its error event), never the transcript, whose
    tool output can mention 401 or quota for reasons of its own. A usage limit is checked first."""
    if any(re.search(p, text, re.I) for p in (agent.get("quota_patterns") or QUOTA)):
        return {"status": "quota_paused", "reset_hours": quota_reset_hours(text)}
    if AUTH.search(text):
        return {"status": "infra_error", "auth": True}
    return {"status": "infra_error"}


# ------------------------------------------------------------------ the call


def kill_group(pgid: int) -> None:
    try:
        os.killpg(pgid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        pass


def run_proc(args: list[str], cwd: Path, stdin: str, timeout: int, env: dict, out: Path, err: Path,
             cap: int = OUTPUT_CAP, pid_file: Path | None = None) -> tuple[int | None, str | None]:
    """Run in its own process group. Output is read through pipes and written to files by the
    harness, which stops writing at the cap, so no file ever grows past it. The group is killed on
    every exit, so no child outlives the call. pid_file records the group for recovery after a crash
    of the harness itself. Returns (exit code, None | "timeout" | "output cap")."""
    written = [0]
    over = threading.Event()
    lock = threading.Lock()

    def pump(src, dst: Path):
        with dst.open("wb") as f:
            for chunk in iter(lambda: src.read(65536), b""):
                with lock:
                    room = cap - written[0]
                    take = chunk[:max(room, 0)]
                    written[0] += len(take)
                if take:
                    f.write(take)
                if len(take) < len(chunk):
                    over.set()
                    break
        src.close()

    p = subprocess.Popen(args, cwd=cwd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                         env=env, start_new_session=True)
    if pid_file is not None:
        pid_file.write_text(str(p.pid))
    pumps = [threading.Thread(target=pump, args=(p.stdout, out), daemon=True),
             threading.Thread(target=pump, args=(p.stderr, err), daemon=True)]
    for t in pumps:
        t.start()
    stop = None
    try:
        try:
            p.stdin.write(stdin.encode())
            p.stdin.close()
        except BrokenPipeError:
            pass
        deadline = time.monotonic() + timeout
        while p.poll() is None:
            if over.is_set():
                stop = "output cap"
                break
            if time.monotonic() > deadline:
                stop = "timeout"
                break
            time.sleep(0.05)
    finally:
        kill_group(p.pid)
        p.wait()
        for t in pumps:
            t.join(timeout=10)
        if pid_file is not None:
            pid_file.unlink(missing_ok=True)
    if stop is None and over.is_set():
        stop = "output cap"
    return (None if stop else p.returncode), stop


def read_capped(p: Path, cap: int = 4 * 1024 * 1024) -> str:
    with p.open("rb") as f:
        return f.read(cap).decode("utf-8", errors="replace")


def cli_denies(ws: dict) -> list[str]:
    """The read denials handed to a CLI's own sandbox: every outer denial that does not contain the
    call's own directories (those are left to the outer layer and to the opaque names), plus every
    other directory already in the workspace root, by name. Runs are sequential under the run lock,
    so no sibling appears during a call."""
    own = [confine.canonical(ws["workspace"]), confine.canonical(ws["private"])]
    if ws.get("scratch"):
        own.append(confine.canonical(ws["scratch"]))

    def contains(d, p):
        return p == d or p.startswith(d.rstrip("/") + "/")
    keep = [d for d in (confine.canonical(x) for x in ws["deny"]) if not any(contains(d, o) for o in own)]
    wsdir = Path(ws["workspace"]).parent
    root = wsdir.parent
    mine = {confine.canonical(wsdir), confine.canonical(ws["private"])}
    try:
        sibs = [confine.canonical(p) for p in root.iterdir() if confine.canonical(p) not in mine]
    except OSError:
        sibs = []
    return sorted(set(keep + sibs))


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


IMAGE_PATH = "/usr/local/bin:/usr/bin:/bin"


def container_env(agent: dict, priv: Path, sentinel: str | None = None) -> dict:
    """The call's environment inside its container: built from nothing, never from the host's.
    The sign-in copy and HOME live under /work/private, which each CLI's own sandbox denies to
    tool processes; TMPDIR is the container's tmpfs."""
    host = synthetic_login(agent, priv, sentinel) if sentinel is not None else login_store(agent, priv)
    env = {"PATH": IMAGE_PATH, "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8", "PYTHONDONTWRITEBYTECODE": "1", "TMPDIR": "/tmp"}
    for k, v in host.items():
        if k == "TMPDIR":
            continue
        env[k] = v.replace(str(priv), ctr.PRIVATE, 1) if isinstance(v, str) and v.startswith(str(priv)) else v
    env.update(agent.get("isolation", {}).get("env", {}))
    for k in BILLING_ENV:
        env.pop(k, None)
    for k, v in env.items():  # no credential ever travels in the environment: every tool inherits it
        if k in CREDENTIAL_ENV or str(v).startswith("sk-"):
            raise Refused("§4 sign-in", f"a credential would reach the call's environment as {k}")
    return env


def container_args(agent: dict, role: str, scratch: bool) -> list[str]:
    """The CLI's argv inside the container: fixed paths, and its own sandbox denying /work/private
    (sign-in copy, HOME, session files) to every tool process."""
    sc = Path(ctr.SCRATCH) if scratch else None
    if agent["kind"] == "claude":
        return ["claude", *claude_args(agent, role, Path(ctr.REPO), sc, [ctr.PRIVATE])]
    if agent["kind"] == "codex":
        return ["codex", *codex_args(agent, role, Path(ctr.REPO), sc, [ctr.PRIVATE],
                                     Path(ctr.PRIVATE) / "last-message.txt")]
    raise SystemExit(f"unknown agent kind {agent['kind']}")


def _container_call(agent: dict, role: str, prompt: str, ws: dict, call_dir: Path, timeout: int) -> dict:
    """One real call in its own container (container.py). Returns after the container, its proxy
    and its network are removed, so nothing it started can still write."""
    cx = agent["_container"]
    priv = Path(ws["private"])
    if ctr.image_id(cx["image"]) != cx["image"]:
        raise Refused("§9 versions", "the agent image differs from the one preflight pinned; the run stops")
    env = container_env(agent, priv)
    args = container_args(agent, role, bool(ws.get("scratch")))
    (call_dir / "argv.json").write_text(json.dumps(args[1:], indent=1))
    so, se = call_dir / "stdout.jsonl", call_dir / "stderr.txt"
    env_file = Path(cx["root"]) / f"env-{cx['lid']}"  # read by the docker client only, never mounted
    refreshed = False
    call = ctr.Call(cx["cfg"], cx["image"], cx["lid"], cx["label"], call_dir, agent.get("egress") or [],
                    cx["root"], systempaths=agent["kind"] == "claude")
    try:
        with call as c:
            env.update(c.proxy_env())
            ctr.write_env_file(env_file, env)
            argv = c.argv(role, ws, env_file, args)
            code, stop = run_proc(argv, call_dir, prompt, timeout, ctr.docker_env(), so, se, pid_file=call_dir / "pgid")
    finally:  # the container is confirmed gone (or never started): keep a refreshed sign-in even on interrupt
        env_file.unlink(missing_ok=True)
        if call.removed:  # only once removal is confirmed can nothing in the container still write
            refreshed = write_back_login(agent, priv)
    log = ctr.egress_log(call_dir)
    conf = {"mechanism": "container", "image": cx["image"], "apparmor": ctr.APPARMOR,
            "egress": {"allowed": sorted({e["host"] for e in log if e.get("decision") == "allowed"}),
                       "denied": sorted({f"{e.get('host')}: {e.get('reason')}" for e in log
                                         if e.get("decision") in ("denied", "error", "log_cap")})}}
    conf["sign_in_refreshed"] = refreshed
    return finish_real(agent, role, timeout, priv / "last-message.txt", so, se, code, stop, conf)


def _real_call(agent: dict, role: str, prompt: str, ws: dict, call_dir: Path, timeout: int) -> dict:
    if agent.get("_container"):
        return _container_call(agent, role, prompt, ws, call_dir, timeout)
    raise Refused("§4 container", "real agent calls run only in the per-call container (DESIGN-v3.4-proposal.md)")


def finish_real(agent: dict, role: str, timeout: int, last: Path, so: Path, se: Path, code, stop, conf: dict) -> dict:
    """Parse a finished CLI call's output into a record (§5 failure taxonomy)."""
    kind = agent["kind"]
    timed_out = stop == "timeout"
    rec: dict = {"exit": code, "confinement": conf}
    if stop == "output cap":
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
        if last.exists() and not last.is_symlink():
            text = read_capped(last)
    rec["usage"] = norm_usage(kind, usage)
    if timed_out:
        return {**rec, "status": "author_timeout" if role == "author" else "inconclusive",
                "why": f"timeout after {timeout} s"}
    if rec.get("max_turns"):
        return {**rec, "status": "author_timeout" if role == "author" else "inconclusive", "why": "turn limit reached"}
    if code != 0 or failed:
        return {**rec, **classify_failure((failed or "") + "\n" + stderr[-4000:], agent),
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
        uses = [{"name": "Bash", "input": ln[6:]} for ln in prompt.splitlines() if ln.startswith(("READ: ", "LIST: "))]
        if not agent.get("lazy"):
            uses.append({"name": "Bash", "input": "curl"})
            for ln in prompt.splitlines():
                if "PROBE_WRITE.txt" in ln:
                    uses.append({"name": "Bash", "input": "touch PROBE_WRITE.txt"})
                    try:
                        (workspace / "PROBE_WRITE.txt").write_text("x") if agent.get("leaky") else None
                    except OSError:
                        pass
                m = re.search(r"named ok\.txt in (\S+)\.$", ln)
                if m:
                    uses.append({"name": "Bash", "input": f"touch {m.group(1)}/ok.txt"})
                    (Path(m.group(1)) / "ok.txt").write_text("ok")
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
