"""Shared n-word runs between a note and source texts (copied-wording check).

For each source, a run is the longest stretch of the note, starting at a matching n-word gram, whose
whole text appears in that source. A run that sits inside an earlier run is not listed again, so
two separate passages are two runs, and overlapping passages are both listed.
"""
import re, sys
from pathlib import Path
N = int(sys.argv[1]); note = Path(sys.argv[2]); sources = [Path(p) for p in sys.argv[3:]]
words = lambda t: re.findall(r"[a-z0-9']+", t.lower())
def grams(ws): return {" ".join(ws[i:i+N]) for i in range(len(ws)-N+1)}
mine = words(note.read_text())
print(f"n={N} note={note.name} sources={[s.name for s in sources]}")
total = 0
for s in sources:
    sw = words(s.read_text(errors="ignore"))
    text = " " + " ".join(sw) + " "
    src = grams(sw)
    hits = sorted(g for g in grams(mine) if g in src)
    runs, end = [], 0
    for i in range(len(mine) - N + 1):
        if " ".join(mine[i:i+N]) not in src:
            continue
        j = i + N
        while j < len(mine) and f" {' '.join(mine[i:j+1])} " in text:
            j += 1
        if j > end:
            runs.append(" ".join(mine[i:j])); end = j
    total += len(runs)
    print(f"{s.name}: shared {N}-word grams: {len(hits)}; runs: {len(runs)}")
    for r in runs: print(f"- ({len(r.split())} words) {r}")
print(f"total runs: {total}")
