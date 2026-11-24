"""python3 onboarding_count.py > onboarding_counts.json  (reads snapshots/)"""
import json,glob,os,hashlib,sys
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import snap
S=snap.load_all()
R=json.load(open("onboarding_rules.json"))["themes"]; out={"rules_sha256":hashlib.sha256(open("onboarding_rules.json","rb").read()).hexdigest(),"repos":{},"total":{}}
tot={t:[0,0] for t in R}; N=0
for key,v in S.items():
    iss=[x for x in v["items"] if not x["pr"]]; N+=len(iss); row={"issues":len(iss)}
    for t,k in R.items():
        m=[x for x in iss if any(w in x["title"].lower() for w in k)]
        row[t]=[len(m),sum(x["react"] for x in m)]; tot[t][0]+=len(m); tot[t][1]+=sum(x["react"] for x in m)
    out["repos"][key]=row
anyc=0
for key,v in S.items():
    for x in v["items"]:
        if not x["pr"] and any(any(w in x["title"].lower() for w in k) for t,k in R.items() if t!="Docs unclear" and t!="Windows and WSL"): anyc+=1
out["total"]={t:{"issues":v[0],"reactions":v[1],"pct_of_issues":round(100*v[0]/N,1)} for t,v in sorted(tot.items(),key=lambda kv:-kv[1][0])}
out["all_issues"]=N; out["any_onboarding_theme_excl_docs_windows"]=anyc
print(json.dumps(out,indent=1))
