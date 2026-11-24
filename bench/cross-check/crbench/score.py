"""Scoring: completeness first, then the paired 3x3 tables, directional and equal-author-weight
contrasts with bounds, McNemar, task-cluster bootstrap, leave-one-repo-out, Youden's J, stability,
workflow metrics and the substantiated discordant-rejection contrast (DESIGN.md §7).

Every number is kept at full precision in results.json; only the report rounds."""

from __future__ import annotations

from .adjudicate import adjudication_done, checks, verify_lock
from .common import Refused, Study, now, read_json, write_json
from .ledger import Ledger
from .manifest import load_manifest
from .stats import cluster_bootstrap, kappa, mcnemar_exact, wilson

V = ("pass", "fail", "inconclusive")
ARMS = {"A1": "hidden tests only (PASS_TO_PASS)", "A2": "A1 plus same-model checker",
        "A3": "A1 plus cross-vendor checker"}


def rate(k: int, n: int) -> dict:
    return {"k": k, "n": n, "rate": k / n if n else None, "ci95": wilson(k, n)}


# ------------------------------------------------------------------ completeness


def completeness(study: Study, phase: str) -> list[str]:
    pdir = study.phase_dir(phase)
    cfg = study.protocol()["frozen"]["config"]
    m = load_manifest(study, phase)
    probs = []
    run = pdir / "run.json"
    if not run.exists() or read_json(run)["status"] != "complete":
        probs.append("the run is not complete")
    try:
        verify_lock(study, phase)
        adj = adjudication_done(study, phase)
        if not adj["complete"]:
            probs.append(f"{adj['pending']} adjudication items pending")
    except Refused as e:
        probs.append(str(e))
    evp = pdir / "evaluation.json"
    ev = read_json(evp) if evp.exists() else None
    if ev is None:
        probs.append("no evaluation.json")
    elif ev.get("manifest_sha256") != m["manifest_sha256"]:
        probs.append("evaluation.json was made from another manifest")
    res = ev["results"] if ev else None
    for tid in m["tasks"]:
        for a in cfg["authors"]:
            sp = pdir / "calls" / f"{tid}--{a}--author" / "submission.json"
            if not sp.exists():
                probs.append(f"{tid}/{a}: no submission")
                continue
            sub = read_json(sp)
            if sub["status"] == "infra_error":
                probs.append(f"{tid}/{a}: author infra_error")
            if res is not None:
                g = res.get(tid, {}).get(a)
                if g is None or g["status"] == "infra_error":
                    probs.append(f"{tid}/{a}: grade missing or infra_error")
                elif g.get("patch_sha256") != sub.get("sha256"):
                    probs.append(f"{tid}/{a}: grader digest differs from the captured patch")
    if not (pdir / "stability.json").exists():
        probs.append("no stability sample")
    for c in checks(study, phase):
        if c["verdict"] is None:
            probs.append(f"{c['task']}/{c['author']}/{c['role']}/r{c['rep']}: required check missing")
            continue
        sp = read_json(pdir / "calls" / f"{c['task']}--{c['author']}--author" / "submission.json")
        if c["result"].get("patch_sha256") != sp["sha256"]:
            probs.append(f"{c['task']}/{c['author']}/{c['role']}: checker digest differs")
    return probs


# ------------------------------------------------------------------ pairs


def pairs(study: Study, phase: str) -> list[dict]:
    """One row per task and author: grade, statuses, both first verdicts and repeats."""
    pdir = study.phase_dir(phase)
    cfg = study.protocol()["frozen"]["config"]
    m = load_manifest(study, phase)
    ev = read_json(pdir / "evaluation.json")["results"]
    cs = {(c["task"], c["author"], c["role"], c["rep"]): c for c in checks(study, phase)}
    rows = []
    for tid in m["tasks"]:
        for a in cfg["authors"]:
            g = ev[tid][a]
            r = {"task": tid, "repo": m["rows"][tid]["repo"], "author": a, "status": g["status"],
                 "a1_pass": g.get("a1_pass"), "resolved": g.get("resolved")}
            for role in ("same", "cross"):
                for rep in (0, 1):
                    c = cs.get((tid, a, role, rep))
                    ran = c is not None and c["result"] is not None
                    r[f"{role}{rep}"] = c["verdict"] if c else None
                    r[f"{role}{rep}_usage"] = (c["result"].get("usage") or {"known": False}) if ran else None
            r["eligible"] = g["status"] == "graded" and bool(g.get("a1_pass")) and r["same0"] is not None
            r["grade"] = ("good" if g.get("resolved") else "bad") if r["eligible"] else None
            rows.append(r)
    return rows


