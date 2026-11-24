"""Select the 60 most-reacted issues across all snapshots. Ties break by repository name, then issue number.
python3 top60.py > top60.json"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import snap
rows = [{"repo": k, "n": x["n"], "react": x["react"], "title": x["title"]}
        for k, v in snap.load_all().items() for x in v["items"] if not x["pr"]]
rows.sort(key=lambda r: (-r["react"], r["repo"], r["n"]))
print(json.dumps(rows[:60], indent=0, ensure_ascii=False))
