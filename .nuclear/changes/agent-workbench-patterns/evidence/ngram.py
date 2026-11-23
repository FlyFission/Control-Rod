"""Shared n-word runs between a note and source texts (copied-wording check)."""
import re, sys
from pathlib import Path
N = int(sys.argv[1]); note = Path(sys.argv[2]); sources = [Path(p) for p in sys.argv[3:]]
words = lambda t: re.findall(r"[a-z0-9']+", t.lower())
def grams(ws): return {" ".join(ws[i:i+N]) for i in range(len(ws)-N+1)}
mine = words(note.read_text())
src = set()
for s in sources: src |= grams(words(s.read_text(errors="ignore")))
hits = sorted(g for g in grams(mine) if g in src)
# Merge overlapping hits into maximal runs
runs, i = [], 0
while i <= len(mine) - N:
    if " ".join(mine[i:i+N]) in src:
        j = i
        while j <= len(mine) - N and " ".join(mine[j:j+N]) in src: j += 1
        # Resume at the first start that did not match, so a later overlapping run is never skipped.
        runs.append(" ".join(mine[i:j+N-1])); i = j
    else: i += 1
print(f"n={N} note={note.name} sources={[s.name for s in sources]}")
print(f"shared {N}-word grams: {len(hits)}; maximal runs: {len(runs)}")
for r in runs: print(f"- ({len(r.split())} words) {r}")
