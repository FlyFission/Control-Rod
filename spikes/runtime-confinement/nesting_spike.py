"""Spike S-5: does Codex's own Linux sandbox start inside an outer bubblewrap boundary?

Disposable qualification experiment (workbench plan spike S-5). Runs a fixed
probe under `codex sandbox` with sandbox_mode=workspace-write twice: directly on
the host (baseline) and nested inside a bubblewrap boundary like the one a
confined run would use. The probe writes inside the workspace (allowed), tries
to write outside it and to open a network connection (both should be refused).
No model, provider or credential is involved.
Run: python3 spikes/runtime-confinement/nesting_spike.py --codex <native codex>
"""

import argparse
import hashlib
import json
import pathlib
import shutil
import subprocess
import tempfile

PROBE = r"""
import json, pathlib, socket
def attempt(fn):
    try:
        fn(); return "allowed"
    except Exception as e:
        return type(e).__name__
out = {
  "write_workspace": attempt(lambda: pathlib.Path("inside-marker").write_text("x")),
  "write_outside": attempt(lambda: pathlib.Path("%s").write_text("x")),
  "network": attempt(lambda: socket.create_connection(("1.1.1.1", 443), timeout=2).close()),
}
print(json.dumps(out))
"""


def run_probe(codex, workspace, outside, nested):
    # workspace-write allows /tmp and $TMPDIR by default; exclude both so only the workspace is writable.
    sandboxed = [str(codex), "sandbox", "-c", "sandbox_mode=\"workspace-write\"",
                 "-c", "sandbox_workspace_write.exclude_slash_tmp=true",
                 "-c", "sandbox_workspace_write.exclude_tmpdir_env_var=true", "--",
                 "python3", "-I", "-c", PROBE % outside]
    env = {"PATH": "/usr/bin:/bin", "HOME": str(workspace.parent / "home"), "CODEX_HOME": str(workspace.parent / "codex-home")}
    for d in (env["HOME"], env["CODEX_HOME"]):
        pathlib.Path(d).mkdir(exist_ok=True)
    if nested:
        cmd = [shutil.which("bwrap"), "--unshare-all", "--die-with-parent", "--new-session",
               "--ro-bind", "/usr", "/usr", "--ro-bind", "/lib", "/lib", "--ro-bind", "/lib64", "/lib64",
               "--symlink", "usr/bin", "/bin", "--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp",
               "--dir", "/runtime", "--ro-bind", str(codex), "/runtime/codex",
               "--bind", str(workspace.parent), str(workspace.parent), "--chdir", str(workspace),
               "--clearenv"] + sum((["--setenv", k, v] for k, v in env.items()), []) + \
              ["/runtime/codex"] + sandboxed[1:]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    else:
        r = subprocess.run(sandboxed, cwd=workspace, env=env, capture_output=True, text=True, timeout=60)
    try:
        result = json.loads(r.stdout.strip().splitlines()[-1])
    except (ValueError, IndexError):
        result = None
    return {"exit": r.returncode, "result": result, "stderr": r.stderr[-1500:]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--codex", required=True, help="native Codex executable, not the Node launcher")
    codex = pathlib.Path(parser.parse_args().codex).resolve()
    report = {"spike": "S-5", "codex": str(codex),
              "codex_sha256": hashlib.sha256(codex.read_bytes()).hexdigest(),
              "codex_version": subprocess.run([str(codex), "--version"], capture_output=True, text=True).stdout.strip(),
              "bubblewrap": subprocess.check_output([shutil.which("bwrap"), "--version"], text=True).strip()}
    for nested in (False, True):
        with tempfile.TemporaryDirectory(prefix="s5-") as tmp:
            workspace = pathlib.Path(tmp) / "work"
            workspace.mkdir()
            outside = pathlib.Path(tmp) / "outside-marker"
            run = run_probe(codex, workspace, outside, nested)
            run["outside_marker_exists"] = outside.exists()
            report["nested" if nested else "host"] = run
    def enforced(run):
        r = run.get("result") or {}
        return run["exit"] == 0 and r.get("write_workspace") == "allowed" and r.get("write_outside") != "allowed" \
            and r.get("network") != "allowed" and not run["outside_marker_exists"]
    report["checks"] = {"host_sandbox_enforces": enforced(report["host"]),
                        "nested_sandbox_starts_and_enforces": enforced(report["nested"])}
    report["scope"] = "codex sandbox command only; no model, provider or credential; this host only"
    report["activation"] = "HOLD"
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
