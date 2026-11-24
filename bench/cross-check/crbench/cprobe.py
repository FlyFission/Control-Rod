"""Preflight and probes for the per-call container (DESIGN-v3.4-proposal.md). None of these make a
model call: they run fixed commands in the call's exact container configuration.

- `runtime_check`: the runtime, the VM's disk and RAM, AppArmor, the pinned image.
- `in_container`: one fixed command in a fresh container with a copied sign-in store, used for
  each CLI's own status and feature commands.
- `admission`: each CLI's own sandbox must start inside the hardened container and, from a tool
  child, must not read the sign-in directory (a sentinel stands in for the token) and must not
  open any network connection (DESIGN-v3.4-proposal.md, "Tool processes get neither the token
  nor the network").
- `boundary_probes`: the container boundary itself, from a plain shell inside it: nothing of the
  host is mounted, the source is read-only for a checker, off-allowlist hosts, raw IPs, direct DNS
  and a mismatched TLS server name all fail, and the vendor endpoint is reachable."""

from __future__ import annotations

import json
import secrets
from pathlib import Path

from . import agents as ag
from . import container as ctr
from .agents import run_proc
from .workspace import new_dir, remove

SHELL = ["/bin/sh", "-c"]


def runtime_check(cfg: dict, root: Path) -> dict:
    s = ctr.settings(cfg)
    if s is None:
        return {"ok": False, "why": "no container settings in the study config"}
    if not ctr.docker_bin():
        return {"ok": False, "why": "no docker client; install a container runtime (Colima: brew install colima docker)"}
    try:
        info = ctr.runtime_info()
        img = ctr.image_record(s["image"])
    except Exception as e:  # noqa: BLE001 - every failure here is a failed preflight, with its reason
        return {"ok": False, "why": str(e)[:300]}
    mem_ok = (info.get("mem_bytes") or 0) >= cfg["caps"].get("min_ram_gb", 0) * 1e9 * 0.9
    df = df_in_vm(img["id"])
    disk_ok = df is not None and df >= cfg["caps"].get("min_disk_gb", 0)
    sees_root = mount_visible(s, img["id"], root)
    out = {"runtime": info, "apparmor": ctr.apparmor_active(info), "image": img, "vm_disk_free_gb": df,
           "workspace_root_visible": sees_root}
    out["ok"] = mem_ok and disk_ok and sees_root
    if not out["ok"]:
        out["why"] = ("VM memory below min_ram_gb" if not mem_ok else "VM disk below min_disk_gb" if not disk_ok
                      else "the workspace root is not shared into the VM (colima start --mount <root>:w)")
    return out


def df_in_vm(image: str) -> float | None:
    r = ctr.dk(["run", "--rm", "--network", "none", "--cap-drop", "ALL", "--entrypoint", "/bin/sh", image, "-c",
                "df -Pk / | tail -1"], check=False, timeout=60)
    try:
        return round(int(r.stdout.split()[3]) / 1e6, 1)
    except (IndexError, ValueError):
        return None


def mount_visible(s: dict, image: str, root: Path) -> bool:
    """A file written on the host under the workspace root must appear in a container: on macOS the
    runtime's VM sees only the directories it shares."""
    d = new_dir(root)
    try:
        tok = secrets.token_hex(8)
        (d / "visible").write_text(tok)
        r = ctr.dk(["run", "--rm", "--network", "none", "--cap-drop", "ALL", *ctr.mount(d, "/probe", ro=True),
                    "--entrypoint", "/bin/cat", image, "/probe/visible"], check=False, timeout=60)
        return r.returncode == 0 and r.stdout.decode().strip() == tok
    finally:
        remove(d)


def _call_dirs(root: Path) -> dict:
    """A throwaway repo, scratch and private directory for one fixed-command container."""
    base = new_dir(root)
    repo, scratch, private = base / "repo", base / "scratch", new_dir(root)
    repo.mkdir()
    scratch.mkdir()
    return {"base": base, "workspace": repo, "scratch": scratch, "private": private}


