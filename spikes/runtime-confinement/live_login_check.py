"""Live check: each CLI answers, with the owner's ordinary login, under the daemon's exact launch.

Plan tasks 6.2 and 6.3 (ADR 0021). The launch qualification runs against a scripted provider in a
throwaway home, so it cannot show that a real login still works once the home folder is denied.
This sends one tiny prompt per CLI (spending a few tokens of the owner's own plan) from a scratch
workspace in the daemon's home, launched exactly as `controlrod sandbox-args` prints it, and checks
the answer. It reads, copies and prints no credential.

Run: python3 spikes/runtime-confinement/live_login_check.py --controlrod <built controlrod>
"""

import argparse
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile

POLICY = {"id": "sbp_none-live", "version": 1, "org_id": "org_live", "driver": "native-cli",
          "denied_read": ["~", "~/.claude", "~/.codex", "~/.ssh", "~/.controlrod", "/mnt"], "writable_roots": ["workspace"],
          "allowed_hosts": [], "enabled_tools": ["command", "read", "edit", "write", "search"], "mandatory_claims": ["live check"]}
ASK = "Reply with exactly the word OK and nothing else. Do not use any tools."


def answered(runtime, out):
    for line in out.splitlines():
        try:
            ev = json.loads(line)
        except ValueError:
            continue
        if runtime == "claude" and ev.get("type") == "result" and str(ev.get("result", "")).strip() == "OK":
            return True
        if runtime == "codex" and ev.get("type") == "item.completed" and str(ev.get("item", {}).get("text", "")).strip() == "OK":
            return True
    return False


def main():
    a = argparse.ArgumentParser(description=__doc__)
    a.add_argument("--controlrod", required=True)
    args = a.parse_args()
    home = pathlib.Path.home()
    root = home / ".controlrod" / "work" / "LIVE-CHECK"
    ws = root / "r0" / "author-1-live"
    (ws / "inputs").mkdir(parents=True, exist_ok=True)
    (ws / "out").mkdir(exist_ok=True)
    (ws / "inputs" / "TOOLS.txt").write_text("Read\n")
    results = {}
    try:
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump(POLICY, f)
        for rt in ("claude", "codex"):
            spec = json.loads(subprocess.run([args.controlrod, "sandbox-args", "--runtime", rt, "--policy", f.name, "--workspace", str(ws)],
                                             capture_output=True, text=True, check=True).stdout)
            argv = spec["argv"]
            if rt == "claude":
                argv[argv.index("-p") + 1] = ASK
            else:
                argv[-1] = ASK
            env = dict(kv.split("=", 1) for kv in spec["env"])
            r = subprocess.run(argv, cwd=spec["dir"], env=env, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=300)
            results[rt] = {"exit": r.returncode, "answered_ok": answered(rt, r.stdout),
                           "stderr_tail": "" if answered(rt, r.stdout) else r.stderr[-400:]}
    finally:
        shutil.rmtree(root, ignore_errors=True)
    print(json.dumps(results, indent=1))
    sys.exit(0 if all(v["answered_ok"] for v in results.values()) else 1)


if __name__ == "__main__":
    main()
