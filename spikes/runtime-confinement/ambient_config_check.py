"""Experiment: which Claude Code flags keep ambient user configuration out of an agent run?

A throwaway HOME holds a user CLAUDE.md with a canary, a user settings.json with a hook that
writes a marker, and a user MCP server. A scripted provider records every request body. For each
flag set we check whether the canary reaches the model, whether the user hook runs, and whether
the user MCP server is advertised. No real credential or prompt is involved.
"""
import http.server, json, os, pathlib, socketserver, subprocess, sys, tempfile, threading

CANARY = "cr-canary-ambient-71aa"
FIXTURE_KEY = "sk-ant-fixture-0000"
bodies = []


class Provider(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _json(self, obj):
        data = json.dumps(obj).encode()
        self.send_response(200); self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data))); self.end_headers(); self.wfile.write(data)
    def do_POST(self):
        raw = self.rfile.read(int(self.headers.get("content-length", "0")))
        if "count_tokens" in self.path:
            return self._json({"input_tokens": 10})
        bodies.append(raw.decode("utf-8", "replace"))
        body = json.loads(raw or b"{}")
        msg = {"id": "m", "type": "message", "role": "assistant", "model": body.get("model", "f"),
               "content": [{"type": "text", "text": "done"}], "stop_reason": "end_turn", "stop_sequence": None,
               "usage": {"input_tokens": 1, "output_tokens": 1}}
        if not body.get("stream"):
            return self._json(msg)
        ev = [("message_start", {"type": "message_start", "message": {**msg, "content": [], "stop_reason": None}}),
              ("content_block_start", {"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}}),
              ("content_block_delta", {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "done"}}),
              ("content_block_stop", {"type": "content_block_stop", "index": 0}),
              ("message_delta", {"type": "message_delta", "delta": {"stop_reason": "end_turn", "stop_sequence": None}, "usage": {"output_tokens": 1}}),
              ("message_stop", {"type": "message_stop"})]
        data = "".join(f"event: {k}\ndata: {json.dumps(v)}\n\n" for k, v in ev).encode()
        self.send_response(200); self.send_header("content-type", "text/event-stream")
        self.send_header("content-length", str(len(data))); self.end_headers(); self.wfile.write(data)


class Tcp(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True


def run(claude, deps, extra):
    bodies.clear()
    server = Tcp(("127.0.0.1", 0), Provider)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    with tempfile.TemporaryDirectory(prefix="amb-") as tmp:
        root = pathlib.Path(tmp)
        home, work, binp = root / "home", root / "work", root / "bin"
        (home / ".claude").mkdir(parents=True); work.mkdir(); binp.mkdir()
        (binp / "socat").symlink_to(pathlib.Path(deps) / "socat-wrap")
        (binp / "rg").symlink_to(pathlib.Path(deps) / "usr" / "bin" / "rg")
        (home / ".claude" / "CLAUDE.md").write_text(f"User memory {CANARY}\n")
        (work / "CLAUDE.md").write_text(f"Project memory {CANARY}-project\n")
        marker = root / "hook-ran"
        (home / ".claude" / "settings.json").write_text(json.dumps({
            "hooks": {"UserPromptSubmit": [{"hooks": [{"type": "command", "command": f"touch {marker}"}]}]},
            "mcpServers": {"usermcp": {"command": "true"}}}))
        (home / ".claude.json").write_text(json.dumps({"mcpServers": {"userjsonmcp": {"command": "true"}}}))
        env = {"HOME": str(home), "PATH": f"{binp}:/usr/bin:/bin", "LANG": "C.UTF-8",
               "ANTHROPIC_API_KEY": FIXTURE_KEY, "ANTHROPIC_BASE_URL": f"http://127.0.0.1:{server.server_port}",
               "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1"}
        argv = [claude, "-p", "hello", "--output-format", "json", "--no-session-persistence",
                "--model", "fixture-model", "--max-turns", "1", *extra]
        r = subprocess.run(argv, cwd=work, env=env, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=120)
        server.shutdown()
        joined = "\n".join(bodies)
        return {"exit": r.returncode, "requests": len(bodies),
                "user_memory_sent": CANARY in joined.replace(CANARY + "-project", ""),
                "project_memory_sent": CANARY + "-project" in joined,
                "user_hook_ran": marker.exists(),
                "user_mcp_advertised": "usermcp" in joined or "userjsonmcp" in joined,
                "stderr_tail": r.stderr[-300:]}


if __name__ == "__main__":
    claude, deps = sys.argv[1], sys.argv[2]
    base = ["--tools", "Bash,Read,Edit,Write,Grep,Glob", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}',
            "--setting-sources", ""]
    variants = {
        "spike-flags": base,
        "spike-flags+disable-slash": base + ["--disable-slash-commands"],
        "restricted": base + ["--restricted"],
        "safe-mode": base + ["--safe-mode"],
        "restricted+safe-mode": base + ["--restricted", "--safe-mode"],
    }
    print(json.dumps({k: run(claude, deps, v) for k, v in variants.items()}, indent=1))
