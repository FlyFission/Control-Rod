"""Spike S-6: do the CLIs' own command sandboxes protect the user's normal login?

Disposable qualification experiment. The simple design keeps each CLI's ordinary login
(`claude login`, `codex login`) and sandboxes only the commands the agent runs, using each CLI's
built-in sandbox. This checks, for each CLI, with its defaults and then with the settings
Control Rod would always write, whether a command can read the login files, reach the internet,
or write outside the workspace.

The home directory is a throwaway with decoy login files holding a canary string, so no real
credential is involved. Claude Code talks to the scripted provider from S-0 over loopback with a
fixture key: no real prompt is spent. Codex runs its `codex sandbox` command, no model at all.
Run: python3 spikes/runtime-confinement/native_sandbox_spike.py --claude <native claude> \
       --codex <native codex> --deps <dir with socat-wrap and usr/bin/rg>
"""

import argparse
import http.server
import json
import os
import pathlib
import shlex
import socketserver
import subprocess
import tempfile
import threading

import broker_spike as h

CANARY = "cr-canary-login-0f3b"

# One fixed probe for both CLIs. It prints JSON so the result is machine readable.
PROBE = r"""
import json, os, pathlib, socket, urllib.request
home = os.environ["HOME"]
def attempt(fn):
    try:
        r = fn(); return "allowed" if r is None else r
    except Exception as e:
        inner = getattr(e, "reason", None)
        err = getattr(inner, "errno", None) if isinstance(inner, OSError) else getattr(e, "errno", None)
        exc = inner if isinstance(inner, OSError) else e
        return "%%s:%%s:%%s" %% (type(exc).__name__, err, str(exc)[:80].replace(":", ";"))
def read(p):
    return "LEAKED" if "%s" in pathlib.Path(home, p).read_text() else "read-no-canary"
print(json.dumps({
  "read_claude_login": attempt(lambda: read(".claude/.credentials.json")),
  "read_codex_login": attempt(lambda: read(".codex/auth.json")),
  "raw_tcp_internet": attempt(lambda: socket.create_connection(("1.1.1.1", 443), timeout=3).close()),
  "https_internet": attempt(lambda: urllib.request.urlopen("https://example.com/", timeout=8).read(16) and None),
  "write_workspace": attempt(lambda: pathlib.Path("inside-marker").write_text("x") and None),
  "write_home": attempt(lambda: pathlib.Path(home, "escape-marker").write_text("x") and None),
  "write_slash_tmp": attempt(lambda: pathlib.Path("/tmp/cr-s6-marker-%%d" %% os.getpid()).write_text("x") and None),
}))
""" % CANARY

# What Control Rod would always write. Commands never see login folders or the network.
CLAUDE_STRICT = {"sandbox": {
    "enabled": True, "failIfUnavailable": True, "allowUnsandboxedCommands": False, "autoAllowBashIfSandboxed": True,
    "filesystem": {"denyRead": ["~/.claude", "~/.codex"]},
    "network": {"allowedDomains": []},
}}
# The command sandbox does not cover Claude Code's in-process file tools; permission rules do.
CLAUDE_STRICT_FILES = {**CLAUDE_STRICT, "permissions": {
    "deny": ["Read(~/.claude/**)", "Read(~/.codex/**)", "Edit(~/.claude/**)", "Edit(~/.codex/**)"],
    "defaultMode": "acceptEdits",
}}
# Negative controls: Control Rod's settings with the login denials removed. Each must leak.
CLAUDE_WEAKENED = {"sandbox": {**CLAUDE_STRICT["sandbox"], "filesystem": {"denyRead": []}}}
CLAUDE_DEFAULT = {"sandbox": {"enabled": True, "autoAllowBashIfSandboxed": True}}


