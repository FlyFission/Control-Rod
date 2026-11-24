"""Verdict lock, the blind adjudication queue, judgments, and hidden-test evaluation, in that order
(DESIGN.md §7, Owner decision 2 and 3). The lock and the queue are staged together and committed by
one rename; evaluation, scoring and release re-verify the lock against the call records, and
evaluation waits until adjudication is complete or skipped."""

from __future__ import annotations

import hashlib
import random
import secrets
import shutil

from .common import Refused, Study, digest, now, read_json, sha256_bytes, sha256_file, write_json
from .grading import grade, grade_submission
from .ledger import Ledger
from .manifest import load_manifest
from .preflight import denied_paths
from .workspace import workspace_root

JUDGMENTS = ("supported", "unsupported", "indeterminate")
RUBRIC = ("supported: a concrete in-scope defect with a code-location citation from the patch, or a "
          "counterexample that can be reproduced; unsupported: the cited problem is not real or not in "
          "scope; indeterminate: cannot tell from the issue, patch and code")


def _first(pdir, tid, author, role, rep=0) -> dict | None:
    """The first terminal check result; attempts that ended in infra_error are skipped."""
    n = 0
    while True:
        p = pdir / "calls" / f"{tid}--{author}--{role}--r{rep}-a{n}" / "result.json"
        if not p.parent.exists():
            return None
        if p.exists():
            r = read_json(p)
            if r["status"] in ("ok", "inconclusive"):
                return r
        n += 1


def verdict_of(r: dict | None) -> str | None:
    if r is None:
        return None
    if r["status"] == "inconclusive":
        return "inconclusive"
    return r["verdict"]["verdict"] if r.get("verdict") else "inconclusive"


def stability_sample(pdir) -> set[tuple[str, str]]:
    p = pdir / "stability.json"
    return {tuple(x) for x in read_json(p)["sample"]} if p.exists() else set()


def checks(study: Study, phase: str) -> list[dict]:
    """Every first check, and every repeat the stability sample requires, keyed by task, author and
    checker role. A required check with no result has verdict None."""
    pdir = study.phase_dir(phase)
    m = load_manifest(study, phase)
    authors = study.protocol()["frozen"]["config"]["authors"]
    sample = stability_sample(pdir)
    out = []
    for tid in m["tasks"]:
        for a in authors:
            sp = pdir / "calls" / f"{tid}--{a}--author" / "submission.json"
            if not sp.exists() or read_json(sp)["status"] != "ok":
                continue
            for role in ("same", "cross"):
                for rep in (0, 1):
                    if rep == 1 and (tid, a) not in sample:
                        continue
                    r = _first(pdir, tid, a, role, rep)
                    out.append({"task": tid, "author": a, "role": role, "rep": rep, "result": r,
                                "verdict": verdict_of(r)})
    return out


def lock_rows(cs: list[dict]) -> list[dict]:
    if any(c["result"] is None for c in cs):
        raise Refused("§7 blinding", "a locked check's result is missing")
    return [{"task": c["task"], "author": c["author"], "role": c["role"], "rep": c["rep"], "verdict": c["verdict"],
             "text_sha256": sha256_bytes((c["result"].get("text") or "").encode()),
             "patch_sha256": c["result"].get("patch_sha256")} for c in cs]


def submissions(study: Study, phase: str) -> dict:
    """Every task and author's submission with the digest of its patch bytes on disk. A missing
    submission is refused: the lock covers the whole phase or nothing."""
    pdir = study.phase_dir(phase)
    m = load_manifest(study, phase)
    out = {}
    for tid in m["tasks"]:
        for a in study.protocol()["frozen"]["config"]["authors"]:
            bdir = pdir / "calls" / f"{tid}--{a}--author"
            sp = bdir / "submission.json"
            if not sp.exists():
                raise Refused("§6 completeness", f"{tid}/{a} has no submission")
            sub = read_json(sp)
            pd = bdir / "patch.diff"
            out[f"{tid}|{a}"] = {"status": sub["status"], "sha256": sub.get("sha256"),
                                 "bytes_sha256": sha256_file(pd) if pd.exists() and not pd.is_symlink() else None}
            if sub["status"] == "ok" and out[f"{tid}|{a}"]["bytes_sha256"] != sub["sha256"]:
                raise Refused("§6 digest", f"{tid}/{a}: patch bytes differ from the captured digest")
    return out


# ------------------------------------------------------------------ lock


