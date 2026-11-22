"""Every shipped reference file equals its upstream source (CRLF->LF); every upstream skill .md is shipped."""
import sys
from pathlib import Path
packs = {"superpowers": (Path("/tmp/cr-skills/sp"), ["skills"]), "pocock": (Path("/tmp/cr-skills/mp"), ["skills/engineering", "skills/productivity"])}
bad = 0
for name, (up, sources) in packs.items():
    shipped = {p.relative_to(Path("packs/workflows")/name/"reference").as_posix(): p for p in (Path("packs/workflows")/name/"reference").rglob("*") if p.is_file()}
    expected = {}
    for s in sources:
        for skill in sorted(d for d in (up/s).iterdir() if d.is_dir()):
            for f in skill.rglob("*.md"):
                expected[f"{skill.name}/{f.relative_to(skill).as_posix()}"] = f
    missing = set(expected) - set(shipped); extra = set(shipped) - set(expected)
    diff = [k for k in set(expected) & set(shipped) if expected[k].read_bytes().replace(b"\r\n", b"\n") != shipped[k].read_bytes()]
    print(f"{name}: upstream md={len(expected)} shipped={len(shipped)} missing={len(missing)} extra={len(extra)} differing={len(diff)}")
    bad += len(missing) + len(extra) + len(diff)
sys.exit(1 if bad else 0)
