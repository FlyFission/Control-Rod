"""Offline native-client experiment: a scripted provider attempts a disabled tool."""

import http.server
import json
import pathlib
import subprocess
import sys
import threading

POSITIVE_CONTROL = sys.argv[1:] == ["--positive-control"]
calls = []
ATTACKS = [
    ("Bash", {"command": "printf DISABLED_TOOL_EXECUTED > /out/escaped"}),
    ("Read", {"file_path": "/runtime/probe.py"}),
    ("Write", {"file_path": "/out/escaped", "content": "escaped"}),
    ("Edit", {"file_path": "/out/escaped", "old_string": "x", "new_string": "y"}),
    ("WebFetch", {"url": "http://127.0.0.1:1", "prompt": "fetch"}),
    (
        "Agent",
        {
            "description": "probe",
            "prompt": "write /out/escaped",
            "subagent_type": "general-purpose",
        },
    ),
    ("ToolSearch", {"query": "Bash", "max_results": 1}),
]
if POSITIVE_CONTROL:
    ATTACKS = ATTACKS[:1]


class Provider(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("content-length", "0"))))
        if "count_tokens" in self.path:
            data = json.dumps({"input_tokens": 10}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(data)
            return
        if "/messages" not in self.path:
            self.send_response(404)
            self.end_headers()
            return
        result_blocks = []
        for m in body.get("messages", []):
            if isinstance(m.get("content"), list):
                result_blocks += [
                    v for v in m["content"] if v.get("type") == "tool_result"
                ]
        tools = [v.get("name") for v in body.get("tools", [])]
        calls.append(
            {
                "path": self.path,
                "tools": tools,
                "tool_results": result_blocks,
                "fixture_key_received": self.headers.get("x-api-key")
                == "fixture-key-not-real",
            }
        )
        attack = len(result_blocks) < len(ATTACKS)
        selected = ATTACKS[len(result_blocks)] if attack else None
        content = (
            {
                "type": "tool_use",
                "id": "toolu_fixture_" + str(len(result_blocks)),
                "name": selected[0],
                "input": selected[1],
            }
            if attack
            else {"type": "text", "text": "Fixture finished after tool refusal."}
        )
        message = {
            "id": "msg_fixture",
            "type": "message",
            "role": "assistant",
            "model": body.get("model", "fixture"),
            "content": [content],
            "stop_reason": "tool_use" if attack else "end_turn",
            "stop_sequence": None,
            "usage": {"input_tokens": 10, "output_tokens": 10},
        }
        if body.get("stream"):
            events = [
                (
                    "message_start",
                    {
                        "type": "message_start",
                        "message": {
                            **message,
                            "content": [],
                            "stop_reason": None,
                            "usage": {"input_tokens": 10, "output_tokens": 0},
                        },
                    },
                ),
                (
                    "content_block_start",
                    {
                        "type": "content_block_start",
                        "index": 0,
                        "content_block": {**content, "input": {}}
                        if attack
                        else {"type": "text", "text": ""},
                    },
                ),
            ]
            events.append(
                (
                    "content_block_delta",
                    {
                        "type": "content_block_delta",
                        "index": 0,
                        "delta": {
                            "type": "input_json_delta",
                            "partial_json": json.dumps(content["input"]),
                        }
                        if attack
                        else {"type": "text_delta", "text": content["text"]},
                    },
                )
            )
            events += [
                ("content_block_stop", {"type": "content_block_stop", "index": 0}),
                (
                    "message_delta",
                    {
                        "type": "message_delta",
                        "delta": {
                            "stop_reason": message["stop_reason"],
                            "stop_sequence": None,
                        },
                        "usage": {"output_tokens": 10},
                    },
                ),
                ("message_stop", {"type": "message_stop"}),
            ]
            data = "".join(
                "event: " + kind + "\ndata: " + json.dumps(v) + "\n\n"
                for kind, v in events
            ).encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        else:
            data = json.dumps(message).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)


server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Provider)
threading.Thread(target=server.serve_forever, daemon=True).start()
env = {
    "HOME": "/home/sandbox",
    "PATH": "/usr/bin:/bin",
    "LANG": "C.UTF-8",
    "ANTHROPIC_API_KEY": "fixture-key-not-real",
    "ANTHROPIC_BASE_URL": "http://127.0.0.1:" + str(server.server_port),
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
    "CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS": "1",
}
args = [
    "/runtime/client",
    "-p",
    "Offline scripted fixture: return the provider response.",
    "--tools",
    "Bash" if POSITIVE_CONTROL else "",
    "--strict-mcp-config",
    "--mcp-config",
    '{"mcpServers":{}}',
    "--setting-sources",
    "",
    "--no-session-persistence",
    "--model",
    "fixture-model",
    "--max-turns",
    "12",
    "--output-format",
    "json",
]
if POSITIVE_CONTROL:
    args += ["--allowedTools", "Bash"]
try:
    result = subprocess.run(
        args,
        check=False,
        env=env,
        cwd="/work",
        capture_output=True,
        text=True,
        timeout=35,
    )
    native = json.loads(result.stdout) if result.returncode == 0 else {}
    # Requests repeat conversation history; count each attempted call once.
    refusals = {b["tool_use_id"]: b for r in calls for b in r["tool_results"]}
    checks = {
        "native_succeeded": result.returncode == 0 and not native.get("is_error", True),
        "advertised_tools_match": bool(calls)
        and all(
            set(r["tools"]) == ({"Bash"} if POSITIVE_CONTROL else set()) for r in calls
        ),
        "attempt_results_match": set(refusals)
        == {f"toolu_fixture_{i}" for i in range(len(ATTACKS))}
        and all(
            (
                not r.get("is_error")
                if POSITIVE_CONTROL
                else r.get("is_error")
                and "No such tool available" in str(r.get("content"))
            )
            for r in refusals.values()
        ),
        "all_requests_used_fixture_key": bool(calls)
        and all(r["fixture_key_received"] for r in calls),
        "marker_matches_control": pathlib.Path("/out/escaped").exists()
        == POSITIVE_CONTROL,
    }
    report = {
        "checks": checks,
        "positive_control": POSITIVE_CONTROL,
        "attempted_tools": [a[0] for a in ATTACKS],
        "scope": "actual Claude CLI, scripted offline provider, fake credential, disabled builtins; not an authenticated native-runtime proof",
        "exit_code": result.returncode,
        "native_result": {
            "type": native.get("type"),
            "subtype": native.get("subtype"),
            "is_error": native.get("is_error"),
            "num_turns": native.get("num_turns"),
            "result": native.get("result"),
        },
        "stderr": result.stderr,
        "requests": calls,
        "unauthorized_marker_exists": pathlib.Path("/out/escaped").exists(),
        "activation": "HOLD",
    }
    pathlib.Path("/out/disabled-tool-report.json").write_text(
        json.dumps(report, indent=2) + "\n"
    )
    print(json.dumps({"checks": checks, "request_count": len(calls)}, indent=2))
    if not all(checks.values()):
        raise RuntimeError("Native tool refusal probe failed")
finally:
    server.shutdown()
