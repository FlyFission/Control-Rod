"""Fail when the web app's HTML or CSS loads anything from another host.

Fonts and styles must be self hosted so the app needs no third-party request
(workbench spec Q-9 and N-10). Map tiles in GeoMap are tracked separately
(plan task 8.2) because they are fetched at run time by script.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REMOTE = re.compile(r"""(?:https?:)?//(?!www\.w3\.org/)[a-z0-9.-]+\.[a-z]{2,}""", re.IGNORECASE)


def remote_references(text: str) -> list[str]:
    """Remote hosts referenced by href, src, url() or @import in HTML or CSS."""
    found = []
    for match in re.finditer(r"""(?:href|src)\s*=\s*["']([^"']+)["']|url\(\s*["']?([^"')]+)|@import\s+["']([^"']+)""", text, re.IGNORECASE):
        target = next(g for g in match.groups() if g)
        if REMOTE.match(target.strip()):
            found.append(target.strip())
    return found


def files(root: Path = ROOT) -> list[Path]:
    web = root / "apps" / "web"
    out = [p for p in web.glob("*.html")]
    out += [p for p in (web / "src").rglob("*.css")]
    return sorted(p for p in out if p.is_file())


def main() -> int:
    problems = []
    for path in files():
        for target in remote_references(path.read_text(encoding="utf-8")):
            problems.append(f"{path.relative_to(ROOT)}: remote reference {target}")
    for problem in problems:
        print(problem)
    if problems:
        print(f"{len(problems)} remote reference(s); self host the asset")
        return 1
    print("offline assets check passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
