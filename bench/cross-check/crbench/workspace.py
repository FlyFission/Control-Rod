"""Per-call workspaces: an exported single-commit tree in an opaque directory outside the repo,
the run directory and $HOME (DESIGN.md §4). Checker trees are read-only (§5)."""

from __future__ import annotations

import hashlib
import os
import secrets
import shutil
import stat
import subprocess
import tarfile
import io
from pathlib import Path

from .common import HERE, Refused, sh

GENERIC = {"GIT_AUTHOR_NAME": "bench", "GIT_AUTHOR_EMAIL": "bench@invalid", "GIT_COMMITTER_NAME": "bench",
           "GIT_COMMITTER_EMAIL": "bench@invalid", "GIT_AUTHOR_DATE": "2000-01-01T00:00:00Z",
           "GIT_COMMITTER_DATE": "2000-01-01T00:00:00Z"}


def workspace_root(cfg: dict) -> Path:
    root = Path(cfg["caps"].get("workspace_root") or f"/var/tmp/cr-bench-{os.getuid()}")
    forbidden = [HERE.parent.parent.resolve(), Path.home().resolve()]
    r = root.resolve() if root.exists() else root.absolute()
    for f in forbidden:
        if r == f or f in r.parents:
            raise Refused("§4 isolation", f"workspace root {r} is inside {f}")
    root.mkdir(parents=True, exist_ok=True)
    root.chmod(0o711)  # others can enter a directory whose 96-bit name they know, never list one
    return root


def new_dir(root: Path) -> Path:
    d = root / secrets.token_hex(12)
    d.mkdir(parents=True, exist_ok=False)
    return d


def _git(args, cwd):
    env = {**os.environ, **GENERIC}
    r = subprocess.run(["git", *args], cwd=cwd, text=True, capture_output=True, env=env)
    if r.returncode != 0:
        raise SystemExit(f"git {' '.join(args)} failed: {r.stderr.strip()}")
    return r.stdout


def mirror(task: dict, cache: Path) -> Path:
    m = cache / (task["repo"].replace("/", "__") + ".git")
    if not m.exists():
        m.parent.mkdir(parents=True, exist_ok=True)
        sh(["git", "clone", "-q", "--mirror", f"https://github.com/{task['repo']}.git", str(m)])
    return m


def export_base(task: dict, root: Path, cache: Path) -> Path:
    """A fresh opaque directory holding the task's base tree as the only commit. No history,
    remotes, caches or upstream object store (§4)."""
    d = new_dir(root)
    repo = d / "repo"
    repo.mkdir()
    if task.get("fixture_dir"):
        shutil.copytree(HERE / task["fixture_dir"] / "repo", repo, dirs_exist_ok=True)
    else:
        m = mirror(task, cache)
        data = subprocess.run(["git", "-C", str(m), "archive", "--format=tar", task["base_commit"]],
                              capture_output=True, check=True).stdout
        with tarfile.open(fileobj=io.BytesIO(data)) as t:
            t.extractall(repo, filter="data")
    _git(["init", "-q"], repo)
    _git(["add", "-A"], repo)
    _git(["commit", "-qm", "base"], repo)
    return repo


def base_rev(repo: Path) -> str:
    return _git(["rev-parse", "HEAD"], repo).strip()


def commit_count(repo: Path) -> int:
    return int(_git(["rev-list", "--all", "--count"], repo).strip())


def tree_hash(repo: Path) -> str:
    """Digest of every file path, mode and content under repo, .git included."""
    h = hashlib.sha256()
    for p in sorted(repo.rglob("*")):
        rel = p.relative_to(repo).as_posix()
        st = p.lstat()
        h.update(rel.encode() + b"\0" + oct(st.st_mode).encode() + b"\0")
        if p.is_file() and not p.is_symlink():
            h.update(p.read_bytes())
    return h.hexdigest()


def make_read_only(repo: Path) -> None:
    for p in [repo, *repo.rglob("*")]:
        if p.is_symlink():
            continue
        mode = p.stat().st_mode
        p.chmod(mode & ~(stat.S_IWUSR | stat.S_IWGRP | stat.S_IWOTH))


def checker_tree(task: dict, patch: str, root: Path, cache: Path) -> tuple[Path, Path]:
    """The base commit with the patch applied (uncommitted, so `git diff` shows it), read-only,
    plus a separate writable scratch directory."""
    repo = export_base(task, root, cache)
    if patch.strip():
        pf = repo.parent / "p.diff"
        pf.write_text(patch)
        _git(["apply", "--binary", str(pf)], repo)
        pf.unlink()
    scratch = repo.parent / "scratch"
    scratch.mkdir()
    make_read_only(repo)
    return repo, scratch


def remove(d: Path) -> None:
    """Delete a workspace, read-only parts included."""
    d = Path(d)
    if not d.exists():
        return
    for p in [d, *d.rglob("*")]:
        if not p.is_symlink():
            try:
                p.chmod(p.stat().st_mode | stat.S_IWUSR | stat.S_IXUSR | stat.S_IRUSR)
            except OSError:
                pass
    shutil.rmtree(d)