def in_container(cfg: dict, label: str, agent: dict | None, image: str, root: Path, script: str, out_dir: Path,
                 role: str = "checker", allow: list[str] | None = None, prepare=None, timeout: int = 120) -> dict:
    """Run one fixed shell script in a fresh container configured exactly like a call of `role`.
    With an agent, its sign-in copy and environment are in place; with `allow`, an egress proxy."""
    w = _call_dirs(root)
    lid = secrets.token_hex(8)
    out_dir.mkdir(parents=True, exist_ok=True)
    try:
        env = ag.container_env(agent, w["private"]) if agent else {"PATH": ag.IMAGE_PATH, "TMPDIR": "/tmp"}
        if prepare:
            prepare(w, env)
        with ctr.Call(cfg, image, lid, label, out_dir, allow, root) as c:
            env.update(c.proxy_env())
            ef = ctr.write_env_file(w["private"] / ".env", env)
            argv = c.argv(role, w, ef, SHELL + [script])
            so, se = out_dir / "stdout.txt", out_dir / "stderr.txt"
            code, stop = run_proc(argv, out_dir, "", timeout, ctr.docker_env(), so, se, cap=4 * 1024 * 1024)
            ef.unlink(missing_ok=True)
        return {"code": code, "stop": stop, "stdout": ag.read_capped(so), "stderr": ag.read_capped(se),
                "egress": ctr.egress_log(out_dir), "dirs": w}
    finally:
        for k in ("base", "private"):
            if Path(w[k]).exists():
                remove(w[k])


def lines(text: str) -> dict:
    """KEY=value lines a probe script prints."""
    out = {}
    for ln in text.splitlines():
        k, sep, v = ln.partition("=")
        if sep and k.isupper():
            out[k] = v.strip()
    return out


# ------------------------------------------------------------------ the CLIs' own sandboxes


def admission(cfg: dict, label: str, agent: dict, image: str, root: Path, out_dir: Path) -> dict:
    """Each CLI's own sandbox, started the way a call starts it, from a tool child: the sentinel in
    /work/private is unreadable, the network is unreachable, the repo is readable. No model call."""
    sentinel = "SENTINEL-" + secrets.token_hex(8)
    pos = "POSITIVE-" + secrets.token_hex(8)
    canary = f"cr-probe-{secrets.token_hex(4)}.example.com"
    allow = agent.get("egress") or []

    def prepare(w, env):
        (Path(w["private"]) / "sentinel").write_text(sentinel)
        (Path(w["workspace"]) / "PROBE_OK.txt").write_text(pos)

    inner = ("cat /work/repo/PROBE_OK.txt; echo; cat /work/private/sentinel; echo; "
             f"curl -s -m 5 -o /dev/null -w 'NET=%{{http_code}}\\n' https://{canary}/ ; "
             "curl -s -m 5 -o /dev/null -w 'RAW=%{http_code}\\n' https://1.1.1.1/")
    if agent["kind"] == "codex":
        perm = [a for a in ag.codex_args(agent, "checker", Path(ctr.REPO), Path(ctr.SCRATCH), [ctr.PRIVATE],
                                         Path("/tmp/x")) if a]
        cflags = []
        for i, a in enumerate(perm):  # the run's -c permission and config overrides, unchanged
            if a == "-c":
                cflags += ["-c", perm[i + 1]]
        script = "codex sandbox " + " ".join(_q(x) for x in cflags) + " -- /bin/sh -c " + _q(inner)
    elif agent["kind"] == "claude":
        srt_settings = {"filesystem": {"denyRead": [ctr.PRIVATE], "allowWrite": [ctr.SCRATCH], "denyWrite": []},
                        "network": {"allowedDomains": [], "deniedDomains": []}}
        script = (f"printf '%s' {_q(json.dumps(srt_settings))} > /tmp/srt.json && "
                  "srt --settings /tmp/srt.json -c " + _q(inner))
    else:
        return {"ok": True, "skipped": "stub"}
    r = in_container(cfg, label, agent, image, root, script, out_dir, role="checker", allow=allow, prepare=prepare)
    out = r["stdout"]
    kv = lines(out)
    checks = {
        "inner sandbox started": r["code"] == 0 or pos in out,
        "tool reads the repo": pos in out,
        "tool cannot read the sign-in directory": sentinel not in out and sentinel not in r["stderr"],
        "tool has no network": kv.get("NET", "000") == "000" and kv.get("RAW", "000") == "000",
        "tool never reached the egress proxy": not any(e.get("host") == canary for e in r["egress"]),
    }
    return {"ok": all(checks.values()), "checks": checks, "exit": r["code"], "stderr_tail": r["stderr"][-600:]}


