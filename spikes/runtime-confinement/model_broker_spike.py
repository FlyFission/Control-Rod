"""Spike S-2: can a subscription login reach Claude Code through a model broker?

Disposable qualification experiment (workbench plan spike S-2). The real native
Claude CLI runs in the S-0 model domain (no network, no owner home, fixture key
only). A broker on the host is its only route out: it accepts just the Messages
endpoints, replaces the fixture key with the owner's subscription OAuth token
read from the owner's credentials file on the host, and forwards to
api.anthropic.com. One tiny prompt; the token is never printed, logged or
written, and the report records only paths, statuses and booleans.
Run: python3 spikes/runtime-confinement/model_broker_spike.py --claude <native claude>
"""

import argparse
import http.client
import http.server
import json
import pathlib
import subprocess
import tempfile
import threading

import broker_spike as h

ALLOWED = ("/v1/messages", "/v1/messages/count_tokens")
UPSTREAM = "api.anthropic.com"
log = []


def oauth_token():
    data = json.loads((pathlib.Path.home() / ".claude" / ".credentials.json").read_text())
    return data["claudeAiOauth"]["accessToken"]


def make_broker(token):
    class ModelBroker(http.server.BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def address_string(self):
            return "unix"

        def do_GET(self):
            self._refuse()

        def do_POST(self):
            path = self.path.split("?", 1)[0]
            body = self.rfile.read(int(self.headers.get("content-length", "0")))
            if path not in ALLOWED:
                return self._refuse(path)
            headers = {k: v for k, v in self.headers.items()
                       if k.lower() not in {"host", "x-api-key", "authorization", "content-length", "connection", "accept-encoding"}}
            beta = [b for b in headers.pop("anthropic-beta", "").split(",") if b.strip()]
            headers["anthropic-beta"] = ",".join(beta + ["oauth-2025-04-20"])
            headers["Authorization"] = "Bearer " + token
            headers["Accept-Encoding"] = "identity"
            conn = http.client.HTTPSConnection(UPSTREAM, timeout=120)
            conn.request("POST", self.path, body=body, headers=headers)
            resp = conn.getresponse()
            data = resp.read()
            log.append({"path": path, "status": resp.status,
                        "fixture_key_arrived": self.headers.get("x-api-key") == h.FIXTURE_KEY,
                        "model": json.loads(body or b"{}").get("model")})
            self.send_response(resp.status)
            for k, v in resp.getheaders():
                if k.lower() not in {"transfer-encoding", "connection", "content-length", "content-encoding"}:
                    self.send_header(k, v)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def _refuse(self, path=None):
            log.append({"path": path or self.path, "status": 403, "refused": True})
            self.send_response(403)
            self.send_header("Content-Length", "0")
            self.end_headers()

    return ModelBroker


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--claude", required=True)
    claude = pathlib.Path(parser.parse_args().claude).resolve()
    token = oauth_token()
    with tempfile.TemporaryDirectory(prefix="s2-") as tmp:
        tmp = pathlib.Path(tmp)
        sock, work, out, rt = tmp / "sock", tmp / "work", tmp / "out", tmp / "runtime"
        for d in (sock, work, out, rt):
            d.mkdir()
        (rt / "m_entry.py").write_text(h.M_ENTRY)
        broker = h.Unix(str(sock / "provider.sock"), make_broker(token))
        threading.Thread(target=broker.serve_forever, daemon=True).start()
        env = {"HOME": "/home/sandbox", "PATH": "/usr/bin:/bin", "LANG": "C.UTF-8",
               "ANTHROPIC_API_KEY": h.FIXTURE_KEY, "ANTHROPIC_BASE_URL": f"http://127.0.0.1:{h.PROVIDER_PORT}",
               "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1"}
        client = ["/runtime/client", "-p", "Reply with exactly the word OK and nothing else.", "--tools", "",
                  "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}', "--setting-sources", "",
                  "--no-session-persistence", "--model", "haiku", "--max-turns", "1", "--output-format", "json"]
        subprocess.run(
            h.base_bwrap() + ["--dir", "/runtime", "--ro-bind", str(claude), "/runtime/client",
                              "--ro-bind", str(rt / "m_entry.py"), "/runtime/m_entry.py",
                              "--bind", str(sock), "/sock", "--bind", str(work), "/work",
                              "--bind", str(out), "/out", "--clearenv", "--setenv", "PATH", "/usr/bin:/bin",
                              "--setenv", "SPIKE_ENV", json.dumps(env),
                              "python3", "-I", "/runtime/m_entry.py"] + client,
            capture_output=True, text=True, timeout=180)
        broker.shutdown()
        m = json.loads((out / "m.json").read_text()) if (out / "m.json").exists() else {}
        native = json.loads(m["stdout"]) if m.get("exit") == 0 and m.get("stdout", "").strip().startswith("{") else {}
        token_on_disk = any(token in p.read_text(errors="ignore") for p in tmp.rglob("*") if p.is_file())
        checks = {
            "client_finished": m.get("exit") == 0 and not native.get("is_error", True),
            "model_answered": "OK" in str(native.get("result", "")),
            "every_request_used_fixture_key_inside": bool(log) and all(e.get("fixture_key_arrived", True) for e in log if not e.get("refused")),
            "only_messages_endpoints_forwarded": all(e["path"] in ALLOWED for e in log if not e.get("refused")),
            "upstream_accepted": any(e.get("status") == 200 for e in log),
            "model_domain_has_no_internet": m.get("internet_from_model_domain") not in (None, "reachable"),
            "model_domain_cannot_see_owner_home": m.get("owner_home_visible_in_model_domain") is False,
            "token_never_written_to_spike_files": not token_on_disk,
        }
        report = {"spike": "S-2", "claude_version": subprocess.run([str(claude), "--version"], capture_output=True, text=True).stdout.strip(),
                  "checks": checks, "broker_log": log, "native_result": {k: native.get(k) for k in ("subtype", "is_error", "result", "num_turns")},
                  "client_exit": m.get("exit"), "stdout_head": m.get("stdout", "")[:300],
                  "stderr_tail": m.get("stderr", "")[-300:],
                  "scope": "real subscription login via host broker, one prompt, this host only", "activation": "HOLD"}
        print(json.dumps(report, indent=2))
        return 0 if all(checks.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