def blocks(v) -> bool:
    return v in ("fail", "inconclusive")


def contrast(rows: list[dict]) -> dict | None:
    """Cross minus same explicit-rejection rate on one author's pairs of one grade, with bounds."""
    n = len(rows)
    if n == 0:
        return None
    sf = sum(r["same0"] == "fail" for r in rows)
    xf = sum(r["cross0"] == "fail" for r in rows)
    si = sum(r["same0"] == "inconclusive" for r in rows)
    xi = sum(r["cross0"] == "inconclusive" for r in rows)
    cc = [r for r in rows if "inconclusive" not in (r["same0"], r["cross0"])]
    b = sum(r["cross0"] == "fail" and r["same0"] != "fail" for r in rows)
    c = sum(r["same0"] == "fail" and r["cross0"] != "fail" for r in rows)
    return {
        "n": n, "same_fail": rate(sf, n), "cross_fail": rate(xf, n),
        "same_blocked": rate(sum(blocks(r["same0"]) for r in rows), n),
        "cross_blocked": rate(sum(blocks(r["cross0"]) for r in rows), n),
        "diff": (xf - sf) / n,
        "bounds": [(xf - sf - si) / n, (xf + xi - sf) / n],
        "complete_case": {"n": len(cc), "diff": (sum(r["cross0"] == "fail" for r in cc)
                                                 - sum(r["same0"] == "fail" for r in cc)) / len(cc) if cc else None},
        "fail_closed": {"diff": (sum(blocks(r["cross0"]) for r in rows) - sum(blocks(r["same0"]) for r in rows)) / n},
        "discordant": {"cross_only": b, "same_only": c}, "mcnemar_p": mcnemar_exact(b, c),
        "inconclusive": {"same": si, "cross": xi},
    }


def table(rows: list[dict]) -> dict:
    return {s: {x: sum(r["same0"] == s and r["cross0"] == x for r in rows) for x in V} for s in V}


STATS = {
    "diff": lambda c: c["diff"],
    "bound_lo": lambda c: c["bounds"][0],
    "bound_hi": lambda c: c["bounds"][1],
    "complete_case": lambda c: c["complete_case"]["diff"],
    "fail_closed": lambda c: c["fail_closed"]["diff"],
}


def equal_weight(rows: list[dict], authors: list[str], grade: str, stat: str = "diff"):
    """The mean over authors of each author's contrast; None if any author has no pairs."""
    ds = []
    for a in authors:
        c = contrast([r for r in rows if r["author"] == a and r["grade"] == grade])
        v = STATS[stat](c) if c is not None else None
        if v is None:
            return None
        ds.append(v)
    return sum(ds) / len(ds)


def pooled(rows: list[dict], grade: str):
    c = contrast([r for r in rows if r["grade"] == grade])
    return c["diff"] if c else None


# ------------------------------------------------------------------ the score


