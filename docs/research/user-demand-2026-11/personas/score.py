"""Count persona coverage per need and rank differentiators. Run: python3 -I score.py inputs.json > outputs.json"""
import json, sys, hashlib
src = open(sys.argv[1], 'rb').read(); d = json.loads(src)
needs, arch = d["needs"], d["archetypes"]
assert sum(a["n"] for a in arch) == 100
def rank(weak_delta=None):
    rows = []
    for k, v in needs.items():
        top = sum(a["n"] for a in arch if k in a["top"])
        anyc = sum(a["n"] for a in arch if k in a["top"] or k in a["sec"])
        w = v["weakness"] + (weak_delta.get(k, 0) if weak_delta else 0)
        w = max(0, min(2, w))
        rows.append({"id": k, "name": v["name"], "top3": top, "any": anyc, "weighted": top + 0.5*(anyc-top),
                     "weakness": w, "effort": v["effort"], "score": round((top + 0.5*(anyc-top)) * w / v["effort"], 2)})
    return sorted(rows, key=lambda r: (-r["score"], -r["top3"]))
base = rank()
# sensitivity: shift each need's weakness by -1 and +1, record how often each need stays in the top 5
stay = {k: 0 for k in needs}; trials = 0
for k in needs:
    for dlt in (-1, 1):
        trials += 1
        for r in rank({k: dlt})[:5]: stay[r["id"]] += 1
out = {"input_sha256": hashlib.sha256(src).hexdigest(), "ranked": base,
       "by_coverage": sorted([{"id": r["id"], "top3": r["top3"], "any": r["any"]} for r in base], key=lambda r: -r["top3"]),
       "top5_stability": {k: f"{v}/{trials}" for k, v in sorted(stay.items(), key=lambda x: -x[1])}}
print(json.dumps(out, indent=1))
