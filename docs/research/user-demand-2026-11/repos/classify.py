"""python3 -I classify.py > counts.json"""
import json,hashlib
R=json.load(open("rules.json")); out={"digests":{}}
for f in ("rules.json","omo.json","herdr.json"): out["digests"][f]=hashlib.sha256(open(f,"rb").read()).hexdigest()
def themes(items):
    res={}
    for t,kws in R["themes"].items():
        m=[x for x in items if any(k in x["title"].lower() for k in kws)]
        res[t]={"issues":len(m),"open":sum(x["state"]=="open" for x in m),"reactions":sum(x["react"] for x in m),"comments":sum(x["comments"] for x in m)}
    return dict(sorted(res.items(),key=lambda kv:-kv[1]["issues"]))
for f in ("omo.json","herdr.json"):
    d=json.load(open(f)); iss=[x for x in d if not x["pr"]]
    feat=[x for x in iss if any(l in ("enhancement","feature-req","triage:feature-request") for l in x["labels"]) or x["title"].lower().startswith(("[feature","feature","[rfe","feat","proposal"))]
    o={"issues":len(iss),"prs":len(d)-len(iss),"feature_requests":len(feat),"bugs":sum(1 for x in iss if any("bug" in l for l in x["labels"]) or "[bug" in x["title"].lower()),
       "themes_all_issues":themes(iss),"themes_feature_requests":themes(feat)}
    if f=="herdr.json":
        o["labels"]={l:{"issues":sum(l in x["labels"] for x in iss),"feature_req":sum(l in x["labels"] and "feature-req" in x["labels"] for x in iss)} for l in R["herdr_labels"]}
    out[f]=o
print(json.dumps(out,indent=1))