def score(study: Study, phase: str) -> dict:
    pdir = study.phase_dir(phase)
    proto = study.protocol()
    cfg = proto["frozen"]["config"]
    authors = cfg["authors"]
    probs = completeness(study, phase)
    if probs:
        write_json(pdir / "results.json", {"status": "incomplete", "at": now(), "problems": probs})
        raise Refused("§10 completeness", f"{len(probs)} problems, first: {probs[0]}; see results.json")
    rows = pairs(study, phase)
    el = [r for r in rows if r["eligible"]]
    seed = cfg["selection"]["seed"]
    B = cfg.get("stats", {}).get("bootstrap_B", 2000)
    sizing = read_json(study.dir / "sizing.json") if (study.dir / "sizing.json").exists() else None
    designation = ("calibration (never published as findings)" if phase == "calibration"
                   else (sizing or {}).get("designation", "feasibility pilot"))
    ev = read_json(pdir / "evaluation.json")
    pf = pdir / "preflight.json"
    res = {"status": "complete", "phase": phase, "at": now(), "designation": designation,
           "study_sha256": proto["frozen_sha256"], "harness_sha256": proto["frozen"].get("harness_sha256"),
           "manifest_sha256": load_manifest(study, phase)["manifest_sha256"], "authors": authors,
           "agents": {a: {k: proto["frozen"]["agents"][a].get(k) for k in ("kind", "vendor", "model", "effort")}
                      for a in authors},
           "models_resolved": read_json(study.dir / "models.json") if (study.dir / "models.json").exists() else {},
           "environment": {"cli": read_json(pf)["identities"] if pf.exists() else {},
                           "host": read_json(pf)["host"] if pf.exists() else {},
                           "grader_images": ev.get("images", []), "snapshot": ev.get("snapshot")},
           "margins": cfg["margins"], "cohort": cfg["cohort"],
           "counts": {"pairs": len(rows), "eligible": len(el),
                      "ineligible": {s: n for s in sorted({r["status"] for r in rows})
                                     if (n := sum(r["status"] == s and not r["eligible"] for r in rows))},
                      "a1_failed": sum(r["status"] == "graded" and not r["a1_pass"] for r in rows)}}

    # paired tables and contrasts, per author and grade
    res["directional"] = {}
    tasks = sorted({r["task"] for r in rows})
    for a in authors:
        res["directional"][a] = {}
        for g in ("bad", "good"):
            mine = [r for r in el if r["author"] == a and r["grade"] == g]
            c = contrast(mine) or {"n": 0}
            if mine:
                bt = {t: [r for r in mine if r["task"] == t] for t in tasks}
                c["boot"] = cluster_bootstrap([bt[t] for t in tasks], lambda s: (contrast([r for x in s for r in x])
                                              or {"diff": None})["diff"], B, f"{seed}:{a}:{g}")
            res["directional"][a][g] = {"table_same_by_cross": table(mine), **c}
    by_task = {t: [r for r in el if r["task"] == t] for t in tasks}
    clusters = [by_task[t] for t in tasks]
    ew = {}
    for g in ("bad", "good"):
        e = {"point": equal_weight(el, authors, g),
             "bounds": [equal_weight(el, authors, g, "bound_lo"), equal_weight(el, authors, g, "bound_hi")],
             "complete_case": equal_weight(el, authors, g, "complete_case"),
             "fail_closed": equal_weight(el, authors, g, "fail_closed"),
             **cluster_bootstrap(clusters, lambda s, g=g: equal_weight([r for c in s for r in c], authors, g), B, f"{seed}:{g}")}
        pb = cluster_bootstrap(clusters, lambda s, g=g: pooled([r for c in s for r in c], g), B, f"{seed}:{g}:pooled")
        e["pooled"] = {"point": pooled(el, g), "ci95": pb["ci95"], "dropped": pb["dropped"]}
        ew[g] = e
    res["equal_author_weight"] = ew
    lo_bad = (ew["bad"]["ci95"] or [None])[0]
    hi_good = (ew["good"]["ci95"] or [None, None])[1]
    met = lo_bad is not None and hi_good is not None and lo_bad > 0 and hi_good < cfg["margins"]["delta_fr"]
    res["decision_rule"] = {"bad_ci_low_above_zero": lo_bad is not None and lo_bad > 0,
                            "good_ci_high_below_delta_fr": hi_good is not None and hi_good < cfg["margins"]["delta_fr"],
                            "both": met, "applies": designation == "publication run"}
    repos = sorted({r["repo"] for r in rows})
    res["leave_one_repo_out"] = {rp: {g: equal_weight([r for r in el if r["repo"] != rp], authors, g)
                                      for g in ("bad", "good")} for rp in repos} if len(repos) > 1 else {}

    # Youden's J with both components
    res["youden"] = {}
    for a in authors:
        for role in ("same", "cross"):
            bad = [r for r in el if r["author"] == a and r["grade"] == "bad"]
            good = [r for r in el if r["author"] == a and r["grade"] == "good"]
            tpr = rate(sum(r[f"{role}0"] == "fail" for r in bad), len(bad))
            fpr = rate(sum(r[f"{role}0"] == "fail" for r in good), len(good))
            j = tpr["rate"] - fpr["rate"] if tpr["rate"] is not None and fpr["rate"] is not None else None
            res["youden"][f"{a}/{role}"] = {"tpr": tpr, "fpr": fpr, "j": j}

    # inconclusives by checker vendor and role
    vend = {a: proto["frozen"]["agents"][a]["vendor"] for a in authors}
    other = {a: next(b for b in authors if b != a) for a in authors}
    inc = {}
    for r in rows:
        for role in ("same", "cross"):
            if r[f"{role}0"] is None:
                continue
            v = vend[r["author"] if role == "same" else other[r["author"]]]
            b = inc.setdefault(f"{v}/{role}", {"inconclusive": 0, "checks": 0})
            b["checks"] += 1
            b["inconclusive"] += r[f"{role}0"] == "inconclusive"
    res["inconclusive"] = inc

    # verdict stability: first against repeat, by checker vendor
    stab = {}
    for r in rows:
        for role in ("same", "cross"):
            if r[f"{role}1"] is None or r[f"{role}0"] is None:
                continue
            v = vend[r["author"] if role == "same" else other[r["author"]]]
            stab.setdefault(v, []).append((r[f"{role}0"], r[f"{role}1"]))
    res["stability"] = {v: {"n": len(p), "flips": rate(sum(a != b for a, b in p), len(p)), "kappa": kappa(p)}
                        for v, p in stab.items()}

    # workflow metrics: reference-test outcomes, not correctness or defect counts
    wf = {}
    for a in authors:
        mine = [r for r in rows if r["author"] == a]
        n = len(mine)
        st = {}
        for r in mine:
            st[r["status"]] = st.get(r["status"], 0) + 1
        a1 = [r for r in mine if r["status"] == "graded" and r["a1_pass"]]
        acc = {"A1": a1, "A2": [r for r in a1 if r["same0"] == "pass"], "A3": [r for r in a1 if r["cross0"] == "pass"]}
        wf[a] = {"attempted": n, "statuses": st,
                 **{w: {"name": ARMS[w], "accepted": len(x), "blocked": rate(n - len(x), n),
                        "good_delivered_per_task": rate(sum(bool(r["resolved"]) for r in x), n),
                        "escapes_per_attempt": rate(sum(not r["resolved"] for r in x), n),
                        "bad_among_accepted": rate(sum(not r["resolved"] for r in x), len(x))}
                    for w, x in acc.items()},
                 "checker_tokens": {role: _tokens([r[f"{role}{rep}_usage"] for r in mine for rep in (0, 1)
                                                   if r[f"{role}{rep}_usage"] is not None]) for role in ("same", "cross")}}
    res["workflow"] = wf
    res["adjudication"] = adjudication_summary(study, phase, rows)
    lg = Ledger(study).summary()
    res["ledger"] = lg
    res["spend"] = spend(cfg, lg)
    write_json(pdir / "results.json", res)
    (pdir / "report.md").write_text(report(res, cfg))
    return res


