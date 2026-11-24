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
    dk(["build", "-f", str(CONTAINER_DIR / "Dockerfile"), "-t", tag, "--label",
        f"cr-bench.inputs={inputs_key()}", str(HERE)], timeout=3600)
    return image_record(tag)


def inputs_key() -> str:
    return hashlib.sha256(json.dumps(inputs_digest(), sort_keys=True).encode()).hexdigest()


def image_record(ref: str) -> dict:
    iid = image_id(ref)
    if not iid:
        raise Refused("§4 container", f"image {ref} is not present; build it with `bench.py image`")
    r = dk(["image", "inspect", "--format", "{{.Architecture}} {{.Os}} {{index .Config.Labels \"cr-bench.inputs\"}}", ref])
    parts = r.stdout.decode().split()
    arch, osn = parts[0], parts[1]
    built_from = parts[2] if len(parts) > 2 else None
    if built_from != inputs_key():  # the build stamps the digest of the inputs it was built from
        raise Refused("§9 versions", f"image {ref} was not built from the current container/ inputs; "
                                     "rebuild it with `bench.py image`")
    script = ("for b in claude codex srt bwrap python3 git; do p=$(readlink -f \"$(command -v $b)\"); "
              "printf '%s %s ' \"$b\" \"$p\"; sha256sum \"$p\" | cut -d' ' -f1; done; "
              "echo CLAUDE_VERSION=$(claude --version 2>/dev/null | head -1); "
              "echo CODEX_VERSION=$(codex --version 2>/dev/null | head -1)")
    out = dk(["run", "--rm", "--network", "none", "--cap-drop", "ALL", "--read-only", "--user", "1000:1000",
              "--tmpfs", "/tmp", "-e", "HOME=/tmp", "--entrypoint", "/bin/sh", ref, "-c", script],
             timeout=120).stdout.decode().splitlines()
    bins = {}
    for ln in out:
        parts = ln.split()
        if len(parts) == 3 and len(parts[2]) == 64:
            bins[parts[0]] = {"path": parts[1], "sha256": parts[2]}
    got = {ln.split("=", 1)[0]: ln.split("=", 1)[1].strip() for ln in out if ln.startswith(("CLAUDE_VERSION=", "CODEX_VERSION="))}
    pins = json.loads((CONTAINER_DIR / "package.json").read_text())["dependencies"]
    want = {"CLAUDE_VERSION": f"{pins['@anthropic-ai/claude-code']} (Claude Code)",
            "CODEX_VERSION": f"codex-cli {pins['@openai/codex']}"}
    for k, v in want.items():  # each CLI must report exactly its pinned version, or the image is refused
        if got.get(k) != v:
            raise Refused("§9 versions", f"image {ref}: expected {v!r}, the CLI reported {got.get(k)!r}")
    versions = [got["CLAUDE_VERSION"], got["CODEX_VERSION"]]
    return {"ref": ref, "id": iid, "arch": arch, "os": osn, "binaries": bins, "versions": versions,
            "inputs": inputs_digest(), "inputs_key": built_from}


# ------------------------------------------------------------------ per-call launch


def names(lid: str) -> dict:
    return {"agent": f"crb-{lid}", "proxy": f"crb-{lid}-px", "net": f"crb-{lid}-net"}


def hardening(s: dict, sandbox: bool = True, systempaths: bool = False) -> list[str]:
    """The flags every container gets. `sandbox`: the agent container, whose CLI starts its own
    bubblewrap sandbox, gets the two profiles in container/ that allow exactly that; any other
    container (the proxy) keeps Docker's default seccomp and AppArmor profiles. `systempaths`:
    the one disclosed exception, only for the CLI that needs it (Claude's sandbox mounts a fresh
    /proc; feasibility check, Nov 24). AppArmor's /proc and /sys denials still apply."""
    flags = ["--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--read-only", "--init",
             "--pids-limit", str(s["pids"]), "--memory", str(s["memory"]), "--cpus", str(s["cpus"]),
             "--tmpfs", f"/tmp:rw,exec,nosuid,nodev,size={s['tmp_size']}"]
    if sandbox:
        flags += ["--security-opt", f"seccomp={SECCOMP}", "--security-opt", f"apparmor={APPARMOR}"]
    else:
        flags += ["--security-opt", "apparmor=docker-default"]
    if sandbox and systempaths and s.get("systempaths_unconfined"):
        flags += ["--security-opt", "systempaths=unconfined"]
    return flags


def mount(src: Path, dst: str, ro: bool) -> list[str]:
    if "," in str(src) or "=" in str(src):
        raise Refused("§4 container", f"unsafe mount source {src}")
    return ["--mount", f"type=bind,src={src},dst={dst}" + (",readonly" if ro else "")]


def agent_argv(s: dict, image: str, lid: str, study_label: str, role: str, ws: dict, env_file: Path,
               cmd: list[str], network: str, dns_off: bool = True, systempaths: bool = False) -> list[str]:
    n = names(lid)
    argv = ["run", "-i", "--name", n["agent"], "--hostname", "sandbox", "--label", f"cr-bench.study={study_label}",
            "--label", f"cr-bench.launch={lid}", "--network", network, "--user", f"{os.getuid()}:{os.getgid()}",
            "--env-file", str(env_file), "-w", REPO, *hardening(s, systempaths=systempaths)]
    if dns_off:
        argv += ["--dns", "127.0.0.1"]  # nothing listens there: the container has no resolver
    argv += mount(Path(ws["workspace"]), REPO, ro=role == "checker")
    if ws.get("scratch"):
        argv += mount(Path(ws["scratch"]), SCRATCH, ro=False)
    argv += mount(Path(ws["private"]), PRIVATE, ro=False)
    return argv + [image, *cmd]


