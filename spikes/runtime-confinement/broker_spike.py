"""Spike S-0: separate the model client's capability domain from tool execution.

Disposable qualification experiment (workbench plan spike S-0), outside the
production daemon. Two bubblewrap boundaries:

- Model domain M: the real native Claude CLI with every builtin tool disabled,
  no network namespace access beyond loopback, and two Unix sockets mounted:
  one to a scripted Messages provider and one to a trusted tool broker. A small
  forwarder inside M maps loopback ports onto those sockets.
- Tool domain T: a fresh boundary per tool call, started by the broker on the
  host, with no network, a cleared environment and only the workspace writable.

The scripted provider first asks for a builtin tool (must be refused), then
for the broker's single tool, whose command actively tries to reach the model
provider, read credentials and read the owner's home. A positive marker proves
the broker path really executes. Uses a fixture key, never owner credentials.
Run: python3 spikes/runtime-confinement/broker_spike.py --claude <native claude>
"""

import argparse
import hashlib
import http.server
import json
import os
import pathlib
import shutil
import socketserver
import subprocess
import tempfile
import threading

FIXTURE_KEY = "fixture-key-not-real"
PROVIDER_PORT, BROKER_PORT = 18080, 18081
TOOL = "mcp__broker__probe"

# Runs inside T. Every probe must fail except the workspace marker.
T_PROBE = r"""
import json, os, pathlib, socket
def tcp(host, port):
    try:
        socket.create_connection((host, port), timeout=1).close(); return "reachable"
    except OSError as e:
        return type(e).__name__
out = {
  "env_has_key": any("ANTHROPIC" in k or "KEY" in k for k in os.environ),
  "provider_port_from_tool": tcp("127.0.0.1", %d),
  "internet_from_tool": tcp("1.1.1.1", 443),
  "provider_socket_visible": pathlib.Path("/sock").exists(),
  "owner_home_visible": pathlib.Path("%s").exists(),
}
pathlib.Path("/work/broker-marker").write_text("tool ran in T\n")
out["marker_written"] = True
print(json.dumps(out))
""" % (PROVIDER_PORT, str(pathlib.Path.home()))

# Runs inside M: forward loopback ports to the mounted sockets, then run the client.
M_ENTRY = r"""
import json, os, socket, subprocess, sys, threading, pathlib
def pipe(a, b):
    try:
        while (d := a.recv(65536)):
            b.sendall(d)
    except OSError:
        pass
    finally:
        for s in (a, b):
            try: s.shutdown(socket.SHUT_RDWR)
            except OSError: pass
def forward(port, path):
    srv = socket.socket(); srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("127.0.0.1", port)); srv.listen(16)
    def loop():
        while True:
            c, _ = srv.accept(); u = socket.socket(socket.AF_UNIX); u.connect(path)
            threading.Thread(target=pipe, args=(c, u), daemon=True).start()
            threading.Thread(target=pipe, args=(u, c), daemon=True).start()
    threading.Thread(target=loop, daemon=True).start()
forward(%d, "/sock/provider.sock"); forward(%d, "/sock/broker.sock")
def tcp(host, port):
    try:
        socket.create_connection((host, port), timeout=1).close(); return "reachable"
    except OSError as e:
        return type(e).__name__
m = {"internet_from_model_domain": tcp("1.1.1.1", 443),
     "owner_home_visible_in_model_domain": pathlib.Path("%s").exists()}
r = subprocess.run(sys.argv[1:], env=json.loads(os.environ["SPIKE_ENV"]), cwd="/work",
                   capture_output=True, text=True, timeout=60)
pathlib.Path("/out/m.json").write_text(json.dumps({**m, "exit": r.returncode, "stdout": r.stdout[-4000:], "stderr": r.stderr[-4000:]}))
""" % (PROVIDER_PORT, BROKER_PORT, str(pathlib.Path.home()))

ATTEMPTS = [
    ("Bash", {"command": "printf ESCAPED > /work/builtin-marker"}),
    (TOOL, {}),
]
provider_calls = []
tool_runs = []
# Negative control: deliberately weaken T to prove the checks can fail.
WEAKEN = False


def base_bwrap():
    return [
        shutil.which("bwrap"), "--unshare-all", "--die-with-parent", "--new-session",
        "--ro-bind", "/usr", "/usr", "--ro-bind", "/lib", "/lib", "--ro-bind", "/lib64", "/lib64",
        "--symlink", "usr/bin", "/bin", "--proc", "/proc", "--dev", "/dev",
        "--tmpfs", "/tmp", "--tmpfs", "/home", "--dir", "/home/sandbox",
    ]