def _tokens(us: list[dict]) -> dict:
    known = [u for u in us if u.get("known")]
    return {"checks": len(us), "known_total": sum(u["total"] for u in known), "unknown_calls": len(us) - len(known)}


def spend(cfg: dict, lg: dict) -> dict:
    """Every launch in the ledger (retries, probes, repeats), by vendor and token class. Partial
    whenever any call's usage is unknown."""
    by_vendor = {}
    for k, b in lg["by"].items():
        vendor = k.split("/")[1]
        v = by_vendor.setdefault(vendor, {"calls": 0, "unknown_usage": 0, "input": 0, "cached_input": 0, "output": 0,
                                          "known_total": 0})
        v["calls"] += b["launched"]
        v["unknown_usage"] += b["unknown_usage"]
        v["known_total"] += b["known_tokens"]
        for t in ("input", "cached_input", "output"):
            v[t] += b["tokens"][t]
    prices = cfg.get("prices") or {}
    api = None
    if prices:
        api = 0.0
        for vendor, v in by_vendor.items():
            p = prices.get(vendor)
            if p:
                api += v["known_total"] / 1e6 * p["blended_per_mtok"]
    return {"actual_usd": 0, "basis": "existing subscriptions only, billing route verified in preflight",
            "by_vendor": by_vendor, "api_equivalent_usd": api, "partial": lg["calls_with_unknown_usage"] > 0,
            "calls_with_unknown_usage": lg["calls_with_unknown_usage"]}


