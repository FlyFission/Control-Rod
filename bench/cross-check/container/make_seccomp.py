"""Derives seccomp-userns.json from Docker's default profile (moby/profiles, Apache-2.0), adding
one rule and nothing else: the syscalls an unprivileged bubblewrap needs to build its own user,
mount and network namespaces. The container keeps --cap-drop ALL, so these work only inside the
sandbox's own namespaces. Run: python3 make_seccomp.py (checks the source digest first)."""

import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "moby-seccomp-default.json"
SOURCE_SHA256 = "3320527d4568265ac97a077609b1bfd4cfd0d789eeb9239b7e094b1526675406"
ADDED = ["clone", "clone3", "mount", "pivot_root", "setns", "umount2", "unshare"]


def build() -> bytes:
    raw = SOURCE.read_bytes()
    if hashlib.sha256(raw).hexdigest() != SOURCE_SHA256:
        raise SystemExit("moby-seccomp-default.json is not the pinned source")
    prof = json.loads(raw)
    prof["syscalls"].append({"names": ADDED, "action": "SCMP_ACT_ALLOW",
                             "comment": "cr-bench: unprivileged bubblewrap namespaces (DESIGN-v3.4-proposal.md)"})
    return (json.dumps(prof, indent=2, sort_keys=True) + "\n").encode()


if __name__ == "__main__":
    (HERE / "seccomp-userns.json").write_bytes(build())
    print(hashlib.sha256((HERE / "seccomp-userns.json").read_bytes()).hexdigest())
