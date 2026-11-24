"""Small shared helpers: hashing, atomic JSON, time, study paths, refusals."""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent  # bench/cross-check
ROOT = HERE.parent.parent  # repository root
PHASES = ("calibration", "main")


class Refused(SystemExit):
    """A rule in DESIGN.md says no. The message says which rule and why."""

    def __init__(self, rule: str, why: str):
        super().__init__(f"refused ({rule}): {why}")
        self.rule = rule
        self.why = why


def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_time(s: str) -> datetime:
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def sha256_file(p: Path) -> str:
    return sha256_bytes(Path(p).read_bytes())


def canonical(data) -> bytes:
    return json.dumps(data, sort_keys=True, separators=(",", ":")).encode()


def digest(data) -> str:
    return sha256_bytes(canonical(data))


def read_json(p: Path):
    return json.loads(Path(p).read_text())


def write_json(p: Path, data) -> None:
    """Write atomically: a crash leaves the old file or the new one, never half of either."""
    p = Path(p)
    p.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=p.parent, prefix=f".{p.name}.")
    with os.fdopen(fd, "w") as f:
        f.write(json.dumps(data, indent=2, sort_keys=True) + "\n")
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, p)


def append_jsonl(p: Path, rec: dict) -> None:
    p = Path(p)
    p.parent.mkdir(parents=True, exist_ok=True)
    with p.open("a") as f:
        f.write(json.dumps(rec, sort_keys=True) + "\n")
        f.flush()
        os.fsync(f.fileno())


def read_jsonl(p: Path) -> list[dict]:
    p = Path(p)
    if not p.exists():
        return []
    return [json.loads(line) for line in p.read_text().splitlines() if line.strip()]


def sh(args: list[str], cwd: Path | None = None, check: bool = True, **kw) -> subprocess.CompletedProcess:
    r = subprocess.run(args, cwd=cwd, text=True, capture_output=True, **kw)
    if check and r.returncode != 0:
        raise SystemExit(f"failed: {' '.join(map(str, args))}\n{r.stderr.strip()}")
    return r


def git_head(cwd: Path = ROOT) -> str:
    r = sh(["git", "rev-parse", "HEAD"], cwd=cwd, check=False)
    return r.stdout.strip() if r.returncode == 0 else "unknown"


def git_dirty(cwd: Path = ROOT) -> bool | None:
    r = sh(["git", "status", "--porcelain"], cwd=cwd, check=False)
    return bool(r.stdout.strip()) if r.returncode == 0 else None


class Study:
    """One study: a frozen protocol, one ledger, and a run directory per phase."""

    def __init__(self, path: Path):
        self.dir = Path(path).resolve()

    @property
    def protocol_path(self) -> Path:
        return self.dir / "study.json"

    @property
    def ledger_path(self) -> Path:
        return self.dir / "ledger.jsonl"

    def protocol(self) -> dict:
        if not self.protocol_path.exists():
            raise Refused("§2 freeze", f"{self.dir} has no frozen study.json; run `init` first")
        proto = read_json(self.protocol_path)
        if digest(proto["frozen"]) != proto["frozen_sha256"]:
            raise Refused("§9 manifest", "study.json changed after it was frozen")
        return proto

    def phase_dir(self, phase: str) -> Path:
        if phase not in PHASES:
            raise SystemExit(f"phase must be one of {PHASES}")
        return self.dir / phase