def lock(study: Study, phase: str) -> dict:
    pdir = study.phase_dir(phase)
    with Ledger(study).run_lock():  # every check below happens inside the exclusive section
        if (pdir / "evaluation.json").exists():
            raise Refused("§7 blinding", "evaluation.json already exists; verdicts can no longer be locked blind")
        if (pdir / "verdicts.lock.json").exists():
            raise Refused("§7", "verdicts are already locked")
        run = pdir / "run.json"
        if not run.exists() or read_json(run)["status"] != "complete":
            raise Refused("§9", f"{phase} run is not complete")
        subs = submissions(study, phase)
        cs = checks(study, phase)
        missing = [c for c in cs if c["verdict"] is None]
        if missing:
            raise Refused("§6 completeness", f"{len(missing)} required checks (first or repeat) have no verdict")
        stage = pdir / f".lock-{secrets.token_hex(4)}"
        try:
            q = build_queue(study, phase, cs, stage / "adjudication")
            rows = lock_rows(cs)
            rec = {"at": now(), "rows": rows, "sha256": digest(rows), "submissions": subs,
                   "submissions_sha256": digest(subs),
                   "queue_sha256": sha256_file(stage / "adjudication" / "queue.json"),
                   "queue_md_sha256": sha256_file(stage / "adjudication" / "queue.md"),
                   "key_sha256": sha256_file(stage / "adjudication" / "key.json"), "queue": q}
            write_json(stage / "verdicts.lock.json", rec)
            adir = pdir / "adjudication"
            if adir.exists():  # left by a lock that died before its commit; nothing can have used it
                shutil.rmtree(adir)
            (stage / "adjudication").rename(adir)
            (stage / "verdicts.lock.json").rename(pdir / "verdicts.lock.json")  # the commit point
        finally:
            shutil.rmtree(stage, ignore_errors=True)
    return rec


def verify_lock(study: Study, phase: str) -> dict:
    """The lock still matches the call records, the queue and the key."""
    pdir = study.phase_dir(phase)
    lp = pdir / "verdicts.lock.json"
    if not lp.exists():
        raise Refused("§7 blinding", "verdicts are not locked")
    rec = read_json(lp)
    if digest(rec["rows"]) != rec["sha256"] or digest(lock_rows(checks(study, phase))) != rec["sha256"]:
        raise Refused("§7 blinding", "check results differ from the locked verdicts")
    if digest(rec["submissions"]) != rec["submissions_sha256"] or submissions(study, phase) != rec["submissions"]:
        raise Refused("§7 blinding", "a submission or its patch bytes changed after the lock")
    adir = pdir / "adjudication"
    for f, k in (("queue.json", "queue_sha256"), ("queue.md", "queue_md_sha256"), ("key.json", "key_sha256")):
        if not (adir / f).exists() or sha256_file(adir / f) != rec[k]:
            raise Refused("§7 blinding", f"adjudication/{f} differs from the one locked with the verdicts")
    q = read_json(adir / "queue.json")
    key = read_json(adir / "key.json")["key"]
    for it in q["items"]:  # what the adjudicator reads is the patch that was locked
        k = key[it["item"]]
        if it["patch_sha256"] != rec["submissions"][f"{k['task']}|{k['author']}"]["sha256"]:
            raise Refused("§7 blinding", f"queue item {it['item']} shows a patch other than the locked one")
    return rec


def judgments_digest(study: Study, phase: str) -> str:
    jp = study.phase_dir(phase) / "adjudication" / "judgments.json"
    return sha256_file(jp) if jp.exists() else digest(None)


