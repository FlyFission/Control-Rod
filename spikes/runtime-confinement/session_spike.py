"""Spikes S-3 and S-4 for the native Claude CLI, offline, in a bubblewrap boundary.

S-3: do Claude Code hooks fire in print mode when a tool needs permission, so a
headless run can record "waiting on a human" instead of failing silently?
S-4: can one process hold a multi-turn conversation over stream-json input and
output, the structured interface Explore would use until ACP lands?

Both reuse the S-0 harness (scripted Messages provider over a Unix socket and a
forwarder inside the boundary). Fixture key only.
Run: python3 spikes/runtime-confinement/session_spike.py --claude <native claude>
"""

import argparse
import json
import pathlib
import subprocess
import tempfile
import threading

import broker_spike as h

HOOK = 'python3 -I -c "import sys,pathlib; pathlib.Path(\'/out/{name}\').write_text(sys.stdin.read())"'


def boundary(claude, rt, sock, work, out, env, client, stdin=None):
    return subprocess.run(
        h.base_bwrap() + ["--dir", "/runtime", "--ro-bind", str(claude), "/runtime/client",
                          "--ro-bind", str(rt / "m_entry.py"), "/runtime/m_entry.py",
                          "--bind", str(sock), "/sock", "--bind", str(work), "/work",
                          "--bind", str(out), "/out", "--clearenv", "--setenv", "PATH", "/usr/bin:/bin",
                          "--setenv", "SPIKE_ENV", json.dumps(env),
                          "python3", "-I", "/runtime/m_entry.py"] + client,
        capture_output=True, text=True, timeout=120, input=stdin)


def setup(tmp):
    sock, work, out, rt = tmp / "sock", tmp / "work", tmp / "out", tmp / "runtime"
    for d in (sock, work, out, rt):
        d.mkdir()
    (rt / "m_entry.py").write_text(h.M_ENTRY.replace(
        'r = subprocess.run(sys.argv[1:], env=json.loads(os.environ["SPIKE_ENV"]), cwd="/work",\n                   capture_output=True, text=True, timeout=60)',
        'r = subprocess.run(sys.argv[1:], env=json.loads(os.environ["SPIKE_ENV"]), cwd="/work",\n                   capture_output=True, text=True, timeout=60, input=sys.stdin.read() or None)'))
    provider = h.Unix(str(sock / "provider.sock"), h.Provider)
    threading.Thread(target=provider.serve_forever, daemon=True).start()
    env = {"HOME": "/home/sandbox", "PATH": "/usr/bin:/bin", "LANG": "C.UTF-8",
           "ANTHROPIC_API_KEY": h.FIXTURE_KEY, "ANTHROPIC_BASE_URL": f"http://127.0.0.1:{h.PROVIDER_PORT}",
           "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1", "CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS": "1"}
    return sock, work, out, rt, provider, env


def s3(claude):
    h.ATTEMPTS[:] = [("Bash", {"command": "printf RAN > /work/bash-marker"})]
    h.provider_calls.clear()
    with tempfile.TemporaryDirectory(prefix="s3-") as tmp:
        sock, work, out, rt, provider, env = setup(pathlib.Path(tmp))
        hooks = {"hooks": {
            "PreToolUse": [{"matcher": "*", "hooks": [{"type": "command", "command": HOOK.format(name="pre-tool-use")}]}],
            "PermissionRequest": [{"matcher": "*", "hooks": [{"type": "command", "command": HOOK.format(name="permission-request")}]}],
        }}
        client = ["/runtime/client", "-p", "Spike S-3 scripted fixture.", "--tools", "Bash",
                  "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}', "--setting-sources", "",
                  "--settings", json.dumps(hooks), "--no-session-persistence", "--model", "fixture-model",
                  "--max-turns", "4", "--output-format", "json"]
        boundary(claude, rt, sock, work, out, env, client)
        provider.shutdown()
        results = {b["tool_use_id"]: b for c in h.provider_calls for b in c["tool_results"]}
        first = results.get("toolu_s0_0", {})
        return {
            "pre_tool_use_fired": (out / "pre-tool-use").exists(),
            "permission_request_fired": (out / "permission-request").exists(),
            "permission_request_payload": json.loads((out / "permission-request").read_text()) if (out / "permission-request").exists() else None,
            "tool_ran_without_approval": (work / "bash-marker").exists(),
            "tool_result_is_error": bool(first.get("is_error")),
            "tool_result_text": str(first.get("content"))[:300],
        }


def s4(claude):
    h.ATTEMPTS[:] = []
    h.provider_calls.clear()
    with tempfile.TemporaryDirectory(prefix="s4-") as tmp:
        sock, work, out, rt, provider, env = setup(pathlib.Path(tmp))
        turns = [{"type": "user", "message": {"role": "user", "content": f"turn {i}"}} for i in (1, 2)]
        stdin = "".join(json.dumps(t) + "\n" for t in turns)
        client = ["/runtime/client", "-p", "--input-format", "stream-json", "--output-format", "stream-json",
                  "--verbose", "--tools", "", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}',
                  "--setting-sources", "", "--no-session-persistence", "--model", "fixture-model"]
        boundary(claude, rt, sock, work, out, env, client, stdin=stdin)
        provider.shutdown()
        m = json.loads((out / "m.json").read_text()) if (out / "m.json").exists() else {}
        events = [json.loads(l) for l in m.get("stdout", "").splitlines() if l.strip().startswith("{")]
        results = [e for e in events if e.get("type") == "result"]
        last_user_turns = [[b for b in c.get("tool_results", [])] for c in h.provider_calls]
        return {
            "exit": m.get("exit"),
            "result_events": len(results),
            "provider_requests": len(h.provider_calls),
            "event_types": sorted({e.get("type") for e in events}),
            "second_request_carries_history": len(h.provider_calls) >= 2,
            "stderr": m.get("stderr", "")[-400:],
            "request_messages": [c["messages"] for c in h.provider_calls],
        }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--claude", required=True)
    claude = pathlib.Path(parser.parse_args().claude).resolve()
    report = {"spikes": ["S-3", "S-4"], "claude_version": subprocess.run([str(claude), "--version"], capture_output=True, text=True).stdout.strip(),
              "S-3": s3(claude), "S-4": s4(claude), "scope": "offline scripted provider, fixture key, this host only", "activation": "HOLD"}
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
