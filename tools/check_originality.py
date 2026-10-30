"""Fail when tracked repository text names a third-party franchise.

The denylist holds only SHA-256 hashes of normalized phrases, so the
repository never publishes the names it guards against. Every one, two and
three word window of each tracked text file is normalized, hashed and
compared. See docs/overlay-themes/originality.md.
"""

from __future__ import annotations

import hashlib
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DENYLIST = ROOT / "tools" / "originality-denylist.sha256"
MAX_WORDS = 6  # longest denylist phrase is five words; the canary is four
SKIP_SUFFIXES = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".woff", ".woff2",
    ".ttf", ".otf", ".pdf", ".zip", ".gz", ".wasm",
}
SKIP_NAMES = {"pnpm-lock.yaml", "package-lock.json", "Cargo.lock", "go.sum", "uv.lock"}
WORD = re.compile(r"[a-z0-9]+")


def normalize_words(text: str) -> list[str]:
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return WORD.findall(ascii_text.lower())


def phrase_hash(words: list[str]) -> str:
    return hashlib.sha256(" ".join(words).encode()).hexdigest()


def load_denylist(path: Path = DENYLIST) -> set[str]:
    hashes = set()
    for line in path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            hashes.add(line)
    return hashes


def find_hits(text: str, denied: set[str]) -> list[tuple[int, int]]:
    """Return (line number, window size) for each denied phrase found.

    Words are windowed across line breaks, so a phrase split by ordinary text
    wrapping is still found; the line reported is the phrase's first word.
    """
    words: list[str] = []
    lines: list[int] = []
    for number, line in enumerate(text.splitlines(), start=1):
        for word in normalize_words(line):
            words.append(word)
            lines.append(number)
    hits = []
    for size in range(1, MAX_WORDS + 1):
        for start in range(len(words) - size + 1):
            if phrase_hash(words[start:start + size]) in denied:
                hits.append((lines[start], size))
    return sorted(hits)


def tracked_files(root: Path = ROOT) -> list[Path]:
    out = subprocess.run(
        ["git", "ls-files", "-z"], cwd=root, check=True, capture_output=True
    ).stdout
    return [root / name for name in out.decode().split("\0") if name]


def scan(paths: list[Path], denied: set[str]) -> list[str]:
    problems = []
    for path in paths:
        if path.suffix.lower() in SKIP_SUFFIXES or path.name in SKIP_NAMES:
            continue
        if path == DENYLIST or not path.is_file():
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for number, size in find_hits(text, denied):
            # Report location only; printing the phrase would republish it.
            problems.append(f"{path.relative_to(ROOT)}:{number}: denied {size} word phrase")
    return problems


def main() -> int:
    problems = scan(tracked_files(), load_denylist())
    for problem in problems:
        print(problem)
    if problems:
        print(f"{len(problems)} originality finding(s); see docs/overlay-themes/originality.md")
        return 1
    print("originality check passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
