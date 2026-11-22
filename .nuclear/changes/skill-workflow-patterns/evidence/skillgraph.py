import re, sys
from pathlib import Path
root = Path(sys.argv[1])
files = sorted(p for p in root.rglob("SKILL.md") if "in-progress" not in p.parts and "misc" not in p.parts)
names = {p.parent.name for p in files}
H = re.compile(r"your human partner|ask the user|wait for (the user|approval|your human)|user approv|one question at a time|interview|confirm with|get approval", re.I)
for p in files:
    t = p.read_text()
    refs = sorted(n for n in names if n != p.parent.name and re.search(rf"(superpowers:|/|`|\b)({re.escape(n)})\b", t))
    print(f"{p.parent.name:32} -> {', '.join(refs) or '-'}  | human touchpoints: {len(H.findall(t))}")
