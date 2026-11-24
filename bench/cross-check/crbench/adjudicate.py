"""Verdict lock, the blind adjudication queue, judgments, and hidden-test evaluation, in that order
(DESIGN.md §7, Owner decision 2 and 3). The queue is built after every verdict is hashed and locked
and before evaluation.json exists; evaluation waits until adjudication is complete or skipped."""

from __future__ import annotations

import hashlib
import random
import secrets

from .common import Refused, Study, digest, now, read_json, sha256_bytes, write_json
from .grading import grade, grade_submission
from .manifest import load_manifest
from .workspace import workspace_root

JUDGMENTS = ("supported", "unsupported", "indeterminate")
RUBRIC = ("supported: a concrete in-scope defect with a code-location citation from the patch, or a "
          "counterexample that can be reproduced; unsupported: the cited problem is not real or not in "
          "scope; indeterminate: cannot tell from the issue, patch and code")


def _first(pdir, tid, author, role, rep=0) -> dict | None:
    for n in range(50):
        p = pdir / "calls" / f"{tid}--{author}--{role}--r{rep}-a{n}" / "result.json"
        if not p.exists():
            return None
        r = read_json(p)
        if r["status"] in ("ok", "inconclusive"):
            return r
    return None


def verdict_of(r: dict | None) -> str | None:
    if r is None:
        return None
    if r["status"] == "inconclusive":
        return "inconclusive"
    return r["verdict"]["verdict"] if r.get("verdict") else "inconclusive"


def checks(study: Study, phase: str) -> list[dict]:
    """Every first check and repeat, keyed by task, author and checker role."""
    pdir = study.phase_dir(phase)
    m = load_manifest(study, phase)
    authors = study.protocol()["frozen"]["config"]["authors"]
    out = []
    for tid in m["tasks"]:
        for a in authors:
            sp = pdir / "calls" / f"{tid}--{a}--author" / "submission.json"
            if not sp.exists() or read_json(sp)["status"] != "ok":
                continue
            for role in ("same", "cross"):
                for rep in (0, 1):
                    r = _first(pdir, tid, a, role, rep)
                    if r is None and rep == 1:
                        continue
                    out.append({"task": tid, "author": a, "role": role, "rep": rep, "result": r,
                                "verdict": verdict_of(r)})
    return out


# ------------------------------------------------------------------ lock


def lock(study: Study, phase: str) -> dict:
    pdir = study.phase_dir(phase)
    if (pdir / "evaluation.json").exists():
        raise Refused("§7 blinding", "evaluation.json already exists; verdicts can no longer be locked blind")
    if (pdir / "verdicts.lock.json").exists():
        raise Refused("§7", "verdicts are already locked")
    run = pdir / "run.json"
    if not run.exists() or read_json(run)["status"] != "complete":
        raise Refused("§9", f"{phase} run is not complete")
    cs = checks(study, phase)
    missing = [c for c in cs if c["rep"] == 0 and c["verdict"] is None]
    if missing:
        raise Refused("§6 completeness", f"{len(missing)} first checks have no verdict")
    rows = [{"task": c["task"], "author": c["author"], "role": c["role"], "rep": c["rep"], "verdict": c["verdict"],
             "text_sha256": sha256_bytes((c["result"].get("text") or "").encode()),
             "patch_sha256": c["result"].get("patch_sha256")} for c in cs]
    rec = {"at": now(), "rows": rows, "sha256": digest(rows)}
    write_json(pdir / "verdicts.lock.json", rec)
    build_queue(study, phase, cs)
    return rec


def build_queue(study: Study, phase: str, cs: list[dict]) -> dict:
    """Discordant explicit rejections among first checks: one checker failed the patch, the other
    passed it or was inconclusive. Anonymized and shuffled with the frozen seed."""
    pdir = study.phase_dir(phase)
    seed = study.protocol()["frozen"]["config"]["selection"]["seed"]
    first = {(c["task"], c["author"], c["role"]): c for c in cs if c["rep"] == 0}
    items, key = [], {}
    fail_fail = 0
    salt = secrets.token_hex(16)  # item IDs must not be computable from the public seed
    m = load_manifest(study, phase)
    for (tid, a, role), c in first.items():
        if role != "same":
            continue
        x = first[(tid, a, "cross")]
        if c["verdict"] == "fail" and x["verdict"] == "fail":
            fail_fail += 1
            continue
        for rejecting, other in ((c, x), (x, c)):
            if rejecting["verdict"] == "fail" and other["verdict"] != "fail":
                iid = hashlib.sha256(f"{salt}:{tid}:{a}:{rejecting['role']}".encode()).hexdigest()[:10]
                patch = (pdir / "calls" / f"{tid}--{a}--author" / "patch.diff").read_text()
                items.append({"item": iid, "issue": m["rows"][tid]["problem_statement"], "patch": patch,
                              "patch_sha256": sha256_bytes(patch.encode()),
                              "citations": rejecting["result"]["verdict"]["defects"]})
                key[iid] = {"task": tid, "author": a, "rejected_by": rejecting["role"],
                            "other_verdict": other["verdict"]}
    items.sort(key=lambda i: i["item"])
    random.Random(f"{seed}:adjudication:{salt}").shuffle(items)
    adir = pdir / "adjudication"
    write_json(adir / "queue.json", {"rubric": RUBRIC, "items": items, "fail_fail_unaudited": fail_fail})
    write_json(adir / "key.json", {"note": "do not open before adjudication is complete", "salt": salt, "key": key})
    lines = ["# Adjudication queue", "", f"Rubric: {RUBRIC}.", "",
             "Each item is one explicit rejection. Vendor, checker role, the other verdict and the hidden-test",
             "result are withheld. Record each with",
             "`bench.py adjudicate --study DIR --phase PHASE --item ID --judgment supported|unsupported|indeterminate"
             " --note TEXT`.", ""]
    for it in items:
        lines += [f"## {it['item']}", "", "### Issue", "", "```text", it["issue"].strip(), "```", "",
                  "### Cited defects", "", *[f"- `{d['location']}`: {d['reason']}" for d in it["citations"]], "",
                  "### Patch", "", "```diff", it["patch"].rstrip(), "```", ""]
    (adir / "queue.md").write_text("\n".join(lines))
    return {"items": len(items), "fail_fail_unaudited": fail_fail}


