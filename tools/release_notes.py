#!/usr/bin/env python3
"""Release notes from the change records' own titles.

Every change has a record under `.nuclear/changes/<slug>/`, and the record's
title is the first heading of its `basis.md`. The notes for a release are the
titles of the records first added between `--from` and `--to`, newest first —
read out of git, never typed by hand. The output is committed with the release
record before the tag is cut; the release workflow attaches those committed
bytes rather than regenerating anything. An empty range is an error, not an
empty release: a tag cut on a range with no new records is a mistake worth
refusing.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


def git(*args: str) -> str:
    r = subprocess.run(["git", *args], capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"git {' '.join(args)} failed: {r.stderr.strip()}")
    return r.stdout


def added_slugs(from_ref: str, to_ref: str) -> list[str]:
    """Record slugs whose first file appears in the range, newest addition first."""
    out = git("log", "--first-parent", "--diff-filter=A", "--name-only", "--pretty=format:--", f"{from_ref}..{to_ref}", "--", ".nuclear/changes/")
    seen: list[str] = []
    for line in out.splitlines():
        parts = line.split("/")
        if len(parts) < 3 or parts[0] != ".nuclear" or parts[1] != "changes":
            continue
        slug = parts[2]
        if slug and slug not in seen:
            seen.append(slug)
    return seen


def title_of(slug: str, at: str) -> str:
    """The record's title: the first heading of its basis.md at the given ref."""
    text = git("show", f"{at}:.nuclear/changes/{slug}/basis.md")
    for line in text.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return slug


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--from", dest="from_ref", required=True, help="the ref the notes start after (the previous release tag)")
    parser.add_argument("--to", dest="to_ref", default="HEAD", help="the release ref (default HEAD)")
    parser.add_argument("--preamble", type=Path, default=None, help="a file whose contents are printed verbatim above the list")
    args = parser.parse_args()

    slugs = added_slugs(args.from_ref, args.to_ref)
    if not slugs:
        sys.exit(f"no new change records in {args.from_ref}..{args.to_ref}; refusing to emit empty release notes")

    if args.preamble is not None:
        text = args.preamble.read_text(encoding="utf-8")
        if text.strip():
            print(text.rstrip())
            print()
    for slug in slugs:
        print(f"- {title_of(slug, args.to_ref)} ({slug})")


if __name__ == "__main__":
    main()
