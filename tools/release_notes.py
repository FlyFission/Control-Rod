#!/usr/bin/env python3
"""Release notes from the repository's own change titles.

Every change that lands on `main` is a squash merge whose subject is the change's
title, and every change has a record under `.nuclear/changes/<slug>/` whose name
that subject states. The notes for a release are therefore read out of git, never
typed by hand: `--from` names where the list starts, `--to` the release (default
HEAD). The output is one bullet per first-parent commit in the range, newest
first. An empty range is an error, not an empty release: a tag cut on a range
with no changes is a mistake worth refusing.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


def subjects(from_ref: str, to_ref: str) -> list[str]:
    """The first-parent commit subjects between two refs, newest first."""
    import subprocess

    r = subprocess.run(
        ["git", "log", "--first-parent", "--pretty=%s", f"{from_ref}..{to_ref}"],
        capture_output=True,
        text=True,
    )
    if r.returncode != 0:
        sys.exit(f"git log {from_ref}..{to_ref} failed: {r.stderr.strip()}")
    return [line.strip() for line in r.stdout.splitlines() if line.strip()]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--from", dest="from_ref", required=True, help="the ref the notes start after (the previous release tag)")
    parser.add_argument("--to", dest="to_ref", default="HEAD", help="the release ref (default HEAD)")
    parser.add_argument("--preamble", type=Path, default=None, help="a file whose contents are printed verbatim above the list")
    args = parser.parse_args()

    titles = subjects(args.from_ref, args.to_ref)
    if not titles:
        sys.exit(f"no changes found in {args.from_ref}..{args.to_ref}; refusing to emit empty release notes")

    if args.preamble is not None:
        text = args.preamble.read_text(encoding="utf-8")
        if text.strip():
            print(text.rstrip())
            print()
    for title in titles:
        print(f"- {title}")


if __name__ == "__main__":
    main()