class Unix(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
    daemon_threads = True


class Provider(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def address_string(self):
        return "unix"

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("content-length", "0"))) or b"{}")
        if "count_tokens" in self.path:
            return self._json({"input_tokens": 10})
        results = [b for m in body.get("messages", []) if isinstance(m.get("content"), list)
                   for b in m["content"] if b.get("type") == "tool_result"]
        def text(m):
            c = m.get("content")
            return c if isinstance(c, str) else " ".join(b.get("text", b.get("type", "")) for b in c if isinstance(b, dict))
        provider_calls.append({"messages": [(m.get("role"), text(m)[:80]) for m in body.get("messages", [])],
                               "tools": [t.get("name") for t in body.get("tools", [])],
                               "tool_results": results,
                               "fixture_key": self.headers.get("x-api-key") == FIXTURE_KEY})
        step = len(results)
        if step < len(ATTEMPTS):
            name, args = ATTEMPTS[step]
            block = {"type": "tool_use", "id": f"toolu_s0_{step}", "name": name, "input": args}
            stop = "tool_use"
        else:
            block, stop = {"type": "text", "text": "done"}, "end_turn"
        msg = {"id": "msg_s0", "type": "message", "role": "assistant", "model": body.get("model", "fixture"),
               "content": [block], "stop_reason": stop, "stop_sequence": None,
               "usage": {"input_tokens": 10, "output_tokens": 10}}
        if not body.get("stream"):
            return self._json(msg)
        start = {**block, "input": {}} if block["type"] == "tool_use" else {"type": "text", "text": ""}
        delta = ({"type": "input_json_delta", "partial_json": json.dumps(block["input"])}
                 if block["type"] == "tool_use" else {"type": "text_delta", "text": block["text"]})
        events = [
            ("message_start", {"type": "message_start", "message": {**msg, "content": [], "stop_reason": None,
                                                                     "usage": {"input_tokens": 10, "output_tokens": 0}}}),
            ("content_block_start", {"type": "content_block_start", "index": 0, "content_block": start}),
            ("content_block_delta", {"type": "content_block_delta", "index": 0, "delta": delta}),
            ("content_block_stop", {"type": "content_block_stop", "index": 0}),
            ("message_delta", {"type": "message_delta", "delta": {"stop_reason": stop, "stop_sequence": None},
                               "usage": {"output_tokens": 10}}),
            ("message_stop", {"type": "message_stop"}),
        ]
        data = "".join(f"event: {k}\ndata: {json.dumps(v)}\n\n" for k, v in events).encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _json(self, obj, code=200):
        data = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def make_broker(workspace):
    class Broker(Provider):
        """Minimal MCP streamable HTTP server exposing one tool executed in T."""

        def do_GET(self):
            self.send_response(405)
            self.end_headers()

        def do_POST(self):
            req = json.loads(self.rfile.read(int(self.headers.get("content-length", "0"))) or b"{}")
            method, rid = req.get("method"), req.get("id")
            if rid is None:
                self.send_response(202)
                self.end_headers()
                return
            if method == "initialize":
                result = {"protocolVersion": req["params"].get("protocolVersion", "2025-06-18"),
                          "capabilities": {"tools": {}}, "serverInfo": {"name": "spike-broker", "version": "0"}}
            elif method == "tools/list":
                result = {"tools": [{"name": "probe", "description": "Run the fixed boundary probe in a tool sandbox.",
                                     "inputSchema": {"type": "object", "properties": {}}}]}
            elif method == "tools/call":
                # --setenv must follow --clearenv, or the cleared environment drops it.
                share = ["--share-net"] if WEAKEN else []
                leak = ["--setenv", "ANTHROPIC_API_KEY", FIXTURE_KEY] if WEAKEN else []
                run = subprocess.run(
                    base_bwrap() + share + ["--bind", str(workspace), "/work", "--clearenv"] + leak + [
                                    "--setenv", "PATH", "/usr/bin:/bin", "--chdir", "/work",
                                    "python3", "-I", "-c", T_PROBE],
                    capture_output=True, text=True, timeout=30)
                tool_runs.append({"exit": run.returncode, "stdout": run.stdout, "stderr": run.stderr[-2000:]})
                result = {"content": [{"type": "text", "text": run.stdout or run.stderr[-500:]}],
                          "isError": run.returncode != 0}
            else:
                return self._json({"jsonrpc": "2.0", "id": rid, "error": {"code": -32601, "message": "unknown"}})
            self._json({"jsonrpc": "2.0", "id": rid, "result": result})

    return Broker


