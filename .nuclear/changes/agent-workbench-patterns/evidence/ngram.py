"""Shared n-word runs between a note and source texts (copied-wording check).

Runs are found per source, so every listed run exists whole in the source named beside it, and a
scan resumes at the first start that did not match, so overlapping runs are never skipped.
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
    src = grams(words(s.read_text(errors="ignore")))
    hits = sorted(g for g in grams(mine) if g in src)
    runs, i = [], 0
    while i <= len(mine) - N:
        if " ".join(mine[i:i+N]) in src:
            j = i
            while j <= len(mine) - N and " ".join(mine[j:j+N]) in src: j += 1
            # A run of consecutive matching starts can still join two separate source passages;
            # keep it whole only when its full text is in the source, else list its grams apart.
            run = " ".join(mine[i:j+N-1])
            runs.append(run if run in " ".join(words(s.read_text(errors="ignore"))) else " | ".join(" ".join(mine[k:k+N]) for k in range(i, j)))
            i = j
        else: i += 1
    total += len(runs)
    print(f"{s.name}: shared {N}-word grams: {len(hits)}; runs: {len(runs)}")
    for r in runs: print(f"- ({len(r.split())} words) {r}")
print(f"total runs: {total}")
