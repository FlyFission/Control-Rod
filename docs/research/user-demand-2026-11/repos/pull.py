import json, subprocess, sys, time, datetime as dt
repo, out = sys.argv[1], sys.argv[2]
def q(query, page):
    for t in range(5):
        r = subprocess.run(["gh","api","-X","GET","search/issues","-f",f"q={query}","-f","per_page=100","-f",f"page={page}"],capture_output=True,text=True)
        time.sleep(2.1)
        if r.returncode==0: return json.loads(r.stdout)
        time.sleep(15)
    raise SystemExit(r.stderr)
items={}
def grab(a,b,kind):
    query=f"repo:{repo} is:{kind} created:{a}..{b}"
    first=q(query,1); n=first["total_count"]
    if n>1000 and a!=b:
        da,db=dt.date.fromisoformat(a),dt.date.fromisoformat(b); mid=da+(db-da)//2
        grab(a,mid.isoformat(),kind); grab((mid+dt.timedelta(1)).isoformat(),b,kind); return
    pages=[first]+[q(query,p) for p in range(2,min(10,(n+99)//100)+1)]
    for pg in pages:
        for i in pg["items"]:
            items[i["number"]]={"n":i["number"],"title":i["title"],"pr":"pull_request" in i,"state":i["state"],
              "labels":[l["name"] for l in i["labels"]],"react":i["reactions"]["total_count"],"plus1":i["reactions"]["+1"],"comments":i["comments"],"created":i["created_at"][:10]}
    print(a,b,n,len(items),file=sys.stderr)
for k in ("issue","pr"): grab("2024-01-01",dt.date.today().isoformat(),k)
json.dump(list(items.values()),open(out,"w"))
print(repo,len(items))