class Tcp(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True


def fake_home(root):
    home = root / "home"
    (home / ".claude").mkdir(parents=True)
    (home / ".codex").mkdir()
    (home / ".claude" / ".credentials.json").write_text(json.dumps({"claudeAiOauth": {"accessToken": CANARY}}))
    (home / ".codex" / "auth.json").write_text(json.dumps({"tokens": {"access_token": CANARY}}))
    return home


def tool_path(root, deps):
    # Claude Code's Linux sandbox wants bubblewrap, socat and ripgrep on PATH.
    b = root / "bin"
    b.mkdir()
    (b / "socat").symlink_to(deps / "socat-wrap")
    (b / "rg").symlink_to(deps / "usr" / "bin" / "rg")
    return f"{b}:/usr/bin:/bin"


def last_json(text):
    for line in reversed(str(text).strip().splitlines()):
        if line.strip().startswith("{"):
            try:
                return json.loads(line)
            except ValueError:
                pass
    return None


def run_claude(claude, deps, settings):
    h.provider_calls.clear()
    h.ATTEMPTS[:] = [("Bash", {"command": f"python3 -I -c {shlex.quote(PROBE)}", "description": "probe"})]
    server = Tcp(("127.0.0.1", 0), h.Provider)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    with tempfile.TemporaryDirectory(prefix="s6c-") as tmp:
        root = pathlib.Path(tmp)
        home, work = fake_home(root), root / "work"
        work.mkdir()
        env = {"HOME": str(home), "PATH": tool_path(root, deps), "LANG": "C.UTF-8",
               "ANTHROPIC_API_KEY": h.FIXTURE_KEY, "ANTHROPIC_BASE_URL": f"http://127.0.0.1:{server.server_port}",
               "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1"}
        r = subprocess.run([str(claude), "-p", "Spike S-6 scripted fixture.", "--tools", "Bash",
                            "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}', "--setting-sources", "",
                            "--settings", json.dumps(settings), "--no-session-persistence",
                            "--model", "fixture-model", "--max-turns", "3", "--output-format", "json"],
                           cwd=work, env=env, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=120)
        server.shutdown()
        results = [b for c in h.provider_calls for b in c["tool_results"]]
        content = results[0].get("content") if results else None
        text = content if isinstance(content, str) else " ".join(x.get("text", "") for x in content or [] if isinstance(x, dict))
        return {"exit": r.returncode, "probe": last_json(text), "tool_result_head": text[:400],
                "escape_on_host": (home / "escape-marker").exists(), "stderr_tail": r.stderr[-400:]}


# The same profile as command line overrides, so Control Rod never edits the user's config.toml.
CODEX_PROFILE_ARGS = [
    "-c", 'default_permissions="control-rod"',
    "-c", 'permissions.control-rod.extends=":workspace"',
    "-c", 'permissions.control-rod.filesystem={"~/.codex"="deny","~/.claude"="deny",":slash_tmp"="read",":tmpdir"="read"}',
    "-c", "permissions.control-rod.network.enabled=false",
]

# Negative control: the same profile without the login denials. It must leak.
CODEX_WEAKENED_ARGS = [x for pair in zip(CODEX_PROFILE_ARGS[0::2], CODEX_PROFILE_ARGS[1::2])
                       if "filesystem=" not in pair[1] for x in pair] + [
    "-c", 'permissions.control-rod.filesystem={":slash_tmp"="read",":tmpdir"="read"}']

# Control Rod's Codex profile. Permission profiles are ignored when sandbox_mode is set anywhere,
# so Control Rod sets only default_permissions and never sandbox_mode.
CODEX_PROFILE = """
default_permissions = "control-rod"

[permissions.control-rod]
extends = ":workspace"

[permissions.control-rod.filesystem]
"~/.codex" = "deny"
"~/.claude" = "deny"
":slash_tmp" = "read"
":tmpdir" = "read"

[permissions.control-rod.network]
enabled = false
"""


def run_codex(codex, profile, legacy, args=()):
    with tempfile.TemporaryDirectory(prefix="s6x-") as tmp:
        root = pathlib.Path(tmp)
        home, work = fake_home(root), root / "work"
        work.mkdir()
        if profile:
            (home / ".codex" / "config.toml").write_text(profile)
        env = {"HOME": str(home), "CODEX_HOME": str(home / ".codex"), "PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"}
        extra = ["-c", 'sandbox_mode="workspace-write"', "-c", "sandbox_workspace_write.exclude_slash_tmp=true",
                 "-c", "sandbox_workspace_write.exclude_tmpdir_env_var=true"] if legacy else []
        cmd = [str(codex), "sandbox"] + extra + list(args) + ["--", "python3", "-I", "-c", PROBE]
        r = subprocess.run(cmd, cwd=work, env=env, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=60)
        return {"exit": r.returncode, "probe": last_json(r.stdout), "escape_on_host": (home / "escape-marker").exists(),
                "stderr_tail": r.stderr[-600:]}


def run_claude_file_tools(claude, deps, settings, extra_args=()):
    """Claude Code's Read and Write tools run in the CLI process, outside the command sandbox."""
    h.provider_calls.clear()
    with tempfile.TemporaryDirectory(prefix="s6f-") as tmp:
        root = pathlib.Path(tmp)
        home, work = fake_home(root), root / "work"
        work.mkdir()
        h.ATTEMPTS[:] = [("Read", {"file_path": str(home / ".claude" / ".credentials.json")}),
                         ("Write", {"file_path": str(home / "escape-write"), "content": "x"}),
                         ("Write", {"file_path": str(work / "inside-write"), "content": "x"})]
        server = Tcp(("127.0.0.1", 0), h.Provider)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        env = {"HOME": str(home), "PATH": tool_path(root, deps), "LANG": "C.UTF-8",
               "ANTHROPIC_API_KEY": h.FIXTURE_KEY, "ANTHROPIC_BASE_URL": f"http://127.0.0.1:{server.server_port}",
               "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1"}
        r = subprocess.run([str(claude), "-p", "Spike S-6 file tools.", "--tools", "Read,Write",
                            "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}', "--setting-sources", "",
                            "--settings", json.dumps(settings), "--no-session-persistence", *extra_args,
                            "--model", "fixture-model", "--max-turns", "5", "--output-format", "json"],
                           cwd=work, env=env, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=120)
        server.shutdown()
        results = {b["tool_use_id"]: b for c in h.provider_calls for b in c["tool_results"]}
        def text(i):
            c = results.get(f"toolu_s0_{i}", {}).get("content")
            return c if isinstance(c, str) else " ".join(x.get("text", "") for x in c or [] if isinstance(x, dict))
        return {"exit": r.returncode,
                "read_login_leaked": CANARY in text(0), "read_result": text(0)[:200],
                "write_outside_on_host": (home / "escape-write").exists(), "write_outside_result": text(1)[:200],
                "write_inside_on_host": (work / "inside-write").exists(), "write_inside_result": text(2)[:200]}


# Only these errno values count as the sandbox refusing; anything else (a timeout, a TLS error,
# an unexpected exception) is unverifiable, never a pass.
ENOENT, EACCES, EPERM, EROFS, ENETUNREACH, ECONNREFUSED, EAI_AGAIN_NAMES = 2, 13, 1, 30, 101, 111, ("gaierror",)


def verdict(kind, value):
    if value is None:
        return "unverifiable"
    if value in ("allowed", "LEAKED"):
        return "allowed"
    if value == "read-no-canary":
        return "unverifiable"
    name, err, message = (str(value).split(":", 2) + ["", ""])[:3]
    err = int(err) if err.lstrip("-").isdigit() else None
    # The sandbox's egress proxy answers a refused HTTPS CONNECT with 403; urllib reports it without an errno.
    if kind == "net" and err is None and "Tunnel connection failed; 403" in message:
        return "denied"
    if kind == "read" and err in (ENOENT, EACCES, EPERM):
        return "denied"
    if kind == "write" and err in (EACCES, EPERM, EROFS, ENOENT):
        return "denied"
    if kind == "net" and (err in (ENETUNREACH, EACCES, EPERM, ECONNREFUSED) or name in EAI_AGAIN_NAMES):
        return "denied"
    return "unverifiable"


KINDS = {"read_claude_login": "read", "read_codex_login": "read", "raw_tcp_internet": "net", "https_internet": "net",
         "write_workspace": "write", "write_home": "write", "write_slash_tmp": "write"}
PROTECTED = {"read_claude_login": "denied", "read_codex_login": "denied", "raw_tcp_internet": "denied",
             "https_internet": "denied", "write_workspace": "allowed", "write_home": "denied", "write_slash_tmp": "denied"}


def protected(run):
    p = run.get("probe") or {}
    seen = {k: verdict(KINDS[k], p.get(k)) for k in KINDS}
    return {"probe_completed": run.get("exit") == 0 and bool(p), "verdicts": seen,
            "home_write_never_reaches_host": not run["escape_on_host"],
            "meets_control_rod_policy": run.get("exit") == 0 and bool(p) and seen == PROTECTED and not run["escape_on_host"]}


def run_unsandboxed(_unused=None):
    """Positive control: the same probe with no sandbox must read the canary and reach the internet."""
    with tempfile.TemporaryDirectory(prefix="s6u-") as tmp:
        root = pathlib.Path(tmp)
        home, work = fake_home(root), root / "work"
        work.mkdir()
        env = {"HOME": str(home), "PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"}
        r = subprocess.run(["python3", "-I", "-c", PROBE], cwd=work, env=env, stdin=subprocess.DEVNULL,
                           capture_output=True, text=True, timeout=60)
        return {"exit": r.returncode, "probe": last_json(r.stdout), "escape_on_host": (home / "escape-marker").exists(),
                "stderr_tail": r.stderr[-300:]}


def main():
    a = argparse.ArgumentParser(description=__doc__)
    a.add_argument("--claude", required=True)
    a.add_argument("--codex", required=True)
    a.add_argument("--deps", required=True)
    args = a.parse_args()
    claude, codex, deps = (pathlib.Path(x).resolve() for x in (args.claude, args.codex, args.deps))
    report = {"spike": "S-6",
              "claude_version": subprocess.run([str(claude), "--version"], capture_output=True, text=True).stdout.strip(),
              "codex_version": subprocess.run([str(codex), "--version"], capture_output=True, text=True).stdout.strip(),
              "runs": {}}
    report["runs"]["unsandboxed_positive_control"] = run_unsandboxed()
    report["runs"]["claude_default"] = run_claude(claude, deps, CLAUDE_DEFAULT)
    report["runs"]["claude_weakened_control"] = run_claude(claude, deps, CLAUDE_WEAKENED)
    report["runs"]["claude_control_rod"] = run_claude(claude, deps, CLAUDE_STRICT)
    report["runs"]["codex_default"] = run_codex(codex, None, legacy=True)
    report["runs"]["codex_control_rod"] = run_codex(codex, CODEX_PROFILE, legacy=False)
    report["runs"]["codex_control_rod_overrides"] = run_codex(codex, None, legacy=False, args=CODEX_PROFILE_ARGS)
    report["runs"]["codex_weakened_control"] = run_codex(codex, None, legacy=False, args=CODEX_WEAKENED_ARGS)
    report["checks"] = {name: protected(run) for name, run in report["runs"].items()}
    report["file_tools"] = {
        "claude_control_rod": run_claude_file_tools(claude, deps, CLAUDE_STRICT),
        "claude_control_rod_permissions": run_claude_file_tools(claude, deps, CLAUDE_STRICT_FILES),
    }
    c = report["checks"]
    pos = c["unsandboxed_positive_control"]["verdicts"]
    ft = report["file_tools"]["claude_control_rod_permissions"]
    report["qualification"] = {
        "positive_control_reads_and_reaches_internet": c["unsandboxed_positive_control"]["probe_completed"]
            and all(pos[k] == "allowed" for k in KINDS),
        "claude_meets_policy": c["claude_control_rod"]["meets_control_rod_policy"],
        "codex_meets_policy_config_file": c["codex_control_rod"]["meets_control_rod_policy"],
        "codex_meets_policy_overrides": c["codex_control_rod_overrides"]["meets_control_rod_policy"],
        "claude_weakened_control_leaks": c["claude_weakened_control"]["verdicts"]["read_claude_login"] == "allowed",
        "codex_weakened_control_leaks": c["codex_weakened_control"]["verdicts"]["read_codex_login"] == "allowed",
        "claude_file_tools_refused_outside_and_allowed_inside": ft["exit"] == 0 and not ft["read_login_leaked"]
            and "denied by your permission settings" in ft["read_result"] and not ft["write_outside_on_host"] and ft["write_inside_on_host"],
    }
    report["scope"] = ("decoy logins in a throwaway home; scripted provider for Claude; codex sandbox command only; "
                       "tests two login folders, Bash, Read and Write only; this host only")
    report["activation"] = "HOLD"
    print(json.dumps(report, indent=2))
    return 0 if all(report["qualification"].values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