def proxy_argv(s: dict, image: str, lid: str, study_label: str, log_dir: Path, allow: list[str],
               deny_nets: list[str], listen_net: str) -> list[str]:
    """`docker create` for the proxy: created on the call network, connected to the bridge before it
    starts, listening only on its call-network address."""
    n = names(lid)
    args = ["create", "--name", n["proxy"], "--hostname", "egress", "--label", f"cr-bench.study={study_label}",
            "--label", f"cr-bench.launch={lid}", "--network", n["net"], "--user", f"{os.getuid()}:{os.getgid()}",
            *hardening(s, sandbox=False), *mount(log_dir, "/log", ro=False),
            "--entrypoint", "python3", image, "-I", "/opt/cr-bench/egress.py", str(PROXY_PORT), lid,
            "/log/egress.jsonl", *allow, "--listen-net", listen_net]
    for d in deny_nets:
        args += ["--deny-net", d]
    if s.get("egress_cap_bytes"):
        args += ["--max-bytes", str(int(s["egress_cap_bytes"]))]
    return args


class Call:
    """One container launch with its own internal network and egress proxy. Use as a context
    manager: on any exit the agent container, the proxy and the network are removed, and the
    removal is waited for."""

    def __init__(self, cfg: dict, image: str, lid: str, study_label: str, call_dir: Path, allow: list[str] | None,
                 root: Path, systempaths: bool = False):
        self.s = settings(cfg)
        if self.s is None:
            raise Refused("§4 container", "the study config has no container settings")
        self.image, self.lid, self.label, self.dir, self.allow = image, lid, study_label, call_dir, allow
        self.n = names(lid)
        self.root = Path(root)  # the workspace root: on macOS the only host directory the VM shares
        self.log_dir: Path | None = None
        self.proxy_ip: str | None = None
        self.systempaths = systempaths
        self.removed = False

    def __enter__(self) -> "Call":
        (self.dir / "container.json").write_text(json.dumps({"launch": self.lid, **self.n}))
        try:
            self._setup()
        except BaseException:
            self.__exit__(None, None, None)  # a half-built launch is torn down like a finished one
            raise
        return self

    def _setup(self) -> None:
        dk(["network", "create", "--internal", "--label", f"cr-bench.study={self.label}",
            "--label", f"cr-bench.launch={self.lid}", self.n["net"]])
        if self.allow is not None:
            # The proxy writes its log under the workspace root (the call directory may not be
            # visible inside the VM); it is moved into the call directory once the proxy is gone.
            self.log_dir = self.root / ("egress-" + self.lid)
            self.log_dir.mkdir(mode=0o700)
            internal = subnet(self.n["net"])
            if not internal:
                raise Refused("§4 container", "the call network has no subnet")
            deny = [x for x in (subnet("bridge"), internal) if x]
            dk(proxy_argv(self.s, self.image, self.lid, self.label, self.log_dir, self.allow, deny, internal))
            dk(["network", "connect", "bridge", self.n["proxy"]])
            dk(["start", self.n["proxy"]])
            self.proxy_ip = container_ip(self.n["proxy"], self.n["net"])
            wait_ready(self.n["proxy"])

    def proxy_env(self) -> dict:
        if not self.proxy_ip:
            return {}
        url = f"http://{self.proxy_ip}:{PROXY_PORT}"
        return {"HTTPS_PROXY": url, "https_proxy": url, "HTTP_PROXY": url, "http_proxy": url, "NO_PROXY": "",
                "no_proxy": ""}

    def argv(self, role: str, ws: dict, env_file: Path, cmd: list[str]) -> list[str]:
        return [docker_bin(), *agent_argv(self.s, self.image, self.lid, self.label, role, ws, env_file, cmd,
                                          self.n["net"], systempaths=self.systempaths)]

    def __exit__(self, *exc) -> None:
        remove(self.lid)
        self.removed = True
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


def _left(lid: str) -> list[str]:
    """IDs of this launch's containers still present. Raises if the runtime cannot answer: an
    unanswered question is never read as "gone"."""
    r = dk(["ps", "-aq", "--filter", f"label=cr-bench.launch={lid}"], check=False)
    if r.returncode != 0:
        raise Refused("§4 container", f"cannot confirm that launch {lid} is gone: the runtime did not answer")
    return [x.decode() for x in r.stdout.split()]


def remove(lid: str) -> None:
    """Remove one launch's containers and network, and confirm they are gone. The agent goes first;
    the proxy is then stopped with a grace period so its log is complete; then the network."""
    n = names(lid)
    dk(["rm", "-f", n["agent"]], check=False, timeout=120)
    dk(["stop", "-t", "5", n["proxy"]], check=False, timeout=60)
    dk(["rm", "-f", n["proxy"]], check=False, timeout=120)
    for _ in range(50):
        left = _left(lid)
        if not left:
            break
        dk(["rm", "-f", *left], check=False, timeout=120)
        time.sleep(0.2)
    else:
        raise Refused("§4 container", f"containers of launch {lid} could not be removed")
    dk(["network", "rm", n["net"]], check=False)
    r = dk(["network", "ls", "-q", "--filter", f"label=cr-bench.launch={lid}"], check=False)
    if r.returncode != 0 or r.stdout.strip():
        raise Refused("§4 container", f"network of launch {lid} could not be confirmed removed")


def reconcile(study_label: str) -> list[str]:
    """Remove every container and network this study left behind (crash, interrupt). Returns the
    launch IDs that were cleaned."""
    if not docker_bin():
        return []
    r = dk(["ps", "-aq", "--filter", f"label=cr-bench.study={study_label}", "--format", "{{.Label \"cr-bench.launch\"}}"],
           check=False)
    if r.returncode != 0:
        raise Refused("§4 container", "cannot list this study's containers: the runtime did not answer")
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
