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
        return type(e).__name__
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


def protected(run):
    p = run.get("probe") or {}
    return {
        "login_files_unreadable": all(p.get(k) not in (None, "LEAKED", "read-no-canary") for k in ("read_claude_login", "read_codex_login")),
        "no_internet": all(p.get(k) not in (None, "allowed") for k in ("raw_tcp_internet", "https_internet")),
        "workspace_writable": p.get("write_workspace") == "allowed",
        "slash_tmp_not_writable": p.get("write_slash_tmp") not in (None, "allowed"),
        "home_write_never_reaches_host": not run["escape_on_host"],
    }


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
    report["runs"]["claude_default"] = run_claude(claude, deps, CLAUDE_DEFAULT)
    report["runs"]["claude_control_rod"] = run_claude(claude, deps, CLAUDE_STRICT)
    report["runs"]["codex_default"] = run_codex(codex, None, legacy=True)
    report["runs"]["codex_control_rod"] = run_codex(codex, CODEX_PROFILE, legacy=False)
    report["runs"]["codex_control_rod_overrides"] = run_codex(codex, None, legacy=False, args=CODEX_PROFILE_ARGS)
    report["checks"] = {name: protected(run) for name, run in report["runs"].items()}
    report["scope"] = "decoy logins in a throwaway home; scripted provider for Claude; codex sandbox command only; this host only"
    report["activation"] = "HOLD"
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
