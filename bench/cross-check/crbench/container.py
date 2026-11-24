"""Per-call Linux containers: the one isolation boundary the harness owns (DESIGN-v3.4-proposal.md).

Every real agent call runs in a fresh container on its own internal network, whose only exit is
that call's egress proxy (egress.py) holding that vendor's allowlist. Inside, each CLI's own
bubblewrap sandbox keeps tool processes off the sign-in store and off the network; the dedicated
AppArmor profile and the narrow seccomp profile in container/ are what let it start. The container
is removed, and the removal waited for, before anything reads what it wrote.

Paths inside are fixed and opaque: /work/repo, /work/scratch, /work/private. Names, labels and the
host name carry only an opaque launch ID."""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import time
from pathlib import Path

from .common import HERE, Refused

SYSTEM_PATH = "/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin"
CONTAINER_DIR = HERE / "container"
SECCOMP = CONTAINER_DIR / "seccomp-userns.json"
APPARMOR = "cr-bench-bwrap"
PROXY_PORT = 3128
REPO, SCRATCH, PRIVATE = "/work/repo", "/work/scratch", "/work/private"
DEFAULTS = {"cpus": "2", "memory": "4g", "pids": 512, "tmp_size": "1g", "systempaths_unconfined": True,
            "egress_cap_bytes": 512 * 1024 * 1024}


def docker_bin() -> str | None:
    d = shutil.which("docker", path=SYSTEM_PATH)
    return os.path.realpath(d) if d else None


def docker_env() -> dict:
    """The docker client needs only its own context; nothing of the caller's environment else."""
    env = {"PATH": SYSTEM_PATH, "LC_ALL": "C"}
    for k in ("HOME", "DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_CONFIG", "DOCKER_CERT_PATH", "DOCKER_TLS_VERIFY"):
        if os.environ.get(k):
            env[k] = os.environ[k]
    return env


def dk(args: list[str], timeout: int = 120, check: bool = True, input: bytes | None = None) -> subprocess.CompletedProcess:
    d = docker_bin()
    if not d:
        raise Refused("§4 container", "no docker client in system paths; install a container runtime (Colima)")
    r = subprocess.run([d, *args], capture_output=True, timeout=timeout, env=docker_env(), input=input)
    if check and r.returncode != 0:
        raise Refused("§4 container", f"docker {args[0]} failed: {r.stderr.decode(errors='replace').strip()[:300]}")
    return r


def settings(cfg: dict) -> dict | None:
    c = cfg.get("container")
    return None if not c else {**DEFAULTS, **c}


def runtime_info() -> dict:
    """The runtime's facts, for preflight and the record."""
    r = dk(["info", "--format", "{{json .}}"], timeout=30)
    info = json.loads(r.stdout)
    return {"server": info.get("ServerVersion"), "kernel": info.get("KernelVersion"), "arch": info.get("Architecture"),
            "os": info.get("OperatingSystem"), "cpus": info.get("NCPU"), "mem_bytes": info.get("MemTotal"),
            "security": info.get("SecurityOptions") or [], "docker_root": info.get("DockerRootDir")}


def apparmor_active(info: dict) -> bool:
    return any("name=apparmor" in s for s in info.get("security", []))


def image_id(ref: str) -> str | None:
    r = dk(["image", "inspect", "--format", "{{.Id}}", ref], check=False)
    return r.stdout.decode().strip() or None if r.returncode == 0 else None


def file_digest(p: Path) -> str:
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def inputs_digest() -> dict:
    """Digests of everything the image and its confinement are built from."""
    names = ["Dockerfile", "package.json", "package-lock.json", "cr-bench-bwrap.apparmor", "seccomp-userns.json",
             "moby-seccomp-default.json", "make_seccomp.py"]
    out = {n: file_digest(CONTAINER_DIR / n) for n in names}
    out["egress.py"] = file_digest(HERE / "crbench" / "egress.py")
    return out


def build_image(tag: str) -> dict:
    """Build the agent image from container/ and record what it holds."""
    dk(["build", "-f", str(CONTAINER_DIR / "Dockerfile"), "-t", tag, str(HERE)], timeout=3600)
    return image_record(tag)


def image_record(ref: str) -> dict:
    iid = image_id(ref)
    if not iid:
        raise Refused("§4 container", f"image {ref} is not present; build it with `bench.py image`")
    r = dk(["image", "inspect", "--format", "{{.Architecture}} {{.Os}}", ref])
    arch, osn = r.stdout.decode().split()
    script = ("for b in claude codex srt bwrap python3 git; do p=$(readlink -f \"$(command -v $b)\"); "
              "printf '%s %s ' \"$b\" \"$p\"; sha256sum \"$p\" | cut -d' ' -f1; done; "
              "claude --version 2>&1 | head -1; codex --version 2>&1 | head -1")
    out = dk(["run", "--rm", "--network", "none", "--cap-drop", "ALL", "--read-only", "--user", "1000:1000",
              "--tmpfs", "/tmp", "-e", "HOME=/tmp", "--entrypoint", "/bin/sh", ref, "-c", script],
             timeout=120).stdout.decode().splitlines()
    bins = {}
    for ln in out:
        parts = ln.split()
        if len(parts) == 3 and len(parts[2]) == 64:
            bins[parts[0]] = {"path": parts[1], "sha256": parts[2]}
    versions = [ln for ln in out if not (len(ln.split()) == 3 and len(ln.split()[2]) == 64)]
    for cli in ("claude code", "codex"):  # both CLI versions must be on the record, or the build is refused
        if not any(cli in v.lower() for v in versions):
            raise Refused("§9 versions", f"image {ref} did not report a {cli} version: {versions}")
    return {"ref": ref, "id": iid, "arch": arch, "os": osn, "binaries": bins, "versions": versions,
            "inputs": inputs_digest()}


