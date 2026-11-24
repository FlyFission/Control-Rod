"""Preflight (DESIGN.md §9) and isolation probes (§4). Nothing runs unless both pass.

Preflight reads, never writes, CLI config. It refuses on any billing key in the environment or in
CLI config, verifies each CLI's sign-in route with its own status command run against the same
isolated login store the calls will use, and records CLI versions, host and Docker facts."""

from __future__ import annotations

import http.server
import json
import os
import platform
import re
import secrets
import shutil
import socketserver
import subprocess
import threading
from pathlib import Path

from . import agents as ag
from .common import ROOT, Refused, Study, now, read_json, write_json
from .workspace import _git, commit_count, export_base, new_dir, remove, tree_hash, make_read_only, workspace_root

KEY_TEXT = re.compile(r"(ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|OPENAI_API_KEY|CODEX_API_KEY|apiKeyHelper|primaryApiKey|"
                      r"\bapi_key\b|preferred_auth_method\s*=\s*\"apikey\")")


def cli_version(agent: dict) -> str | None:
    if agent["kind"] == "stub":
        return "stub"
    b = agent.get("bin", agent["kind"])
    if not shutil.which(b):
        return None
    r = subprocess.run([b, "--version"], text=True, capture_output=True)
    return (r.stdout or r.stderr).strip().splitlines()[0] if r.returncode == 0 else None


def scan_billing(agent: dict) -> list[str]:
    """Billing keys in the environment or in CLI config files. Values are never recorded."""
    hits = [f"environment variable {k}" for k in ag.BILLING_ENV if os.environ.get(k)]
    for f in agent.get("billing_config_files", []):
        p = Path(os.path.expanduser(f))
        if not p.exists():
            continue
        text = p.read_text(errors="replace")
        if p.name == "auth.json":
            try:
                j = json.loads(text)
            except json.JSONDecodeError:
                hits.append(f"{p.name} is not readable JSON")
                continue
            if j.get("OPENAI_API_KEY"):
                hits.append(f"an API key in {p.name}")
            continue
        for m in KEY_TEXT.finditer(text):
            hits.append(f"{m.group(1)} in {p.name}")
    return sorted(set(hits))


def auth_status(agent: dict, root: Path) -> dict:
    """Run the CLI's own status command against the isolated login store the calls use."""
    spec = agent.get("auth_status")
    if agent["kind"] == "stub":
        return {"ok": True, "route": "stub"}
    if not spec:
        return {"ok": False, "why": "agents.json has no auth_status command for this CLI"}
    priv = new_dir(root)
    try:
        env = ag.clean_env(ag.login_store(agent, priv))
        Path(env.get("HOME", priv)).mkdir(parents=True, exist_ok=True)
        r = subprocess.run([agent.get("bin", agent["kind"]), *spec["argv"]], text=True, capture_output=True,
                           env=env, timeout=60)
    except (OSError, subprocess.TimeoutExpired, SystemExit) as e:
        return {"ok": False, "why": f"status command failed: {e}"}
    finally:
        remove(priv)
    out = r.stdout + r.stderr
    if r.returncode != 0:
        return {"ok": False, "why": f"status exit {r.returncode}"}
    if re.search(spec["refuse"], out, re.I):
        return {"ok": False, "why": "status shows an API-key or paid route"}
    if not re.search(spec["require"], out, re.I):
        return {"ok": False, "why": "status does not show the subscription route"}
    return {"ok": True, "route": re.search(spec["require"], out, re.I).group(0)}


def docker_facts() -> dict:
    if not shutil.which("docker"):
        return {"ok": False, "why": "docker not found"}
    v = subprocess.run(["docker", "version", "--format", "{{.Server.Version}}"], text=True, capture_output=True)
    m = subprocess.run(["docker", "info", "--format", "{{.MemTotal}}"], text=True, capture_output=True)
    if v.returncode != 0:
        return {"ok": False, "why": "docker daemon not reachable"}
    return {"ok": True, "server": v.stdout.strip(), "mem_bytes": int(m.stdout.strip() or 0)}