def adjudication_summary(study: Study, phase: str, rows: list[dict]) -> dict:
    adir = study.phase_dir(phase) / "adjudication"
    if not (adir / "queue.json").exists():
        return {"status": "no queue"}
    q = read_json(adir / "queue.json")
    kj = read_json(adir / "key.json")
    key = kj["key"]
    grade = {(r["task"], r["author"]): (r["grade"] or "ineligible") for r in rows}
    ff = {}
    for x in kj.get("fail_fail", []):
        g = grade.get((x["task"], x["author"]), "ineligible")
        ff[g] = ff.get(g, 0) + 1
    jp = adir / "judgments.json"
    j = read_json(jp) if jp.exists() else {"judgments": {}, "skipped": None}
    if j["skipped"]:
        return {"status": "skipped", "reason": j["skipped"]["reason"], "items": len(q["items"]),
                "fail_fail_unaudited_by_grade": ff}
    counts, table_rows = {}, []
    for it in q["items"]:
        k = key[it["item"]]
        jj = j["judgments"][it["item"]]
        g = grade.get((k["task"], k["author"]), "ineligible")
        c = counts.setdefault(f"{k['rejected_by']}-only/{g}", {x: 0 for x in JUDG})
        c[jj["judgment"]] += 1
        table_rows.append({"issue": k["task"], "patch_sha256": it["patch_sha256"], "item": it["item"],
                           "citations": it["citations"], "verdict": "fail", "rejected_by": k["rejected_by"],
                           "other_verdict": k["other_verdict"], "hidden_grade": g, "judgment": jj["judgment"],
                           "justification": jj["note"]})
    supported_in_good = {role: counts.get(f"{role}-only/good", {}).get("supported", 0) for role in ("same", "cross")}
    return {"status": "complete", "name": "substantiated discordant-rejection contrast", "counts": counts,
            "supported_in_good": supported_in_good, "fail_fail_unaudited_by_grade": ff, "table": table_rows,
            "disclosure": "one adjudicator, the owner, who saw the hidden test definitions during the audit but "
                          "not each patch's hidden-test result; no independent second judgment"}


JUDG = ("supported", "unsupported", "indeterminate")


# ------------------------------------------------------------------ report


def pp(x) -> str:
    return "not estimable" if x is None else f"{x * 100:+.1f} pp"


def ci(c) -> str:
    return "not estimable" if not c else f"{pp(c[0])} to {pp(c[1])}"


def fr(r: dict) -> str:
    if not r or r.get("n", 0) == 0:
        return "not estimable (0 of 0)"
    lo, hi = r["ci95"]
    return f"{r['k']} of {r['n']} ({r['rate'] * 100:.0f}%, 95% CI {lo * 100:.0f} to {hi * 100:.0f}%)"


def num(x, d=3) -> str:
    return "not estimable" if x is None else f"{x:.{d}f}"