# ------------------------------------------------------------------ per-call launch


def names(lid: str) -> dict:
    return {"agent": f"crb-{lid}", "proxy": f"crb-{lid}-px", "net": f"crb-{lid}-net"}


def hardening(s: dict) -> list[str]:
    """The flags every container gets. Never weakened to make something inside start."""
    flags = ["--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--read-only", "--init",
             "--security-opt", f"seccomp={SECCOMP}", "--security-opt", f"apparmor={APPARMOR}",
             "--pids-limit", str(s["pids"]), "--memory", str(s["memory"]), "--cpus", str(s["cpus"]),
             "--tmpfs", f"/tmp:rw,exec,nosuid,nodev,size={s['tmp_size']}"]
    if s.get("systempaths_unconfined"):  # Claude's sandbox mounts a fresh /proc (feasibility check, Nov 24)
        flags += ["--security-opt", "systempaths=unconfined"]
    return flags


def mount(src: Path, dst: str, ro: bool) -> list[str]:
    if "," in str(src) or "=" in str(src):
        raise Refused("§4 container", f"unsafe mount source {src}")
    return ["--mount", f"type=bind,src={src},dst={dst}" + (",readonly" if ro else "")]


def agent_argv(s: dict, image: str, lid: str, study_label: str, role: str, ws: dict, env_file: Path,
               cmd: list[str], network: str, dns_off: bool = True) -> list[str]:
    n = names(lid)
    argv = ["run", "-i", "--name", n["agent"], "--hostname", "sandbox", "--label", f"cr-bench.study={study_label}",
            "--label", f"cr-bench.launch={lid}", "--network", network, "--user", f"{os.getuid()}:{os.getgid()}",
            "--env-file", str(env_file), "-w", REPO, *hardening(s)]
    if dns_off:
        argv += ["--dns", "127.0.0.1"]  # nothing listens there: the container has no resolver
    argv += mount(Path(ws["workspace"]), REPO, ro=role == "checker")
    if ws.get("scratch"):
        argv += mount(Path(ws["scratch"]), SCRATCH, ro=False)
    argv += mount(Path(ws["private"]), PRIVATE, ro=False)
    return argv + [image, *cmd]


def proxy_argv(s: dict, image: str, lid: str, study_label: str, log_dir: Path, allow: list[str],
               deny_nets: list[str]) -> list[str]:
    n = names(lid)
    args = ["run", "-d", "--name", n["proxy"], "--hostname", "egress", "--label", f"cr-bench.study={study_label}",
            "--label", f"cr-bench.launch={lid}", "--network", "bridge", "--user", f"{os.getuid()}:{os.getgid()}",
            *hardening({**s, "systempaths_unconfined": False}), *mount(log_dir, "/log", ro=False),
            "--entrypoint", "python3", image, "-I", "/opt/cr-bench/egress.py", str(PROXY_PORT), lid,
            "/log/egress.jsonl", *allow]
    for d in deny_nets:
        args += ["--deny-net", d]
    return args