def _q(s: str) -> str:
    return "'" + s.replace("'", "'\\''") + "'"


# ------------------------------------------------------------------ the container boundary


def boundary_probes(cfg: dict, label: str, agent: dict, image: str, root: Path, out_dir: Path,
                    role: str, host_paths: list[str]) -> dict:
    """From a plain shell in the call's container (no inner sandbox): the container boundary."""
    allow = agent.get("egress") or []
    if not allow:
        return {"ok": False, "checks": {"vendor allowlist is set": False}}
    good = allow[0]
    canary = f"cr-probe-{secrets.token_hex(4)}.example.com"
    pos = "POSITIVE-" + secrets.token_hex(8)

    def prepare(w, env):
        (Path(w["workspace"]) / "PROBE_OK.txt").write_text(pos)

    reads = "; ".join(f"[ -e {_q(p)} ] && echo HOSTPATH={_q(p)}" for p in host_paths)
    script = "; ".join([
        "cat /work/repo/PROBE_OK.txt; echo",
        reads or "true",
        "echo x > /work/repo/W 2>/dev/null && echo SRCWRITE=yes || echo SRCWRITE=no",
        "echo x > /work/scratch/ok.txt 2>/dev/null && echo SCRATCH=yes || echo SCRATCH=no",
        f"curl -s -m 8 -o /dev/null -w 'OFFLIST=%{{http_code}}\\n' https://{canary}/",
        f"curl -s -m 8 -o /dev/null -w 'GOOD=%{{http_code}}\\n' https://{good}/",
        "curl -s -m 5 --noproxy '*' -o /dev/null -w 'RAWIP=%{http_code}\\n' https://1.1.1.1/",
        "curl -s -m 5 -o /dev/null -w 'IPLIT=%{http_code}\\n' https://1.1.1.1/",
        "getent hosts example.com >/dev/null 2>&1 && echo DNS=yes || echo DNS=no",
        "nslookup -timeout=3 example.com 1.1.1.1 >/dev/null 2>&1 && echo DNSDIRECT=yes || echo DNSDIRECT=no",
        f"echo | timeout 10 openssl s_client -quiet -proxy \"${{HTTPS_PROXY#http://}}\" -connect {good}:443 "
        f"-servername example.com >/dev/null 2>&1; echo SNIMISMATCH=done",
        "ls -a / | tr '\\n' ' ' | sed 's/^/ROOTLS=/'; echo",
        "hostname | sed 's/^/HOST=/'",
    ])
    r = in_container(cfg, label, agent, image, root, script, out_dir, role=role, allow=allow, prepare=prepare)
    kv = lines(r["stdout"])
    eg = r["egress"]
    checks = {
        "reads its own repo": pos in r["stdout"],
        "no host path is visible": "HOSTPATH" not in r["stdout"],
        "off-allowlist host refused": kv.get("OFFLIST") in ("000", "403") and any(
            e.get("host") == canary and e.get("decision") == "denied" for e in eg),
        "vendor endpoint reachable": kv.get("GOOD", "000") != "000",
        "no direct route to a raw IP": kv.get("RAWIP") == "000",
        "IP literal refused by the proxy": kv.get("IPLIT") in ("000", "403"),
        "no DNS resolver": kv.get("DNS") == "no" and kv.get("DNSDIRECT") == "no",
        "TLS server-name mismatch refused": any(e.get("host") == good and "server name" in (e.get("reason") or "")
                                                for e in eg),
        "neutral host name": kv.get("HOST") == "sandbox",
    }
    if role == "checker":
        checks["source is read-only"] = kv.get("SRCWRITE") == "no"
        checks["scratch is writable"] = kv.get("SCRATCH") == "yes"
    else:
        checks["its tree is writable"] = kv.get("SRCWRITE") == "yes"
    return {"ok": all(checks.values()), "checks": checks}

