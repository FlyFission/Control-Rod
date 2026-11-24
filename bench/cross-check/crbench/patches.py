"""Patch capture in a trusted repository, the public test-path rule, and re-application checked
by tree OID (DESIGN.md §6). Host git never runs against the author's own .git directory."""

from __future__ import annotations

import os
import shutil
import stat
from pathlib import Path

from .common import sha256_bytes
from .manifest import is_test_path
from .workspace import _git, _gitb, apply_patch, export_base, remove, tree_oid

CACHE_EXCLUDES = ["__pycache__/", "*.pyc", "*.pyo", ".pytest_cache/", ".mypy_cache/", ".ruff_cache/",
                  "*.egg-info/", ".tox/", ".coverage", ".DS_Store"]


def is_git_name(name: str) -> bool:
    """`.git` in any case: on a case-insensitive Mac volume `.GIT` is the same directory."""
    return name.casefold() == ".git"


def import_tree(src: Path, dst: Path) -> list[str]:
    """Replace dst's worktree (not its .git) with src's regular files and links, never following
    links and never reading any `.git`, at any depth or case. Returns skipped special files."""
    for p in dst.iterdir():
        if not is_git_name(p.name):
            remove(p) if p.is_dir() and not p.is_symlink() else p.unlink()
    skipped = []
    for dirpath, dirnames, filenames in os.walk(src, followlinks=False):
        rel = Path(dirpath).relative_to(src)
        skipped += [(rel / n).as_posix() for n in dirnames + filenames if is_git_name(n)]
        dirnames[:] = [n for n in dirnames if not is_git_name(n)]
        filenames = [n for n in filenames if not is_git_name(n)]
        (dst / rel).mkdir(parents=True, exist_ok=True)
        for name in list(dirnames):
            s = Path(dirpath) / name
            if s.is_symlink():
                dirnames.remove(name)
                os.symlink(os.readlink(s), dst / rel / name)
        for name in filenames:
            s = Path(dirpath) / name
            st = s.lstat()
            if stat.S_ISLNK(st.st_mode):
                os.symlink(os.readlink(s), dst / rel / name)
            elif stat.S_ISREG(st.st_mode):
                shutil.copy2(s, dst / rel / name, follow_symlinks=False)
            else:
                skipped.append((rel / name).as_posix())
    return skipped


def identity(repo: Path) -> list[int]:
    """The author tree's directory and its parent, by device and inode (lstat, never followed)."""
    out = []
    for p in (repo.parent, repo):
        st = os.lstat(p)
        if not stat.S_ISDIR(st.st_mode):
            raise SystemExit(f"{p} is not a directory")
        out += [st.st_dev, st.st_ino]
    return out


def capture(author_repo: Path, task: dict, root: Path, cache: Path, rule: list[str],
            ident: list[int] | None = None) -> dict:
    """The author's change as a binary-safe patch against the recorded base, computed in a fresh
    trusted export. A test-file change or an empty change is recorded, never altered. ident, taken
    before the call, must still describe the tree: a swapped directory or a link is refused."""
    try:
        if ident is not None and identity(author_repo) != ident:
            return {"status": "patch_invalid", "why": "the author's tree was replaced during the call", "patch": b"",
                    "sha256": sha256_bytes(b""), "tree_oid": None, "changes": [], "test_paths": [],
                    "skipped_special_files": [], "lines": 0}
    except (OSError, SystemExit) as e:
        return {"status": "patch_invalid", "why": f"the author's tree is not a plain directory: {e}", "patch": b"",
                "sha256": sha256_bytes(b""), "tree_oid": None, "changes": [], "test_paths": [],
                "skipped_special_files": [], "lines": 0}
    trusted = export_base(task, root, cache)
    try:
        base = _git(["rev-parse", "HEAD"], trusted).strip()
        skipped = import_tree(author_repo, trusted)
        (trusted / ".git" / "info").mkdir(parents=True, exist_ok=True)
        (trusted / ".git" / "info" / "exclude").write_text("\n".join(CACHE_EXCLUDES) + "\n")
        _gitb(["add", "-A"], trusted)
        raw = _gitb(["diff", "--cached", "--name-status", "-z", "-M", base], trusted).decode(errors="replace")
        parts = [p for p in raw.split("\0") if p]
        changes, i = [], 0
        while i < len(parts):
            st = parts[i]
            n = 3 if st[0] in "RC" else 2
            changes.append({"status": st, "paths": parts[i + 1:i + n]})
            i += n
        patch = _gitb(["diff", "--cached", "--binary", "--full-index", base], trusted)
        tree = _git(["write-tree"], trusted).strip()
    finally:
        remove(trusted.parent)
    test_hits = sorted({p for c in changes for p in c["paths"] if is_test_path(p, rule)})
    status = "empty" if not patch.strip() else ("patch_invalid" if test_hits else "ok")
    return {"status": status, "patch": patch, "sha256": sha256_bytes(patch), "tree_oid": tree, "changes": changes,
            "test_paths": test_hits, "skipped_special_files": skipped, "lines": patch.count(b"\n")}


def reapply_ok(task: dict, patch: bytes, tree: str, root: Path, cache: Path) -> tuple[bool, str]:
    """Apply the stored bytes to a fresh export of the base; the result must be the captured tree."""
    repo = export_base(task, root, cache)
    try:
        try:
            apply_patch(repo, patch)
        except SystemExit as e:
            return False, str(e)
        got = _git(["write-tree"], repo).strip()
        return (got == tree), got
    finally:
        remove(repo.parent)


__all__ = ["capture", "reapply_ok", "import_tree", "tree_oid"]