def build_queue(study: Study, phase: str, cs: list[dict], adir) -> dict:
    """Discordant explicit rejections among first checks: one checker failed the patch, the other
    passed it or was inconclusive. Anonymized and shuffled with the frozen seed and a secret salt."""
    pdir = study.phase_dir(phase)
    seed = study.protocol()["frozen"]["config"]["selection"]["seed"]
    first = {(c["task"], c["author"], c["role"]): c for c in cs if c["rep"] == 0}
    items, key, fail_fail = [], {}, []
    salt = secrets.token_hex(16)  # item IDs must not be computable from the public seed
    m = load_manifest(study, phase)
    for (tid, a, role), c in sorted(first.items()):
        if role != "same":
            continue
        x = first[(tid, a, "cross")]
        if c["verdict"] == "fail" and x["verdict"] == "fail":
            fail_fail.append({"task": tid, "author": a})
            continue
        for rejecting, other in ((c, x), (x, c)):
            if rejecting["verdict"] == "fail" and other["verdict"] != "fail":
                iid = hashlib.sha256(f"{salt}:{tid}:{a}:{rejecting['role']}".encode()).hexdigest()[:10]
                patch = (pdir / "calls" / f"{tid}--{a}--author" / "patch.diff").read_bytes()
                items.append({"item": iid, "issue": m["rows"][tid]["problem_statement"],
                              "patch": patch.decode("utf-8", errors="replace"), "patch_sha256": sha256_bytes(patch),
                              "citations": rejecting["result"]["verdict"]["defects"]})
                key[iid] = {"task": tid, "author": a, "rejected_by": rejecting["role"],
                            "other_verdict": other["verdict"]}
    items.sort(key=lambda i: i["item"])
    random.Random(f"{seed}:adjudication:{salt}").shuffle(items)
    write_json(adir / "queue.json", {"rubric": RUBRIC, "items": items, "fail_fail_unaudited": len(fail_fail)})
    write_json(adir / "key.json", {"note": "do not open before adjudication is complete", "salt": salt, "key": key,
                                   "fail_fail": fail_fail})
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
    return {"items": len(items), "fail_fail_unaudited": len(fail_fail)}


def adjudicate(study: Study, phase: str, item: str | None, judgment: str | None, note: str | None,
               skip: str | None = None) -> dict:
    pdir = study.phase_dir(phase)
    adir = pdir / "adjudication"
    if (pdir / "evaluation.json").exists():
        raise Refused("§7 blinding", "evaluation.json exists; adjudication is closed")
    verify_lock(study, phase)
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
    """Hidden-test grading, once adjudication is complete or skipped. The judgments are frozen
    into evaluation.json by digest. Run again, it re-grades only items that ended in infra_error;
    a graded item is never graded twice."""
    pdir = study.phase_dir(phase)
    cfg = study.protocol()["frozen"]["config"]
    m = load_manifest(study, phase)
    authors = cfg["authors"]
    with Ledger(study).run_lock():
        lock_rec = verify_lock(study, phase)
        st = adjudication_done(study, phase)
        if not st["complete"]:
            raise Refused("§7 blinding", f"{st['pending']} adjudication items pending; finish or skip them first")
        evp = pdir / "evaluation.json"
        prev = read_json(evp) if evp.exists() else None
        if prev is not None:
            if prev.get("judgments_sha256") != judgments_digest(study, phase) or \
                    prev.get("lock_sha256") != lock_rec["sha256"]:
                raise Refused("§7 blinding", "judgments or the lock changed after evaluation")
            if not any(g["status"] == "infra_error" for r in prev["results"].values() for g in r.values()):
                raise Refused("§6", "evaluation.json is complete; each phase is evaluated once")
        items, subs = [], {}
        for tid in m["tasks"]:
            for a in authors:
                bdir = pdir / "calls" / f"{tid}--{a}--author"
                sub = read_json(bdir / "submission.json")
                subs[(tid, a)] = sub
                if prev is not None and prev["results"][tid][a]["status"] != "infra_error":
                    continue
                if sub["status"] == "ok":
                    patch = (bdir / "patch.diff").read_bytes()
                    if sha256_bytes(patch) != lock_rec["submissions"][f"{tid}|{a}"]["sha256"]:
                        raise Refused("§6 digest", f"{tid}/{a}: the grader would not receive the checked patch")
                    items.append((f"{tid}|{a}", tid, patch))
        root = workspace_root(cfg, study.dir)
        graded = grade(cfg, items, m["rows"], root, study.dir / "cache", pdir / "eval", denied_paths(study, root),
                       m["source"].get("file_sha256"))
        results = prev["results"] if prev else {}
        for (tid, a), sub in subs.items():
            if prev is not None and prev["results"][tid][a]["status"] != "infra_error":
                continue
            g = grade_submission(sub, graded.get(f"{tid}|{a}"))
            g["patch_sha256"] = sub.get("sha256")
            results.setdefault(tid, {})[a] = g
        rec = {"at": now(), "results": results, "snapshot": cfg["snapshot"], "evaluation": cfg["evaluation"],
               "images": graded.get("_images", []) or (prev or {}).get("images", []),
               "manifest_sha256": m["manifest_sha256"], "lock_sha256": lock_rec["sha256"],
               "judgments_sha256": judgments_digest(study, phase),
               "passes": (prev or {}).get("passes", 0) + 1}
        write_json(evp, rec)
    return rec
