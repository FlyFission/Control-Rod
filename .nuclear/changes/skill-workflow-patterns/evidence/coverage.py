"""Coverage check for docs/patterns/skill-workflows.md (E-02).

Discovers every skill in scope in the two upstream checkouts and fails, listing the names, when the
note does not name one of them. Also fails when a checkout has no skills at all, so an empty or
wrong path cannot pass.

    python3 -I coverage.py <note.md> <superpowers checkout> <pocock checkout>
"""
import re
import sys
from pathlib import Path

note_path, sp, mp = (Path(a) for a in sys.argv[1:4])
note = note_path.read_text()
scopes = {"superpowers": [Path(sp, "skills")], "pocock": [Path(mp, "skills", "engineering"), Path(mp, "skills", "productivity")]}
failed = False
for pack, dirs in scopes.items():
    found = sorted({p.parent.name for d in dirs for p in d.glob("*/SKILL.md")})
    if not found:
        print(f"{pack}: no SKILL.md found under {', '.join(map(str, dirs))}")
        failed = True
        continue
    missing = [n for n in found if not re.search(rf"(?<![\w-]){re.escape(n)}(?![\w-])", note)]
    print(f"{pack}: {len(found)} skills in scope, {len(found) - len(missing)} named in the note, {len(missing)} missing")
    for n in missing:
        print(f"  missing: {n}")
    failed = failed or bool(missing)
sys.exit(1 if failed else 0)
