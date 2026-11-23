# Re-pull every repository into raw/, then pack each pull into snapshots/ (titles redacted by redact.py, sorted by issue number, gzip with mtime 0).
# Needs an authenticated gh. New pulls will differ from the committed snapshots because issues keep changing.
mkdir -p raw
for r in code-yeongyu/oh-my-openagent herdrdev/herdr ParadevAI/Paradev kdlbs/kandev OrchestratorInc/agent-orchestrator multica-ai/multica BloopAI/vibe-kanban paperclipai/paperclip generalaction/emdash nimbalyst/nimbalyst stravu/crystal mistralai/mistral-vibe smtg-ai/claude-squad agent-of-empires/agent-of-empires herdrdev/herdr-app alvinunreal/oh-my-opencode-slim; do
  f=raw/$(echo $r | tr / _).json; [ -s $f ] || python3 -I pull.py $r $f 2>>pull.log
done
python3 - <<'PY'
import glob, gzip, json, os
from redact import redact
os.makedirs("snapshots", exist_ok=True)
for f in sorted(glob.glob("raw/*.json")):
    d = sorted(json.load(open(f)), key=lambda x: x["n"])
    for x in d:
        x["title"] = redact(x["title"])
    b = json.dumps(d, separators=(",", ":"), ensure_ascii=False).encode()
    open("snapshots/" + os.path.basename(f) + ".gz", "wb").write(gzip.compress(b, 9, mtime=0))
PY
