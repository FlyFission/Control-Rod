"""Per-call workspaces (DESIGN.md §4, §5): the task's exact base tree, materialized from git
objects and verified by tree OID, committed once with generic metadata in an opaque directory
outside the repo, the study directory and $HOME. Git always runs with no system or global config
and no hooks, so nothing an agent writes into a tree can run on the host."""

from __future__ import annotations

import hashlib
import os
import secrets
import shutil
import stat
import subprocess
import sys
from pathlib import Path

from .common import HERE, ROOT, Refused

GENERIC = {"GIT_AUTHOR_NAME": "bench", "GIT_AUTHOR_EMAIL": "bench@invalid", "GIT_COMMITTER_NAME": "bench",
           "GIT_COMMITTER_EMAIL": "bench@invalid", "GIT_AUTHOR_DATE": "2000-01-01T00:00:00Z",
           "GIT_COMMITTER_DATE": "2000-01-01T00:00:00Z"}
SAFE = ["-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false", "-c", "commit.gpgsign=false",
        "-c", "core.autocrlf=false", "-c", "core.symlinks=true", "-c", "safe.directory=*",
        "-c", "advice.detachedHead=false", "-c", "init.defaultBranch=main",
        # no background repack or maintenance: a detached `gc --auto` after a large commit (a Django
        # export) writes pack temp files while the harness removes the tree
        "-c", "gc.auto=0", "-c", "gc.autoDetach=false", "-c", "maintenance.auto=false"]


SYSTEM_PATH = "/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin"


def trusted_git() -> str:
    """Git by absolute path from system locations only, never a `git` that an earlier PATH
    entry (a workspace, a project's bin directory) could supply."""
    g = shutil.which("git", path=SYSTEM_PATH)
    if not g:
        raise Refused("§5 trusted git", f"no git in {SYSTEM_PATH}")
    return os.path.realpath(g)


def git_env(extra: dict | None = None) -> dict:
    env = {"PATH": SYSTEM_PATH, "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": "/dev/null",
           "GIT_TERMINAL_PROMPT": "0", "HOME": "/nonexistent", "LC_ALL": "C", **GENERIC}
    if extra:
        env.update(extra)
    return env


def _gitb(args, cwd, stdin: bytes | None = None, env: dict | None = None) -> bytes:
    r = subprocess.run([trusted_git(), *SAFE, *args], cwd=cwd, input=stdin, capture_output=True, env=git_env(env))
    if r.returncode != 0:
        raise SystemExit(f"git {' '.join(map(str, args))} failed: {r.stderr.decode(errors='replace').strip()}")
    return r.stdout


def _git(args, cwd, env: dict | None = None) -> str:
    return _gitb(args, cwd, env=env).decode(errors="replace")


def workspace_root_path(cfg: dict) -> Path:
    """Where the workspace root is, with no side effect."""
    raw = cfg["caps"].get("workspace_root") or f"/var/tmp/cr-bench-{os.getuid()}"
    return Path(os.path.expanduser(raw)).resolve(strict=False)


def workspace_root(cfg: dict, study_dir: Path | None = None) -> Path:
    root = workspace_root_path(cfg)
    forbidden = [ROOT.resolve(), Path.home().resolve(strict=False)]
    if study_dir is not None:
        forbidden.append(Path(study_dir).resolve(strict=False))
    for f in forbidden:
        if root == f or f in root.parents or root in f.parents:
            raise Refused("§4 isolation", f"workspace root {root} overlaps {f}")
    root.mkdir(parents=True, exist_ok=True)
    root.chmod(0o711)
    return root


def new_dir(root: Path) -> Path:
    d = Path(root) / secrets.token_hex(12)
    d.mkdir(parents=True, exist_ok=False)
    return d


def mirror(task: dict, cache: Path) -> Path:
    """A bare mirror of the task's repository, cloned atomically, fetched if the base is missing."""
    m = cache / (task["repo"].replace("/", "__") + ".git")
    if not m.exists():
        m.parent.mkdir(parents=True, exist_ok=True)
        tmp = m.parent / f".{m.name}.{secrets.token_hex(4)}"
        _gitb(["clone", "-q", "--mirror", f"https://github.com/{task['repo']}.git", str(tmp)], cache)
        os.replace(tmp, m)
    r = subprocess.run([trusted_git(), *SAFE, "--git-dir", str(m), "cat-file", "-e", f"{task['base_commit']}^{{commit}}"],
                       capture_output=True, env=git_env())
    if r.returncode != 0:
        _gitb(["--git-dir", str(m), "fetch", "-q", "origin", task["base_commit"]], cache)
    return m