def report(res: dict, cfg: dict) -> str:
    L = [f"# Cross-vendor checking benchmark: {cfg['name']}, {res['phase']}", "",
         f"Designation: **{res['designation']}**. Scored {res['at']}. Study digest `{res['study_sha256'][:12]}`, "
         f"harness `{(res.get('harness_sha256') or '')[:12]}`, manifest `{res['manifest_sha256'][:12]}`.", "",
         "The benchmark calls the Claude Code and Codex CLIs directly, not through Control Rod's daemon.",
         "\"Rejection\" means an explicit fail verdict, not a confirmed defect. Hidden tests measure whether",
         "tests pass, not whether a maintainer would merge.", ""]
    if res["designation"] != "publication run":
        L += ["This run makes **no effectiveness claim**.", ""]
    cn = res["counts"]
    L += [f"Pairs (task x author): {cn['pairs']}; eligible: {cn['eligible']}; failed A1: {cn['a1_failed']}; "
          f"ineligible by status: {cn['ineligible']}.", ""]
    L += ["## Equal-author-weight contrast (cross-vendor minus same-model explicit rejection)", "",
          "| Patches | Point | 95% CI (task bootstrap) | Inconclusive bounds | Complete-case | Fail-closed | Pooled (95% CI) |",
          "|---|---|---|---|---|---|---|"]
    for g, label in (("bad", "Hidden-test-failing"), ("good", "Hidden-test-passing (false rejection)")):
        e = res["equal_author_weight"][g]
        L.append(f"| {label} | {pp(e['point'])} | {ci(e['ci95'])} | {pp(e['bounds'][0])} to {pp(e['bounds'][1])} | "
                 f"{pp(e['complete_case'])} | {pp(e['fail_closed'])} | {pp(e['pooled']['point'])} ({ci(e['pooled']['ci95'])}) |")
    d = res["decision_rule"]
    L += ["", f"Preregistered rule (bad-patch CI above 0 and good-patch CI below +{cfg['margins']['delta_fr'] * 100:.0f} pp): "
          f"{'met' if d['both'] else 'not met'}{'' if d['applies'] else ' (shown only; it applies to a publication run)'}.",
          "\"Not significant\" is not equivalence.", "", "## By author", ""]
    for a, gs in res["directional"].items():
        for g, c in gs.items():
            L.append(f"### Author {a}, {g} patches (n = {c['n']})")
            L.append("")
            if c["n"] == 0:
                L += ["Not estimable.", ""]
                continue
            L += [f"- Same-model rejected {fr(c['same_fail'])}; cross-vendor rejected {fr(c['cross_fail'])}.",
                  f"- Blocked (fail or inconclusive): same {fr(c['same_blocked'])}; cross {fr(c['cross_blocked'])}.",
                  f"- Difference {pp(c['diff'])} (95% CI {ci((c.get('boot') or {}).get('ci95'))}), bounds "
                  f"{pp(c['bounds'][0])} to {pp(c['bounds'][1])}; complete-case {pp(c['complete_case']['diff'])} "
                  f"(n = {c['complete_case']['n']}); fail-closed {pp(c['fail_closed']['diff'])}.",
                  f"- Discordant: cross only {c['discordant']['cross_only']}, same only {c['discordant']['same_only']}; "
                  f"exact McNemar p = {num(c['mcnemar_p'])}.", "",
                  "| same \\ cross | pass | fail | inconclusive |", "|---|---|---|---|"]
            for s, row in c["table_same_by_cross"].items():
                L.append(f"| {s} | {row['pass']} | {row['fail']} | {row['inconclusive']} |")
            L.append("")
    L += ["## Checker rates (Youden's J = TPR - FPR)", "", "| Author / checker | TPR (bad rejected) | FPR (good rejected) | J |",
          "|---|---|---|---|"]
    for k, y in res["youden"].items():
        L.append(f"| {k} | {fr(y['tpr'])} | {fr(y['fpr'])} | {num(y['j'])} |")
    L += ["", "## Inconclusive verdicts", ""]
    for k, v in res["inconclusive"].items():
        L.append(f"- {k}: {v['inconclusive']} of {v['checks']}")
    L += ["", "## Verdict stability (first check against a repeat)", ""]
    for v, s in res["stability"].items():
        L.append(f"- {v}: flips {fr(s['flips'])}; Cohen's kappa {num(s['kappa'])}")
    if res["leave_one_repo_out"]:
        L += ["", "## Leave one repository out (equal-weight point estimates)", ""]
        for rp, v in res["leave_one_repo_out"].items():
            L.append(f"- without {rp}: bad {pp(v['bad'])}, good {pp(v['good'])}")
    L += ["", "## Workflow outcomes (reference tests, not established correctness)", ""]
    for a, w in res["workflow"].items():
        L.append(f"- Author {a}: {w['attempted']} tasks; statuses {w['statuses']}.")
        for arm in ("A1", "A2", "A3"):
            x = w[arm]
            L.append(f"  - {arm}, {x['name']}: accepted {x['accepted']}, blocked {fr(x['blocked'])}, good delivered "
                     f"{fr(x['good_delivered_per_task'])}, escapes {fr(x['escapes_per_attempt'])}, bad among accepted "
                     f"{fr(x['bad_among_accepted'])}")
        for role, t in w["checker_tokens"].items():
            unk = f", {t['unknown_calls']} with unknown usage" if t["unknown_calls"] else ""
            L.append(f"  - {role}-checker tokens: {t['known_total']} known over {t['checks']} checks{unk}")
    L += ["", "A4 (human sign-off) is omitted from this run; it reports no human comparison and no human time saved.", ""]
    adj = res["adjudication"]
    L += ["## Substantiated discordant-rejection contrast", ""]
    if adj.get("status") == "complete":
        for k, c in adj["counts"].items():
            L.append(f"- {k}: supported {c['supported']}, unsupported {c['unsupported']}, indeterminate {c['indeterminate']}")
        s = adj["supported_in_good"]
        L += [f"- Supported rejections of hidden-test-passing patches (the tests missed it, or the rubric was generous): "
              f"same-only {s['same']}, cross-only {s['cross']}.",
              f"- Fail-fail pairs, not audited, by grade: {adj['fail_fail_unaudited_by_grade'] or 'none'}", "",
              "| Item | Task | Patch | Rejected by | Other verdict | Hidden grade | Judgment | Justification |",
              "|---|---|---|---|---|---|---|---|"]
        for t in adj["table"]:
            L.append(f"| {t['item']} | {t['issue']} | `{t['patch_sha256'][:12]}` | {t['rejected_by']} | {t['other_verdict']} | "
                     f"{t['hidden_grade']} | {t['judgment']} | {t['justification'].replace('|', '/')} |")
        L += ["", f"Disclosure: {adj['disclosure']}.", ""]
    else:
        L += [f"Not available ({adj.get('status')}{': ' + adj['reason'] if adj.get('reason') else ''}). Without "
              "adjudication this report does not use the words \"defects caught\".", ""]
    sp = res["spend"]
    L += ["## Spend", "", f"Actual: ${sp['actual_usd']} ({sp['basis']}). Every launch counts, including retries, probes "
          "and repeats." + (" **Token totals are partial**: some calls reported no usage." if sp["partial"] else ""), "",
          "| Vendor | Calls | Unknown usage | Input | Cached input | Output |", "|---|---|---|---|---|---|"]
    for v, b in sp["by_vendor"].items():
        L.append(f"| {v} | {b['calls']} | {b['unknown_usage']} | {b['input']} | {b['cached_input']} | {b['output']} |")
    api = "not computed" if sp["api_equivalent_usd"] is None else f"${sp['api_equivalent_usd']:.2f}"
    L += ["", f"API-equivalent for disclosure only: {api}.", ""]
    L += ["## Environment", ""]
    for a, mr in res["models_resolved"].items():
        unv = f"; {mr['unverified_calls']} calls did not report their model" if mr.get("unverified_calls") else ""
        L.append(f"- {a}: requested {mr.get('requested')}, resolved {mr.get('resolved') or 'not reported'}{unv}")
    for a, c in res["environment"]["cli"].items():
        L.append(f"- {a} CLI: {c.get('version')} (`{(c.get('sha256') or '')[:12]}`)")
    h = res["environment"]["host"]
    if h:
        L.append(f"- Host: {h.get('system')} {h.get('arch')}, Python {h.get('python')}, confinement {h.get('confinement')}")
    for im in res["environment"]["grader_images"]:
        L.append(f"- Grader image {im.get('Repository')}:{im.get('Tag')} {im.get('Digest')}")
    L.append("")
    if cfg["cohort"].get("historical"):
        L += ["## Contamination", "", "This cohort is historical: its issues may predate the models' training cutoffs.", ""]
    return "\n".join(L)
