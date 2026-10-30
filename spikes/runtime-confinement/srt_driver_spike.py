"""Spike S-1: can the sandbox-runtime driver (ADR 0010) confine each CLI on this host?

Disposable qualification experiment (workbench plan spike S-1). Runs three
things under `srt` (@anthropic-ai/sandbox-runtime) with one policy: the owner's
home unreadable except the workspace and the tool binaries, writes only in the
workspace, egress only to api.anthropic.com through srt's proxy, TLS terminated
so a masked credential can be substituted on egress.

1. A fixed probe (reads, writes, network) that stands in for any tool child.
2. The real native Claude CLI with one tiny prompt. Its OAuth token is handed to
   srt in the host environment and masked: inside the sandbox the variable
   holds a sentinel, and srt's proxy swaps the real value back only on the way
   to api.anthropic.com. This is the srt equivalent of the S-2 model broker.
3. The native Codex CLI: does it start under srt, does its own sandbox nest
   inside srt's boundary, and does one tiny `codex exec` prompt work with the
   owner's ChatGPT login masked the same way (the access and refresh tokens in
   ~/.codex/auth.json become sentinels inside; srt restores them only on the
   way to chatgpt.com and auth.openai.com)?

The token is never printed, logged or written; the report records only
statuses and booleans.
Run: python3 spikes/runtime-confinement/srt_driver_spike.py --srt <srt cli.js> \
       --claude <native claude> --codex <native codex> --deps <dir with socat-wrap and usr/bin/rg>
"""

import argparse
import hashlib
import json
import os
import pathlib
import subprocess
import shutil
import tempfile

NODE = shutil.which("node")
SRT_ROOT = None

PROBE = r"""
import json, os, pathlib, socket, ssl, sys, urllib.request, urllib.error
home, outside = sys.argv[1], sys.argv[2]
def attempt(fn):
    try:
        r = fn(); return "allowed" if r is None else r
    except urllib.error.HTTPError as e:
        return "http_%d%s" % (e.code, " proxy_refused" if e.headers.get("X-Proxy-Error") else "")
    except Exception as e:
        return type(e).__name__
def fetch(url):
    urllib.request.urlopen(url, timeout=10).read(64)
out = {
  "read_owner_credentials": attempt(lambda: pathlib.Path(home, ".claude", ".credentials.json").read_bytes() and None),
  "list_owner_home": attempt(lambda: os.listdir(home) and None),
  "read_workspace": attempt(lambda: pathlib.Path("seed.txt").read_text() and None),
  "write_workspace": attempt(lambda: pathlib.Path("probe-marker").write_text("x") and None),
  "write_outside": attempt(lambda: pathlib.Path(outside).write_text("x") and None),
  "write_system_path": attempt(lambda: pathlib.Path("/var/tmp/s1-marker").write_text("x") and None),
  "raw_tcp_internet": attempt(lambda: socket.create_connection(("1.1.1.1", 443), timeout=3).close()),
  "https_allowed_host": attempt(lambda: fetch("https://api.anthropic.com/")),
  "https_denied_host": attempt(lambda: fetch("https://example.com/")),
  "proxy_env_present": bool(os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")),
}
print(json.dumps(out))
"""


def settings(work, deps, readable, mask_token):
    # srt runs its seccomp helper from its own package inside the boundary, so that stays readable.
    readable = readable + [str(SRT_ROOT)]
    home = str(pathlib.Path.home())
    cfg = {
        "network": {"allowedDomains": ["api.anthropic.com"], "deniedDomains": [],
                    "tlsTerminate": {}},
        "filesystem": {"denyRead": [home], "allowRead": [str(work)] + readable + [str(deps)],
                       "allowWrite": [str(work)], "denyWrite": []},
        "socatPath": str(deps / "socat-wrap"),
        "ripgrep": {"command": str(deps / "usr" / "bin" / "rg")},
    }
    if mask_token:
        cfg["credentials"] = {"envVars": [{"name": "CLAUDE_CODE_OAUTH_TOKEN", "mode": "mask",
                                           "injectHosts": ["api.anthropic.com"]}]}
    return cfg