def export_base(task: dict, root: Path, cache: Path) -> Path:
    """A fresh opaque directory holding the task's base tree as the only commit: no history,
    remotes, caches or upstream object store. For a real task the committed tree OID must equal
    the source commit's tree OID."""
    d = new_dir(root)
    repo = d / "repo"
    repo.mkdir()
    want = None
    if task.get("fixture_dir"):
        shutil.copytree(HERE / task["fixture_dir"] / "repo", repo, dirs_exist_ok=True, symlinks=True)
    else:
        m = mirror(task, cache)
        want = _git(["--git-dir", str(m), "rev-parse", f"{task['base_commit']}^{{tree}}"], cache).strip()
        idx = {"GIT_INDEX_FILE": str(d / ".idx")}
        _gitb(["--git-dir", str(m), "read-tree", task["base_commit"]], d, env=idx)
        _gitb(["--git-dir", str(m), "--work-tree", str(repo), "checkout-index", "-a", "-f"], d, env=idx)
        (d / ".idx").unlink()
    _gitb(["init", "-q"], repo)
    _gitb(["add", "-A", "-f"], repo)
    _gitb(["commit", "-q", "--allow-empty", "-m", "base"], repo)
    if want is not None:
        got = tree_oid(repo, "HEAD")
        if got != want:
            remove(d)
            raise Refused("§4 base tree", f"{task['instance_id']}: materialized tree {got[:12]} != source {want[:12]}")
    return repo


def tree_oid(repo: Path, rev: str = "HEAD") -> str:
    return _git(["rev-parse", f"{rev}^{{tree}}"], repo).strip()


def base_rev(repo: Path) -> str:
    return _git(["rev-parse", "HEAD"], repo).strip()


def commit_count(repo: Path) -> int:
    return int(_git(["rev-list", "--all", "--count"], repo).strip())


def tree_hash(repo: Path) -> str:
    """Digest of every path, mode, link target and file content under repo, .git included."""
    h = hashlib.sha256()
    for dirpath, dirnames, filenames in os.walk(repo, followlinks=False):
        dirnames.sort()
        for name in sorted(dirnames + filenames):
            p = Path(dirpath) / name
            st = p.lstat()
            h.update(p.relative_to(repo).as_posix().encode() + b"\0" + oct(st.st_mode).encode() + b"\0")
            if stat.S_ISLNK(st.st_mode):
                h.update(os.readlink(p).encode())
            elif stat.S_ISREG(st.st_mode):
                h.update(p.read_bytes())
    return h.hexdigest()


def make_read_only(repo: Path, files_only: bool = False) -> None:
    """Defense in depth only; the read-only guarantee is the OS confinement (confine.py), or in a
    container the read-only mount. files_only leaves every directory's mode alone for a container
    call: Claude Code's sandbox puts mount points for absent protected names (.claude,
    .git/config.lock, ...) under its working directory and skips one only when its directory
    refuses as read-only (EROFS); a mode-only refusal (EACCES) from the owner makes it try, and
    bubblewrap then aborts the shell before any command runs."""
    for dirpath, dirnames, filenames in os.walk(repo, followlinks=False):
        for name in [*([] if files_only else dirnames), *filenames]:
            p = Path(dirpath) / name
            if not p.is_symlink():
                p.chmod(p.lstat().st_mode & ~0o222)
    if not files_only:
        repo.chmod(repo.stat().st_mode & ~0o222)


def apply_patch(repo: Path, patch: bytes, index: bool = True) -> None:
    pf = repo.parent / f".p-{secrets.token_hex(4)}.diff"
    pf.write_bytes(patch)
    try:
        _gitb(["apply", "--binary", *(["--index"] if index else []), str(pf)], repo)
    finally:
        pf.unlink()


def checker_tree(task: dict, patch: bytes, root: Path, cache: Path, files_only: bool = False) -> tuple[Path, Path]:
    """The base commit with the patch applied to the index and tree (so `git diff HEAD` shows
    every change, new files included), plus a separate writable scratch directory."""
    repo = export_base(task, root, cache)
    if patch.strip():
        apply_patch(repo, patch)
    scratch = repo.parent / "scratch"
    scratch.mkdir()
    make_read_only(repo, files_only)
    return repo, scratch


def remove(d: Path) -> None:
    """Delete a workspace, read-only parts included, without following links."""
    d = Path(d)
    if not d.exists() and not d.is_symlink():
        return
    for dirpath, dirnames, filenames in os.walk(d, followlinks=False):
        for name in [*dirnames, *filenames]:
            p = Path(dirpath) / name
            if not p.is_symlink():
                try:
                    p.chmod(p.lstat().st_mode | 0o700)
                except OSError:
                    pass
    try:
        d.chmod(d.stat().st_mode | 0o700)
    except OSError:
        pass

    def gone(func, path, exc):  # an entry that vanished on its own is already removed
        e = exc if isinstance(exc, BaseException) else exc[1]
        if not isinstance(e, FileNotFoundError):
            raise e
    kw = {"onexc": gone} if sys.version_info >= (3, 12) else {"onerror": gone}
    for attempt in range(3):  # a directory that gained an entry mid-walk is walked again
        try:
            shutil.rmtree(d, **kw)
            return
        except OSError:
            if attempt == 2 or not d.exists():
                if d.exists():
                    raise
                return