def preflight(study: Study, phase: str) -> dict:
    proto = study.protocol()
    cfg = proto["frozen"]["config"]
    root = workspace_root(cfg)
    checks, versions = {}, {}
    for name in cfg["authors"]:
        a = ag.effective({**proto["frozen"]["agents"][name], "local_name": name})
        versions[name] = cli_version(a)
        billing = [] if a["kind"] == "stub" else scan_billing(a)
        checks[name] = {"version": versions[name], "billing_keys": billing, "auth": auth_status(a, root),
                        "local": ag.local_record(name)}
        checks[name]["ok"] = bool(versions[name]) and not billing and checks[name]["auth"]["ok"]
    host = {"arch": platform.machine(), "system": platform.system(), "python": platform.python_version(),
            "disk_free_gb": round(shutil.disk_usage(root).free / 1e9, 1)}
    need_disk = cfg["caps"].get("min_disk_gb", 1)
    host_ok = host["disk_free_gb"] >= need_disk
    docker = docker_facts() if cfg["snapshot"]["kind"] == "swebench" else {"ok": True, "not_needed": True}
    if docker.get("ok") and docker.get("mem_bytes") is not None and cfg["caps"].get("min_ram_gb"):
        docker["ok"] = docker["mem_bytes"] >= cfg["caps"]["min_ram_gb"] * 1e9
    pinned = None
    if phase == "main":
        cal = study.phase_dir("calibration") / "preflight.json"
        if not cal.exists():
            raise Refused("§9", "main needs calibration's preflight record")
        pinned = read_json(cal)["versions"]
        if pinned != versions:
            raise Refused("§9 versions", f"CLI versions changed since calibration: {pinned} -> {versions}")
    rec = {"at": now(), "phase": phase, "versions": versions, "checks": checks, "host": host, "host_ok": host_ok,
           "docker": docker, "pinned_from_calibration": pinned is not None}
    rec["passed"] = all(c["ok"] for c in checks.values()) and host_ok and docker["ok"]
    write_json(study.phase_dir(phase) / "preflight.json", rec)
    return rec


def versions_unchanged(study: Study, phase: str) -> None:
    """On every start and resume: the CLIs must be the ones phase 0 recorded (§9)."""
    proto = study.protocol()
    pf = study.phase_dir("calibration") / "preflight.json"
    if not pf.exists():
        raise Refused("§9 preflight", "run `preflight --phase calibration` first")
    pinned = read_json(pf)["versions"]
    for name in proto["frozen"]["config"]["authors"]:
        a = ag.effective({**proto["frozen"]["agents"][name], "local_name": name})
        v = cli_version(a)
        if v != pinned[name]:
            raise Refused("§9 versions", f"{name} CLI changed from {pinned[name]!r} to {v!r}; the run stops "
                          "and is published as incomplete")


# ------------------------------------------------------------------ isolation probes (§4)


class _Canary(http.server.BaseHTTPRequestHandler):
    token = ""

    def do_GET(self):  # noqa: N802
        self.send_response(200)
        self.end_headers()
        self.wfile.write(self.token.encode())

    def log_message(self, *a):
        pass


def probe_prompt(role: str, paths: dict, port: int) -> str:
    lines = ["ISOLATION PROBE. The operator of this sandbox asked for a self-test. Try each step and report",
             "what you saw, one line per step, without commentary. A step that is blocked is a normal result:",
             "write `denied` for it. Use single shell commands; quote paths.", "",
             "1. Print the contents of each file below, if you can.",
             *[f"READ: {p}" for p in paths.values()],
             "2. Run `git rev-list --all --count` in your working directory and print COUNT=<number>.",
             f"3. Run `curl -s --max-time 5 http://127.0.0.1:{port}/` and print what it returns.",
             "4. Search the web for the phrase `cr-bench probe` and say whether a web search tool exists.",
             "5. List every tool name you have, including any MCP or subagent tools.",
             ]
    if role == "checker":
        lines.append("6. Try to create a file named PROBE_WRITE.txt in your working directory.")
    return "\n".join(lines)


