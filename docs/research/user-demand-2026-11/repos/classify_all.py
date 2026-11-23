"""python3 -I classify_all.py > counts_all.json. Per repo: theme counts over issues and feature requests. Cross-repo: each repo weighted equally (theme share of that repo's feature-request reactions+requests), so big repos do not dominate."""
import json,glob,hashlib,os
R=json.load(open("rules_all.json")); T=R["themes"]
def match(x,kws): return any(k in (" "+x["title"].lower()+" ") for k in kws)
FR_LABELS=("enhancement","feature-req","feature request","feature","triage:feature-request","feature-request","type: feature","kind/feature")
out={"digests":{"rules_all.json":hashlib.sha256(open("rules_all.json","rb").read()).hexdigest()},"repos":{},"cross":{}}
shares={t:[] for t in T}; top3={t:0 for t in T}
for f in sorted(glob.glob("repos/*.json")):
    name=os.path.basename(f)[:-5].replace("_","/",1); d=json.load(open(f))
    out["digests"][f]=hashlib.sha256(open(f,"rb").read()).hexdigest()
    iss=[x for x in d if not x["pr"]]
    fr=[x for x in iss if any(l.lower() in FR_LABELS for l in x["labels"]) or x["title"].lower().lstrip("[(").startswith(("feature","feat","rfe","proposal","request","enhancement"))]
    row={"issues":len(iss),"prs":len(d)-len(iss),"feature_requests":len(fr),"themes":{}}
    score={}
    for t,k in T.items():
        a=[x for x in iss if match(x,k)]; b=[x for x in fr if match(x,k)]
        row["themes"][t]={"issues":len(a),"fr":len(b),"fr_reactions":sum(x["react"] for x in b)}
        score[t]=len(b)+sum(x["react"] for x in b)
    tot=sum(score.values()) or 1
    for t in T: shares[t].append(score[t]/tot)
    for t,_ in sorted(score.items(),key=lambda kv:-kv[1])[:3]:
        if score[t]>0: top3[t]+=1
    row["fr_top3"]=[t for t,_ in sorted(score.items(),key=lambda kv:-kv[1])[:3]]
    out["repos"][name]=row
n=len(out["repos"])
out["cross"]={t:{"mean_share_pct":round(100*sum(shares[t])/n,1),"repos_with_theme_in_fr_top3":top3[t]} for t in sorted(T,key=lambda t:-sum(shares[t]))}
out["repo_count"]=n
print(json.dumps(out,indent=1))