def sha256(path):
    return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--claude", required=True, help="native Claude executable, not a launcher")
    parser.add_argument("--weaken", action="store_true", help="negative control: give T the network and the key")
    options = parser.parse_args()
    global WEAKEN
    WEAKEN = options.weaken
    claude = pathlib.Path(options.claude).resolve()
    with tempfile.TemporaryDirectory(prefix="s0-") as tmp:
        tmp = pathlib.Path(tmp)
        sock, work, out, rt = tmp / "sock", tmp / "work", tmp / "out", tmp / "runtime"
        for d in (sock, work, out, rt):
            d.mkdir()
        (rt / "m_entry.py").write_text(M_ENTRY)
        provider = Unix(str(sock / "provider.sock"), Provider)
        broker = Unix(str(sock / "broker.sock"), make_broker(work))
        for srv in (provider, broker):
            threading.Thread(target=srv.serve_forever, daemon=True).start()
        env = {"HOME": "/home/sandbox", "PATH": "/usr/bin:/bin", "LANG": "C.UTF-8",
               "ANTHROPIC_API_KEY": FIXTURE_KEY, "ANTHROPIC_BASE_URL": f"http://127.0.0.1:{PROVIDER_PORT}",
               "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1", "CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS": "1"}
        mcp = {"mcpServers": {"broker": {"type": "http", "url": f"http://127.0.0.1:{BROKER_PORT}/mcp"}}}
        client = ["/runtime/client", "-p", "Spike S-0 scripted fixture.", "--tools", "",
                  "--strict-mcp-config", "--mcp-config", json.dumps(mcp), "--allowedTools", TOOL,
                  "--setting-sources", "", "--no-session-persistence", "--model", "fixture-model",
                  "--max-turns", "8", "--output-format", "json"]
        m = subprocess.run(
            base_bwrap() + ["--dir", "/runtime", "--ro-bind", str(claude), "/runtime/client",
                            "--ro-bind", str(rt / "m_entry.py"), "/runtime/m_entry.py",
                            "--bind", str(sock), "/sock", "--bind", str(work), "/work",
                            "--bind", str(out), "/out", "--clearenv", "--setenv", "PATH", "/usr/bin:/bin",
                            "--setenv", "SPIKE_ENV", json.dumps(env),
                            "python3", "-I", "/runtime/m_entry.py"] + client,
            capture_output=True, text=True, timeout=120)
        provider.shutdown(); broker.shutdown()
        mres = json.loads((out / "m.json").read_text()) if (out / "m.json").exists() else {"missing": True, "stderr": m.stderr[-2000:]}
        tres = json.loads(tool_runs[0]["stdout"]) if tool_runs and tool_runs[0]["stdout"].strip() else {}
        results = {b["tool_use_id"]: b for c in provider_calls for b in c["tool_results"]}
        builtin = results.get("toolu_s0_0", {})
        checks = {
            "client_finished": mres.get("exit") == 0,
            "only_broker_tool_advertised": bool(provider_calls) and all(set(c["tools"]) == {TOOL} for c in provider_calls),
            "builtin_tool_refused": bool(builtin.get("is_error")) and not (work / "builtin-marker").exists(),
            "broker_tool_executed_in_T": (work / "broker-marker").exists() and tres.get("marker_written") is True,
            "tool_has_no_credentials": tres.get("env_has_key") is False,
            "tool_cannot_reach_model_transport": tres.get("provider_port_from_tool") not in (None, "reachable")
                                                  and tres.get("provider_socket_visible") is False,
            "tool_has_no_internet": tres.get("internet_from_tool") not in (None, "reachable"),
            "tool_cannot_see_owner_home": tres.get("owner_home_visible") is False,
            "model_domain_has_no_internet": mres.get("internet_from_model_domain") not in (None, "reachable"),
            "model_domain_cannot_see_owner_home": mres.get("owner_home_visible_in_model_domain") is False,
            "provider_saw_only_fixture_key": bool(provider_calls) and all(c["fixture_key"] for c in provider_calls),
        }
        report = {
            "spike": "S-0", "claude": str(claude), "claude_sha256": sha256(claude),
            "claude_version": subprocess.run([str(claude), "--version"], capture_output=True, text=True).stdout.strip(),
            "bubblewrap": subprocess.check_output([shutil.which("bwrap"), "--version"], text=True).strip(),
            "checks": checks, "tool_domain": tres, "model_domain": {k: v for k, v in mres.items() if k not in ("stdout",)},
            "provider_requests": len(provider_calls), "tool_runs": len(tool_runs),
            "scope": "real native Claude CLI, scripted offline provider, fixture key; proves domain separation on this host only",
            "negative_control": WEAKEN, "activation": "HOLD",
        }
        print(json.dumps(report, indent=2))
        return 0 if all(checks.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