class Call:
    """One container launch with its own internal network and egress proxy. Use as a context
    manager: on any exit the agent container, the proxy and the network are removed, and the
    removal is waited for."""

    def __init__(self, cfg: dict, image: str, lid: str, study_label: str, call_dir: Path, allow: list[str] | None,
                 root: Path):
        self.s = settings(cfg)
        if self.s is None:
            raise Refused("§4 container", "the study config has no container settings")
        self.image, self.lid, self.label, self.dir, self.allow = image, lid, study_label, call_dir, allow
        self.n = names(lid)
        self.root = Path(root)  # the workspace root: on macOS the only host directory the VM shares
        self.log_dir: Path | None = None
        self.proxy_ip: str | None = None

    def __enter__(self) -> "Call":
        (self.dir / "container.json").write_text(json.dumps({"launch": self.lid, **self.n}))
        dk(["network", "create", "--internal", "--label", f"cr-bench.study={self.label}",
            "--label", f"cr-bench.launch={self.lid}", self.n["net"]])
        if self.allow is not None:
            # The proxy writes its log under the workspace root (the call directory may not be
            # visible inside the VM); it is moved into the call directory once the proxy is gone.
            self.log_dir = self.root / ("egress-" + self.lid)
            self.log_dir.mkdir(mode=0o700)
            deny = [x for x in (subnet("bridge"), subnet(self.n["net"])) if x]
            dk(proxy_argv(self.s, self.image, self.lid, self.label, self.log_dir, self.allow, deny))
            dk(["network", "connect", self.n["net"], self.n["proxy"]])
            self.proxy_ip = container_ip(self.n["proxy"], self.n["net"])
            wait_ready(self.n["proxy"])
        return self

    def proxy_env(self) -> dict:
        if not self.proxy_ip:
            return {}
        url = f"http://{self.proxy_ip}:{PROXY_PORT}"
        return {"HTTPS_PROXY": url, "https_proxy": url, "HTTP_PROXY": url, "http_proxy": url, "NO_PROXY": "",
                "no_proxy": ""}

    def argv(self, role: str, ws: dict, env_file: Path, cmd: list[str]) -> list[str]:
        return [docker_bin(), *agent_argv(self.s, self.image, self.lid, self.label, role, ws, env_file, cmd,
                                          self.n["net"])]

    def __exit__(self, *exc) -> None:
        remove(self.lid)
        if self.log_dir is not None and self.log_dir.exists():
            dest = self.dir / "egress"
            dest.mkdir(mode=0o700, exist_ok=True)
            src = self.log_dir / "egress.jsonl"
            if src.is_file() and not src.is_symlink():
                shutil.copyfile(src, dest / "egress.jsonl")
            shutil.rmtree(self.log_dir, ignore_errors=True)


def subnet(network: str) -> str | None:
    r = dk(["network", "inspect", "--format", "{{range .IPAM.Config}}{{.Subnet}} {{end}}", network], check=False)
    s = r.stdout.decode().split()
    return s[0] if r.returncode == 0 and s else None


def container_ip(name: str, network: str) -> str:
    r = dk(["inspect", "--format", "{{json .NetworkSettings.Networks}}", name])
    nets = json.loads(r.stdout)
    ip = (nets.get(network) or {}).get("IPAddress")
    if not ip:
        raise Refused("§4 container", f"{name} has no address on {network}")
    return ip


def wait_ready(name: str, timeout: float = 30) -> None:
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        r = dk(["logs", name], check=False)
        if b"ready" in r.stdout:
            return
        st = dk(["inspect", "--format", "{{.State.Running}}", name], check=False).stdout.decode().strip()
        if st == "false":
            raise Refused("§4 container", f"egress proxy exited: {r.stderr.decode(errors='replace')[-300:]}")
        time.sleep(0.2)
    raise Refused("§4 container", "egress proxy did not start")


def remove(lid: str) -> None:
    """Remove one launch's containers and network, and wait until they are gone."""
    n = names(lid)
    dk(["rm", "-f", n["agent"], n["proxy"]], check=False, timeout=120)
    for _ in range(50):
        left = dk(["ps", "-aq", "--filter", f"label=cr-bench.launch={lid}"], check=False).stdout.split()
        if not left:
            break
        dk(["rm", "-f", *[x.decode() for x in left]], check=False, timeout=120)
        time.sleep(0.2)
    else:
        raise Refused("§4 container", f"containers of launch {lid} could not be removed")
    dk(["network", "rm", n["net"]], check=False)


def reconcile(study_label: str) -> list[str]:
    """Remove every container and network this study left behind (crash, interrupt). Returns the
    launch IDs that were cleaned."""
    if not docker_bin():
        return []
    r = dk(["ps", "-aq", "--filter", f"label=cr-bench.study={study_label}", "--format", "{{.Label \"cr-bench.launch\"}}"],
           check=False)
    lids = sorted({x.decode() for x in r.stdout.split()})
    for lid in lids:
        remove(lid)
    nets = dk(["network", "ls", "-q", "--filter", f"label=cr-bench.study={study_label}"], check=False).stdout.split()
    if nets:
        dk(["network", "rm", *[x.decode() for x in nets]], check=False)
    return lids


def study_label(study_dir: Path) -> str:
    """An opaque per-study label: it names no task, vendor or path."""
    return hashlib.sha256(str(Path(study_dir).resolve()).encode()).hexdigest()[:16]


def egress_log(call_dir: Path) -> list[dict]:
    p = call_dir / "egress" / "egress.jsonl"
    if not p.exists() or p.is_symlink():
        return []
    out = []
    with p.open("rb") as f:
        for ln in f.read(4 * 1024 * 1024).splitlines():
            try:
                out.append(json.loads(ln))
            except json.JSONDecodeError:
                continue
    return out


def write_env_file(path: Path, env: dict) -> Path:
    """docker --env-file: one KEY=VALUE per line, owner-only. Values never reach a command line."""
    for k, v in env.items():
        if "\n" in str(v) or "=" in k:
            raise Refused("§4 container", f"environment value for {k} cannot go in an env file")
    path.unlink(missing_ok=True)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)  # owner-only from the start
    with os.fdopen(fd, "w") as f:
        f.write("".join(f"{k}={v}\n" for k, v in env.items()))
    return path
