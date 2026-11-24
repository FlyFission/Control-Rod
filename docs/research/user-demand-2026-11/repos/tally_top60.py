"""Count the hand coding of the top 60. python3 tally_top60.py > top60_counts.txt
Columns: issues, reactions, repositories, theme."""
import json
t = {f'{r["repo"]}#{r["n"]}': r for r in json.load(open("top60.json"))}
c = json.load(open("top60_codes.json"))["codes"]
ids = [i for v in c.values() for i in v]
assert len(t) == 60 and sorted(ids) == sorted(t), "the coding must cover each of the 60 selected issues once"
for k, v in sorted(c.items(), key=lambda kv: (-sum(t[i]["react"] for i in kv[1]), kv[0])):
    print(len(v), sum(t[i]["react"] for i in v), len({t[i]["repo"] for i in v}), k)
