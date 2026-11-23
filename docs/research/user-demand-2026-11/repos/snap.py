"""Shared loader for the committed issue snapshots (snapshots/<owner>_<repo>.json.gz)."""
import glob, gzip, hashlib, json, os
HERE = os.path.dirname(os.path.abspath(__file__))
def load_all():
    files = sorted(glob.glob(os.path.join(HERE, "snapshots", "*.json.gz")))
    if not files:
        raise SystemExit("no snapshots found in snapshots/; see README.md")
    out = {}
    for f in files:
        raw = open(f, "rb").read()
        name = os.path.basename(f)[:-len(".json.gz")]
        out[name] = {"items": json.loads(gzip.decompress(raw)), "sha256": hashlib.sha256(raw).hexdigest()}
    return out
