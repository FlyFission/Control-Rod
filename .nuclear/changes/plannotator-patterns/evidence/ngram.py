import sys, re, os, subprocess
src, repo, ref = sys.argv[1], sys.argv[2], sys.argv[3]
files = sys.argv[4:]
N=6
def toks(t): return re.findall(r"[a-z0-9']+", t.lower())
grams={}
for root,_,fs in os.walk(src):
    if '/.git' in root or 'node_modules' in root: continue
    for f in fs:
        if not f.endswith(('.md','.ts','.tsx','.qnt','.json','.txt','.yml','.yaml','.js','.sh')): continue
        p=os.path.join(root,f)
        try: t=open(p,errors='ignore').read()
        except: continue
        if len(t)>2_000_000: continue
        w=toks(t)
        for i in range(len(w)-N+1):
            grams.setdefault(' '.join(w[i:i+N]), os.path.relpath(p,src))
for f in files:
    t=subprocess.run(['git','-C',repo,'show',f'{ref}:{f}'],capture_output=True,text=True).stdout
    w=toks(t); hits=[]
    for i in range(len(w)-N+1):
        g=' '.join(w[i:i+N])
        if g in grams: hits.append((g,grams[g]))
    print(f"== {f}: {len(w)} words, {len(hits)} shared {N}-word runs")
    seen=set()
    for g,s in hits:
        if g in seen: continue
        seen.add(g); print(f"   '{g}'  <- {s}")
