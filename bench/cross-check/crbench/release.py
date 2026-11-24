"""Release gate (DESIGN.md §10): privacy scan with redaction of host paths, digests, the transcript
asset, and share.md generated only from the released manifest after every file is verified."""

from __future__ import annotations

import io
import re
import shutil
import tarfile
from pathlib import Path

from .common import Refused, Study, now, read_json, sha256_file, write_json

COMPACT = ["study.json", "sizing.json", "exclusions.json", "ledger.jsonl", "models.json",
           "calibration/preflight.json", "calibration/probes.json", "calibration/controls.json",
           "main/preflight.json", "main/controls.json", "main/manifest.json", "main/run.json", "main/stability.json",
           "main/verdicts.lock.json", "main/evaluation.json", "main/adjudication/judgments.json",
           "main/adjudication/key.json", "main/results.json", "main/report.md"]
REFUSE = {"email address": re.compile(r"[A-Za-z0-9._%+-]+@(?!invalid\b)[A-Za-z0-9.-]+\.[A-Za-z]{2,}"),
          "API key or token": re.compile(r"\b(sk-[A-Za-z0-9_-]{16,}|sk-ant-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|"
                                         r"eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,})"),
          "credential field": re.compile(r"\"(access_token|refresh_token|id_token|api_key)\"\s*:\s*\"[^\"]{8,}")}


def redactions(cfg: dict) -> list[tuple[re.Pattern, str]]:
    home = str(Path.home())
    return [(re.compile(r"/(private/)?var/tmp/cr-bench-\d+"), "<workspaces>"),
            (re.compile(re.escape(home)), "~"),
            (re.compile(r"/Users/[^/\s\"']+"), "/Users/<user>"),
            (re.compile(r"/home/[^/\s\"']+"), "/home/<user>")]


def scrub(text: str, subs) -> tuple[str, int]:
    n = 0
    for pat, rep in subs:
        text, k = pat.subn(rep, text)
        n += k
    return text, n


def scan(text: str) -> list[str]:
    return [k for k, pat in REFUSE.items() if pat.search(text)]


def release(study: Study) -> dict:
    proto = study.protocol()
    cfg = proto["frozen"]["config"]
    res_p = study.phase_dir("main") / "results.json"
    if not res_p.exists() or read_json(res_p).get("status") != "complete":
        raise Refused("§10", "release needs a complete phase-1 score; calibration is never published as findings")
    out = study.dir / "release"
    if out.exists():
        raise Refused("§10", f"{out} exists; a release is made once")
    subs = redactions(cfg)
    files, hits, redacted = {}, [], {}
    staged = out / "records"
    for rel in COMPACT:
        src = study.dir / rel
        if not src.exists():
            continue
        text, n = scrub(src.read_text(errors="replace"), subs)
        for h in scan(text):
            hits.append(f"{rel}: {h}")
        dst = staged / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(text)
        files[rel] = sha256_file(dst)
        if n:
            redacted[rel] = n
    # the full asset: prompts, transcripts, raw patches and verdicts of phase 1
    buf = io.BytesIO()
    calls = study.phase_dir("main") / "calls"
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for p in sorted(calls.rglob("*")):
            if not p.is_file():
                continue
            rel = p.relative_to(study.dir).as_posix()
            text, n = scrub(p.read_text(errors="replace"), subs)
            for h in scan(text):
                hits.append(f"{rel}: {h}")
            if n:
                redacted[rel] = n
            data = text.encode()
            info = tarfile.TarInfo(rel)
            info.size, info.mtime, info.mode = len(data), 946684800, 0o644
            tar.addfile(info, io.BytesIO(data))
    if hits:
        shutil.rmtree(out)
        raise Refused("§10 privacy", f"{len(hits)} findings, nothing released; first: {hits[0]}")
    asset = out / "transcripts.tar.gz"
    asset.write_bytes(buf.getvalue())
    manifest = {"at": now(), "study_sha256": proto["frozen_sha256"], "files": files,
                "asset": {"path": asset.name, "sha256": sha256_file(asset)},
                "redactions": {"rule": "host paths replaced with placeholders", "counts": redacted},
                "restricted": ["calibration transcripts (calibration results are never published as findings)"]}
    write_json(out / "manifest.json", manifest)
    (out / "share.md").write_text(share(out))
    return manifest


def share(out: Path) -> str:
    """share.md, from the released manifest only, after every referenced file is verified."""
    m = read_json(out / "manifest.json")
    for rel, h in m["files"].items():
        p = out / "records" / rel
        if not p.exists() or sha256_file(p) != h:
            raise Refused("§10", f"released file {rel} is missing or changed")
    if sha256_file(out / m["asset"]["path"]) != m["asset"]["sha256"]:
        raise Refused("§10", "the transcript asset is missing or changed")
    res = read_json(out / "records" / "main/results.json")
    cfg = read_json(out / "records" / "study.json")["frozen"]["config"]
    ew = res["equal_author_weight"]

    def pp(x):
        return "not estimable" if x is None else f"{x * 100:+.1f} points"

    def ci(e):
        return "not estimable" if not e["ci95"] else f"{pp(e['ci95'][0])} to {pp(e['ci95'][1])}"
    pilot = res["designation"] != "publication run"
    L = []
    if pilot:
        L += [f"FEASIBILITY PILOT. No effectiveness claim. ({res['designation']})", ""]
    L += [f"We ran Control Rod's cross-vendor checking benchmark: {', '.join(res['authors'])} each solved the same "
          f"tasks once, and every patch was checked by the author's own model and by the other vendor's.", "",
          f"On patches that fail the hidden tests, the other-vendor checker's explicit rejection rate minus the "
          f"same-model checker's was {pp(ew['bad']['point'])} (95% CI {ci(ew['bad'])}, equal weight across both authors).",
          f"On patches that pass them (false rejections): {pp(ew['good']['point'])} (95% CI {ci(ew['good'])}).", ""]
    for a, gs in res["directional"].items():
        for g in ("bad", "good"):
            c = gs[g]
            if c.get("n"):
                L.append(f"- Author {a}, {g} patches: same-model {c['same_fail']['k']}/{c['n']}, cross-vendor "
                         f"{c['cross_fail']['k']}/{c['n']}; inconclusive {c['inconclusive']['same']} and {c['inconclusive']['cross']}.")
            else:
                L.append(f"- Author {a}, {g} patches: none, not estimable.")
    adj = res["adjudication"]
    L += ["", "Limits:",
          "- The benchmark calls the Claude Code and Codex CLIs directly, not through Control Rod's daemon.",
          "- \"Rejection\" is an explicit fail verdict, not a confirmed defect. Hidden tests are the reference.",
          "- Human sign-off (A4) was omitted from this run, so it says nothing about human time saved."]
    if adj.get("status") == "complete":
        L.append(f"- Discordant rejections were adjudicated by one person, the owner, who {adj['disclosure'].split('the owner, who ')[-1]}.")
    else:
        L.append("- Rejections were not adjudicated, so this post does not claim defects caught.")
    if cfg["cohort"].get("historical"):
        L.append("- Historical cohort: the issues may predate the models' training cutoffs.")
    L += ["- \"Not significant\" is not equivalence.", "",
          f"Spend: $0 beyond existing subscriptions. Records, digests and transcripts: release manifest "
          f"`{m['asset']['sha256'][:12]}`.", "", "Open source, free. Try it today."]
    return "\n".join(L) + "\n"
