"""Outer OS confinement for every agent call and the fixture grader (DESIGN.md §4, §5).

This ports the approach of daemon/internal/runner (seatbeltProfile in checker.go, and the bwrap
argv in checker_mount_linux.go): reads of the real HOME, the study directory, the repository and
the workspace root are denied, then the call's own directories are allowed again; writes are
denied everywhere except the paths a role may write. The CLIs' own sandboxes are the inner layer.

macOS uses Seatbelt (sandbox-exec), where a later rule overrides an earlier one. Linux uses
bubblewrap, where a later mount covers an earlier one. Elsewhere nothing real may run."""

from __future__ import annotations

import os
import platform
import shutil
from pathlib import Path


class Unconfinable(SystemExit):
    pass


def canonical(p) -> str:
    return str(Path(os.path.expanduser(str(p))).resolve(strict=False))


def outermost(paths: list[str]) -> list[str]:
    """Drop any path inside another listed path (nested denials break bubblewrap)."""
    ps = sorted(set(paths), key=len)
    out: list[str] = []
    for p in ps:
        if not any(p == o or p.startswith(o.rstrip("/") + "/") for o in out):
            out.append(p)
    return sorted(out)


def mechanism() -> str | None:
    if platform.system() == "Darwin" and shutil.which("sandbox-exec"):
        return "seatbelt"
    if platform.system() == "Linux" and shutil.which("bwrap"):
        return "bwrap"
    return None


def sbpl(s: str) -> str:
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def seatbelt_profile(deny_read: list[str], allow_read: list[str], writable: list[str], network: bool) -> str:
    L = ["(version 1)", "(allow default)", "(deny file-write*)",
         '(allow file-write-data (literal "/dev/null"))']
    if not network:
        L.append("(deny network*)")
    else:
        L.append("(deny network-outbound (remote unix-socket))")
    L += [f"(deny file-read* (subpath {sbpl(p)}))" for p in deny_read]
    L += [f"(allow file-read* (subpath {sbpl(p)}))" for p in allow_read]
    L += [f"(allow file-write* (subpath {sbpl(p)}))" for p in writable]
    return "\n".join(L) + "\n"


def bwrap_argv(deny_read: list[str], allow_read: list[str], writable: list[str], read_only: list[str],
               network: bool) -> list[str]:
    a = ["bwrap", "--die-with-parent", "--unshare-pid", "--unshare-ipc", "--ro-bind", "/", "/",
         "--dev", "/dev", "--proc", "/proc", "--tmpfs", "/tmp"]
    if not network:
        a.append("--unshare-net")
    for p in deny_read:
        if os.path.isdir(p):
            a += ["--tmpfs", p]
        elif os.path.exists(p):
            a += ["--ro-bind", "/dev/null", p]
    for p in allow_read:
        if os.path.exists(p):
            a += ["--ro-bind", p, p]
    for p in writable:
        if os.path.exists(p):
            a += ["--bind", p, p]
    for p in read_only:  # re-protect a read-only tree inside a writable one
        if os.path.exists(p):
            a += ["--ro-bind", p, p]
    return a + ["--"]


def wrap(argv: list[str], *, deny_read: list, allow_read: list, writable: list, read_only: list = (),
         network: bool = True, required: bool = True) -> tuple[list[str], dict]:
    """Return (argv to run, a record of the confinement). Paths are canonicalized first."""
    dr = outermost([canonical(p) for p in deny_read])
    ar = sorted({canonical(p) for p in allow_read})
    wr = sorted({canonical(p) for p in writable})
    ro = sorted({canonical(p) for p in read_only})
    m = mechanism()
    rec = {"mechanism": m, "deny_read": len(dr), "allow_read": len(ar), "writable": len(wr), "network": network}
    if m == "seatbelt":
        # Seatbelt has no read-only bind: a read-only tree is simply not in the writable list.
        wr = [w for w in wr if not any(w == r or w.startswith(r + "/") for r in ro)]
        return ["sandbox-exec", "-p", seatbelt_profile(dr, ar, wr, network), *argv], rec
    if m == "bwrap":
        return [*bwrap_argv(dr, ar, wr, ro, network), *argv], rec
    if required:
        raise Unconfinable("no OS confinement here (need sandbox-exec on macOS or bwrap on Linux); "
                           "a real call cannot run unconfined")
    return list(argv), rec
