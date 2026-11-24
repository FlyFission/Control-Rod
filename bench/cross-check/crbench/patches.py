"""Patch capture against the recorded base commit, the public test-path rule, and the
re-apply and digest checks (DESIGN.md §6)."""

from __future__ import annotations

from pathlib import Path

from .common import sha256_bytes
from .manifest import is_test_path
from .workspace import _git, export_base, remove

CACHE_EXCLUDES = ["__pycache__/", "*.pyc", "*.pyo", ".pytest_cache/", ".mypy_cache/", ".ruff_cache/",
                  "*.egg-info/", ".tox/", ".coverage", ".DS_Store"]


def capture(repo: Path, base: str, rule: list[str]) -> dict:
    """The author's change as a binary-safe patch from the base commit, with untracked build and
    cache files left out. A test-file change or an empty change is recorded, never altered."""
    excl = repo / ".git" / "info" / "exclude"
    excl.parent.mkdir(parents=True, exist_ok=True)
    excl.write_text("\n".join(CACHE_EXCLUDES) + "\n")
    _git(["add", "-A"], repo)
    raw = _git(["diff", "--cached", "--name-status", "-z", "-M", base], repo)
    parts = [p for p in raw.split("\0") if p]
    changes, i = [], 0
    while i < len(parts):
        st = parts[i]
        if st[0] in "RC":
            changes.append({"status": st, "paths": [parts[i + 1], parts[i + 2]]})
            i += 3
        else:
            changes.append({"status": st, "paths": [parts[i + 1]]})
            i += 2
    patch = _git(["diff", "--cached", "--binary", "--full-index", base], repo)
    test_hits = sorted({p for c in changes for p in c["paths"] if is_test_path(p, rule)})
    if not patch.strip():
        status = "empty"
    elif test_hits:
        status = "patch_invalid"
    else:
        status = "ok"
    return {"status": status, "patch": patch, "sha256": sha256_bytes(patch.encode()), "changes": changes,
            "test_paths": test_hits, "lines": len(patch.splitlines())}


def reapply_ok(task: dict, patch: str, root: Path, cache: Path) -> tuple[bool, str]:
    """Apply the submission to a fresh export of the base. Returns (applies, digest of the tree diff)."""
    repo = export_base(task, root, cache)
    try:
        pf = repo.parent / "p.diff"
        pf.write_text(patch)
        try:
            _git(["apply", "--check", "--binary", str(pf)], repo)
        except SystemExit as e:
            return False, str(e)
        return True, sha256_bytes(patch.encode())
    finally:
        remove(repo.parent)