def srt(node_cli, cfg, work, argv, env_extra=None, timeout=180):
    cfg_path = work.parent / "srt-settings.json"
    cfg_path.write_text(json.dumps(cfg))
    # srt hands the child TMPDIR=$CLAUDE_CODE_TMPDIR (default /tmp/claude, shared on the host); keep it in the workspace.
    env = {"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8", "HOME": str(work / "home"), "CLAUDE_CODE_TMPDIR": str(work / ".tmp")}
    env.update(env_extra or {})
    # stdin is closed: `codex exec` otherwise waits for piped input.
    try:
        return subprocess.run([NODE, str(node_cli), "-s", str(cfg_path), "--"] + argv, cwd=work, env=env,
                              stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired as e:
        return subprocess.CompletedProcess(e.cmd, "timeout", (e.stdout or b"").decode(errors="ignore") if isinstance(e.stdout, bytes) else (e.stdout or ""),
                                           (e.stderr or b"").decode(errors="ignore") if isinstance(e.stderr, bytes) else (e.stderr or ""))


def last_json(text):
    for line in reversed(text.strip().splitlines()):
        if line.strip().startswith("{"):
            try:
                return json.loads(line)
            except ValueError:
                pass
    return None


def oauth_token():
    data = json.loads((pathlib.Path.home() / ".claude" / ".credentials.json").read_text())
    return data["claudeAiOauth"]["accessToken"]


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--srt", required=True)
    p.add_argument("--claude", required=True)
    p.add_argument("--codex", required=True)
    p.add_argument("--deps", required=True)
    a = p.parse_args()
    node_cli, claude, codex, deps = (pathlib.Path(x).resolve() for x in (a.srt, a.claude, a.codex, a.deps))
    global SRT_ROOT
    SRT_ROOT = node_cli.parent.parent
    report = {"spike": "S-1",
              "srt_version": subprocess.run([NODE, str(node_cli), "--version"], capture_output=True, text=True).stdout.strip(),
              "bubblewrap": subprocess.run(["bwrap", "--version"], capture_output=True, text=True).stdout.strip(),
              "kernel": os.uname().release}
    token = oauth_token()
    with tempfile.TemporaryDirectory(prefix="s1-", dir=pathlib.Path.home() / ".cache") as tmp:
        tmp = pathlib.Path(tmp)
        work = tmp / "work"
        (work / "home").mkdir(parents=True)
        (work / ".tmp").mkdir()
        (work / "seed.txt").write_text("seed")
        outside = tmp / "outside-marker"

        r = srt(node_cli, settings(work, deps, [], False), work,
                ["python3", "-I", "-c", PROBE, str(pathlib.Path.home()), str(outside)])
        probe = last_json(r.stdout) or {}
        report["probe"] = {"exit": r.returncode, "result": probe, "outside_marker_exists": outside.exists(),
                           "stderr_tail": r.stderr[-600:]}

        r = srt(node_cli, settings(work, deps, [str(claude.parent)], True), work,
                [str(claude), "-p", "Reply with exactly the word OK and nothing else.", "--tools", "",
                 "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}', "--setting-sources", "",
                 "--no-session-persistence", "--model", "haiku", "--max-turns", "1", "--output-format", "json"],
                env_extra={"CLAUDE_CODE_OAUTH_TOKEN": token, "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1"})
        native = last_json(r.stdout) or {}
        report["claude"] = {"exit": r.returncode,
                            "native_result": {k: native.get(k) for k in ("subtype", "is_error", "result", "num_turns")},
                            "stderr_tail": r.stderr[-600:].replace(token, "<redacted>")}

        cfg = settings(work, deps, [str(codex.parent)], False)
        cfg["allowNestedUserNamespaces"] = True
        r = srt(node_cli, cfg, work, [str(codex), "--version"])
        report["codex_starts"] = {"exit": r.returncode, "stdout": r.stdout.strip()[-200:], "stderr_tail": r.stderr[-300:]}
        # Codex's workspace is work/inner; work/escape-marker is writable under srt but outside Codex's workspace.
        (work / "inner").mkdir()
        nested_probe = ("import json,pathlib\n"
                        "def a(f):\n try:\n  f(); return 'allowed'\n except Exception as e:\n  return type(e).__name__\n"
                        "print(json.dumps({'write_codex_workspace': a(lambda: pathlib.Path('nested-marker').write_text('x')),"
                        "'write_srt_allowed_outside_codex': a(lambda: pathlib.Path('../escape-marker').write_text('x'))}))")
        r = srt(node_cli, cfg, work,
                ["/bin/sh", "-c", 'cd inner && exec "$0" "$@"', str(codex), "sandbox", "-c", 'sandbox_mode="workspace-write"',
                 "-c", "sandbox_workspace_write.exclude_slash_tmp=true",
                 "-c", "sandbox_workspace_write.exclude_tmpdir_env_var=true", "--",
                 "python3", "-I", "-c", nested_probe],
                env_extra={"CODEX_HOME": str(work / "home" / ".codex")})
        escape_on_host = (work / "escape-marker").exists()
        report["codex_nested_sandbox"] = {"exit": r.returncode, "result": last_json(r.stdout),
                                          "escape_marker_on_host": escape_on_host, "stderr_tail": r.stderr[-600:]}

        codex_auth = pathlib.Path.home() / ".codex" / "auth.json"
        codex_secrets = [v for k, v in json.loads(codex_auth.read_text())["tokens"].items() if k in ("access_token", "refresh_token")]
        chome = work / "home" / ".codex-exec"
        chome.mkdir()
        (chome / "auth.json").symlink_to(codex_auth)
        cfg = settings(work, deps, [str(codex.parent), str(codex_auth)], False)
        cfg["network"]["allowedDomains"] = ["chatgpt.com", "auth.openai.com"]
        cfg["credentials"] = {"files": [{"path": str(codex_auth), "mode": "mask",
                                         "extract": '"(?:access|refresh)_token":\\s*"([^"]+)"',
                                         "injectHosts": ["chatgpt.com", "auth.openai.com"]}]}
        r = srt(node_cli, cfg, work,
                [str(codex), "exec", "--json", "--ephemeral", "--skip-git-repo-check", "--ignore-user-config",
                 "--ignore-rules", "-s", "read-only", "Reply with exactly the word OK and nothing else."],
                env_extra={"CODEX_HOME": str(chome)}, timeout=240)
        events = [json.loads(l) for l in r.stdout.splitlines() if l.strip().startswith("{")]
        texts = [e.get("item", {}).get("text", "") for e in events if e.get("type") == "item.completed"]
        tail = r.stderr[-600:]
        for secret in codex_secrets:
            tail = tail.replace(secret, "<redacted>")
        report["codex_exec"] = {"exit": r.returncode, "event_types": sorted({e.get("type", "") for e in events}),
                                "agent_text": texts[-1:] if texts else [], "stderr_tail": tail}

        on_disk = any(secret in f.read_text(errors="ignore") for f in tmp.rglob("*") if f.is_file() and not f.is_symlink()
                      for secret in [token] + codex_secrets)
    pr = report["probe"]["result"]
    report["checks"] = {
        "owner_credentials_unreadable": pr.get("read_owner_credentials") not in (None, "allowed"),
        "workspace_read_write": pr.get("read_workspace") == "allowed" and pr.get("write_workspace") == "allowed",
        # A denied region is replaced by an empty scratch mount, so a write there may "succeed" but never reaches the host.
        "write_outside_never_reaches_host": not report["probe"]["outside_marker_exists"],
        "write_system_path_refused": pr.get("write_system_path") not in (None, "allowed") and not pathlib.Path("/var/tmp/s1-marker").exists(),
        "no_raw_internet": pr.get("raw_tcp_internet") not in (None, "allowed"),
        "allowed_host_reachable_via_proxy": str(pr.get("https_allowed_host", "")).startswith(("allowed", "http_4", "http_5"))
                                            and "proxy_refused" not in str(pr.get("https_allowed_host")),
        "denied_host_refused": pr.get("https_denied_host") not in (None, "allowed"),
        "claude_answers_with_masked_token": report["claude"]["native_result"].get("result") == "OK",
        "codex_starts_under_srt": report["codex_starts"]["exit"] == 0 and "codex-cli" in report["codex_starts"]["stdout"],
        "codex_sandbox_nests_and_enforces": report["codex_nested_sandbox"]["exit"] == 0
                                            and (report["codex_nested_sandbox"]["result"] or {}).get("write_codex_workspace") == "allowed"
                                            and (report["codex_nested_sandbox"]["result"] or {}).get("write_srt_allowed_outside_codex") != "allowed"
                                            and not report["codex_nested_sandbox"]["escape_marker_on_host"],
        "codex_answers_with_masked_login": any(t.strip() == "OK" for t in report["codex_exec"]["agent_text"]),
        "token_never_written_to_spike_files": not on_disk,
    }
    report["scope"] = "WSL2 host only; srt CLI; one real prompt; one real Claude prompt and one real Codex prompt"
    report["activation"] = "HOLD"
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