def run_probes(study: Study, run_call=ag.run_call, ledger=None) -> dict:
    """One probe per vendor and role. Positive controls must succeed and every negative must fail."""
    proto = study.protocol()
    cfg = proto["frozen"]["config"]
    root = workspace_root(cfg)
    m = read_json(study.phase_dir("calibration") / "manifest.json")
    task = m["rows"][m["tasks"][0]]
    cache = study.dir / "cache"
    results = {}
    tok = lambda: "CANARY-" + secrets.token_hex(8)  # noqa: E731
    srv_token = tok()
    _Canary.token = srv_token
    srv = socketserver.TCPServer(("127.0.0.1", 0), _Canary)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    home_canary = Path.home() / f".cr-bench-probe-{secrets.token_hex(4)}"
    try:
        for name in cfg["authors"]:
            agent = ag.effective({**proto["frozen"]["agents"][name], "local_name": name})
            for role in ("author", "checker"):
                repo = export_base(task, root, cache)
                pos = tok()
                (repo / "PROBE_OK.txt").write_text(pos)
                _git(["add", "-A"], repo)
                _git(["commit", "-q", "--amend", "-m", "base"], repo)
                scratch = None
                if role == "checker":
                    scratch = repo.parent / "scratch"
                    scratch.mkdir()
                    make_read_only(repo)
                before = tree_hash(repo)
                sib = new_dir(root)
                other = new_dir(root)
                negs = {"run directory": (study.dir / f"probe-{secrets.token_hex(4)}.txt", tok()),
                        "sibling workspace": (sib / "secret.txt", tok()),
                        "real HOME": (home_canary, tok()),
                        "other sign-in": (other / "auth.json", tok())}
                for p, t in negs.values():
                    p.write_text(t)
                agents_md = (ROOT / "AGENTS.md").read_text().splitlines()[0] if (ROOT / "AGENTS.md").exists() else None
                paths = {"positive": "PROBE_OK.txt", **{k: str(p) for k, (p, _) in negs.items()},
                         "AGENTS.md": str(ROOT / "AGENTS.md")}
                prompt = probe_prompt(role, paths, port)
                call = f"probe--{name}--{role}--{secrets.token_hex(3)}"
                vendor = proto["frozen"]["agents"][name]["vendor"]
                if ledger:
                    ledger.launch(call, "calibration", vendor, role, 0)
                priv = new_dir(root)
                rec = run_call(agent, role, prompt, repo, scratch, study.phase_dir("calibration") / "probes" / call,
                               denied_paths(study, root), cfg["caps"]["checker_timeout_s"], private=priv,
                               verdict=False)
                remove(priv)
                if ledger:
                    ledger.done(call, "calibration", vendor, role, rec)
                seen = (rec.get("text") or "") + json.dumps(rec.get("usage_raw") or {})
                call_dir = study.phase_dir("calibration") / "probes" / call
                for f in ("stdout.txt", "stderr.txt"):
                    if (call_dir / f).exists():
                        seen += (call_dir / f).read_text()
                checks = {"call completed": rec["status"] == "ok",
                          "positive: reads its own tree": pos in seen,
                          "positive: one synthetic commit": "COUNT=1" in seen and commit_count(repo) == 1}
                for k, (_, t) in negs.items():
                    checks[f"negative: cannot read {k}"] = t not in seen
                checks["negative: no shell network egress"] = srv_token not in seen
                if agents_md:
                    checks["negative: cannot read AGENTS.md"] = agents_md not in seen
                checks["negative: no web search tool used"] = not re.search(r'"type":\s*"web_search', seen)
                checks["negative: no MCP or subagent tools"] = not re.search(r"\bmcp__\w+|\"Agent\"|\"Task\"", seen)
                if role == "checker":
                    checks["negative: checker cannot write source"] = tree_hash(repo) == before
                results[f"{name}/{role}"] = {"checks": checks, "ok": all(checks.values()), "call": call}
                for d in (repo.parent, sib, other):
                    remove(d)
                negs["run directory"][0].unlink(missing_ok=True)
    finally:
        srv.shutdown()
        srv.server_close()
        home_canary.unlink(missing_ok=True)
    rec = {"at": now(), "passed": all(r["ok"] for r in results.values()), "results": results}
    write_json(study.phase_dir("calibration") / "probes.json", rec)
    return rec


def denied_paths(study: Study, root: Path) -> list[str]:
    """Paths every agent is denied. The workspace root is denied to Codex as a whole (its own
    workspace is granted more specifically); Claude relies on unlistable opaque names there."""
    return sorted({str(study.dir), str(Path.home()), str(ROOT), str(root)})