def adjudicate(study: Study, phase: str, item: str | None, judgment: str | None, note: str | None,
               skip: str | None = None) -> dict:
    pdir = study.phase_dir(phase)
    adir = pdir / "adjudication"
    if (pdir / "evaluation.json").exists():
        raise Refused("§7 blinding", "evaluation.json exists; adjudication is closed")
    if not (adir / "queue.json").exists():
        raise Refused("§7", "lock the verdicts first; that builds the queue")
    jp = adir / "judgments.json"
    rec = read_json(jp) if jp.exists() else {"judgments": {}, "skipped": None}
    if skip is not None:
        if not skip.strip():
            raise Refused("§7", "skipping adjudication needs a reason")
        rec["skipped"] = {"reason": skip, "at": now()}
    else:
        ids = {i["item"] for i in read_json(adir / "queue.json")["items"]}
        if item not in ids:
            raise Refused("§7", f"no queue item {item!r}")
        if judgment not in JUDGMENTS:
            raise Refused("§7", f"judgment must be one of {JUDGMENTS}")
        if not (note or "").strip():
            raise Refused("§7", "each judgment needs a short justification")
        if item in rec["judgments"]:
            raise Refused("§7", f"{item} is already judged; judgments are not revised")
        rec["judgments"][item] = {"judgment": judgment, "note": note.strip(), "at": now()}
    write_json(jp, rec)
    return rec


def adjudication_done(study: Study, phase: str) -> dict:
    adir = study.phase_dir(phase) / "adjudication"
    q = read_json(adir / "queue.json")
    jp = adir / "judgments.json"
    j = read_json(jp) if jp.exists() else {"judgments": {}, "skipped": None}
    pending = [i["item"] for i in q["items"] if i["item"] not in j["judgments"]]
    return {"complete": not pending or bool(j["skipped"]), "pending": len(pending), "skipped": j["skipped"]}


# ------------------------------------------------------------------ evaluation


def evaluate(study: Study, phase: str) -> dict:
    pdir = study.phase_dir(phase)
    if not (pdir / "verdicts.lock.json").exists():
        raise Refused("§7 blinding", "lock the verdicts before evaluation")
    st = adjudication_done(study, phase)
    if not st["complete"]:
        raise Refused("§7 blinding", f"{st['pending']} adjudication items pending; finish or skip them first")
    if (pdir / "evaluation.json").exists():
        raise Refused("§6", "evaluation.json exists; each phase is evaluated once")
    cfg = study.protocol()["frozen"]["config"]
    m = load_manifest(study, phase)
    authors = cfg["authors"]
    items, subs = [], {}
    for tid in m["tasks"]:
        for a in authors:
            sp = pdir / "calls" / f"{tid}--{a}--author" / "submission.json"
            sub = read_json(sp) if sp.exists() else {"status": "infra_error", "why": "no submission"}
            subs[(tid, a)] = sub
            if sub["status"] == "ok":
                patch = (pdir / "calls" / f"{tid}--{a}--author" / "patch.diff").read_text()
                if sha256_bytes(patch.encode()) != sub["sha256"]:
                    raise Refused("§6 digest", f"{tid}/{a}: the grader would not receive the checked patch")
                items.append((f"{tid}|{a}", tid, patch))
    graded = grade(cfg, items, m["rows"], workspace_root(cfg), study.dir / "cache", pdir / "eval")
    results = {}
    for (tid, a), sub in subs.items():
        g = grade_submission(sub, graded.get(f"{tid}|{a}"))
        g["patch_sha256"] = sub.get("sha256")
        results.setdefault(tid, {})[a] = g
    rec = {"at": now(), "results": results, "snapshot": cfg["snapshot"], "evaluation": cfg["evaluation"]}
    write_json(pdir / "evaluation.json", rec)
    return rec
