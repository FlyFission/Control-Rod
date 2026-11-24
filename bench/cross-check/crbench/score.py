"""Scoring: completeness first, then the paired 3x3 tables, directional and equal-author-weight
contrasts with bounds, McNemar, task-cluster bootstrap, leave-one-repo-out, Youden's J, stability,
workflow metrics and the substantiated discordant-rejection contrast (DESIGN.md §7)."""

from __future__ import annotations

from .adjudicate import checks
from .common import Refused, Study, now, read_json, write_json
from .ledger import Ledger
from .manifest import load_manifest
from .stats import cluster_bootstrap, kappa, mcnemar_exact, wilson

V = ("pass", "fail", "inconclusive")


def rate(k: int, n: int) -> dict:
    return {"k": k, "n": n, "rate": round(k / n, 4) if n else None, "ci95": wilson(k, n)}


# ------------------------------------------------------------------ completeness


def completeness(study: Study, phase: str) -> list[str]:
    pdir = study.phase_dir(phase)
    cfg = study.protocol()["frozen"]["config"]
    m = load_manifest(study, phase)
    probs = []
    run = pdir / "run.json"
    if not run.exists() or read_json(run)["status"] != "complete":
        probs.append("the run is not complete")
    if not (pdir / "verdicts.lock.json").exists():
        probs.append("verdicts are not locked")
    ev = read_json(pdir / "evaluation.json")["results"] if (pdir / "evaluation.json").exists() else None
    if ev is None:
        probs.append("no evaluation.json")
    for tid in m["tasks"]:
        for a in cfg["authors"]:
            sp = pdir / "calls" / f"{tid}--{a}--author" / "submission.json"
            if not sp.exists():
                probs.append(f"{tid}/{a}: no submission")
                continue
            sub = read_json(sp)
            if sub["status"] == "infra_error":
                probs.append(f"{tid}/{a}: author infra_error")
            if ev is not None:
                g = ev.get(tid, {}).get(a)
                if g is None or g["status"] == "infra_error":
                    probs.append(f"{tid}/{a}: grade missing or infra_error")
                elif g.get("patch_sha256") != sub.get("sha256"):
                    probs.append(f"{tid}/{a}: grader digest differs from the captured patch")
    lock = read_json(pdir / "verdicts.lock.json") if (pdir / "verdicts.lock.json").exists() else None
    for c in checks(study, phase):
        if c["rep"] == 0 and c["verdict"] is None:
            probs.append(f"{c['task']}/{c['author']}/{c['role']}: first check missing")
        if c["result"] and lock:
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
                    r[f"{role}{rep}"] = c["verdict"] if c else None
                    r[f"{role}{rep}_tokens"] = (c["result"] or {}).get("usage", {}) if c else {}
            r["eligible"] = g["status"] == "graded" and bool(g.get("a1_pass")) and r["same0"] is not None
            r["grade"] = ("good" if g.get("resolved") else "bad") if r["eligible"] else None
            rows.append(r)
    return rows


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
    blocks = lambda v: v in ("fail", "inconclusive")  # noqa: E731
    b = sum(r["cross0"] == "fail" and r["same0"] != "fail" for r in rows)
    c = sum(r["same0"] == "fail" and r["cross0"] != "fail" for r in rows)
    return {
        "n": n, "same_fail": rate(sf, n), "cross_fail": rate(xf, n),
        "diff": round((xf - sf) / n, 4),
        "bounds": [round((xf - sf - si) / n, 4), round((xf + xi - sf) / n, 4)],
        "complete_case": {"n": len(cc), "diff": round((sum(r["cross0"] == "fail" for r in cc)
                                                       - sum(r["same0"] == "fail" for r in cc)) / len(cc), 4)
                          if cc else None},
        "fail_closed": {"diff": round((sum(blocks(r["cross0"]) for r in rows)
                                       - sum(blocks(r["same0"]) for r in rows)) / n, 4)},
        "discordant": {"cross_only": b, "same_only": c}, "mcnemar_p": mcnemar_exact(b, c),
        "inconclusive": {"same": si, "cross": xi},
    }


def table(rows: list[dict]) -> dict:
    return {s: {x: sum(r["same0"] == s and r["cross0"] == x for r in rows) for x in V} for s in V}


def equal_weight(rows: list[dict], authors: list[str], grade: str, key: str = "diff"):
    ds = []
    for a in authors:
        c = contrast([r for r in rows if r["author"] == a and r["grade"] == grade])
        if c is None:
            return None
        ds.append(c[key] if key == "diff" else c["bounds"][key])
    return round(sum(ds) / len(ds), 4)


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
    res = {"status": "complete", "phase": phase, "at": now(), "designation": designation,
           "study_sha256": proto["frozen_sha256"], "authors": authors,
           "agents": {a: {k: proto["frozen"]["agents"][a].get(k) for k in ("kind", "vendor", "model", "effort")}
                      for a in authors},
           "models_resolved": read_json(study.dir / "models.json") if (study.dir / "models.json").exists() else {},
           "margins": cfg["margins"], "cohort": cfg["cohort"]}

    # paired tables and contrasts, per author and grade
    res["directional"] = {a: {g: {"table_same_by_cross": table([r for r in el if r["author"] == a and r["grade"] == g]),
                                  **(contrast([r for r in el if r["author"] == a and r["grade"] == g]) or {"n": 0})}
                              for g in ("bad", "good")} for a in authors}
    tasks = sorted({r["task"] for r in rows})
    by_task = {t: [r for r in el if r["task"] == t] for t in tasks}
    ew = {}
    for g in ("bad", "good"):
        point = equal_weight(el, authors, g)
        boot = cluster_bootstrap([by_task[t] for t in tasks],
                                 lambda s, g=g: equal_weight([r for c in s for r in c], authors, g), B, f"{seed}:{g}")
        pooled = contrast([r for r in el if r["grade"] == g])
        ew[g] = {"point": point, "bounds": [equal_weight(el, authors, g, 0), equal_weight(el, authors, g, 1)],
                 **boot, "pooled_diff": pooled["diff"] if pooled else None}
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
            tpr, fpr = rate(sum(r[f"{role}0"] == "fail" for r in bad), len(bad)), \
                rate(sum(r[f"{role}0"] == "fail" for r in good), len(good))
            j = round(tpr["rate"] - fpr["rate"], 4) if tpr["rate"] is not None and fpr["rate"] is not None else None
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
    res["stability"] = {v: {"n": len(p), "flips": sum(a != b for a, b in p), "kappa": kappa(p)} for v, p in stab.items()}

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
                 **{w: {"accepted": len(x), "blocked": n - len(x),
                        "good_delivered_per_task": rate(sum(bool(r["resolved"]) for r in x), n),
                        "escapes_per_attempt": rate(sum(not r["resolved"] for r in x), n),
                        "bad_among_accepted": rate(sum(not r["resolved"] for r in x), len(x))}
                    for w, x in acc.items()},
                 "checker_tokens": {role: _tokens([r[f"{role}0_tokens"] for r in mine]) for role in ("same", "cross")}}
    res["workflow"] = wf
    res["adjudication"] = adjudication_summary(study, phase, el)
    lg = Ledger(study).summary()
    res["ledger"] = lg
    res["spend"] = {"actual_usd": 0, "basis": "existing subscriptions only, billing route verified in preflight",
                    "api_equivalent_usd": api_equivalent(cfg, lg), "calls_with_unknown_usage": lg["calls_with_unknown_usage"]}
    write_json(pdir / "results.json", res)
    (pdir / "report.md").write_text(report(res, cfg))
    return res


def _tokens(us: list[dict]) -> dict:
    known = [u for u in us if u.get("known")]
    return {"known_total": sum(u["total"] for u in known), "unknown_calls": len(us) - len(known)}


def api_equivalent(cfg: dict, lg: dict):
    """Disclosure only: what the known tokens would cost at the frozen price table."""
    prices = cfg.get("prices")
    if not prices:
        return None
    total = 0.0
    for k, b in lg["by"].items():
        vendor = k.split("/")[1]
        p = prices.get(vendor)
        if p:
            total += b["known_tokens"] / 1e6 * p["blended_per_mtok"]
    return round(total, 2)


def adjudication_summary(study: Study, phase: str, el: list[dict]) -> dict:
    adir = study.phase_dir(phase) / "adjudication"
    if not (adir / "queue.json").exists():
        return {"status": "no queue"}
    q = read_json(adir / "queue.json")
    key = read_json(adir / "key.json")["key"]
    jp = adir / "judgments.json"
    j = read_json(jp) if jp.exists() else {"judgments": {}, "skipped": None}
    if j["skipped"]:
        return {"status": "skipped", "reason": j["skipped"]["reason"], "items": len(q["items"])}
    grade = {(r["task"], r["author"]): r["grade"] for r in el}
    counts, table_rows = {}, []
    for it in q["items"]:
        k = key[it["item"]]
        jj = j["judgments"][it["item"]]
        g = grade.get((k["task"], k["author"]), "ineligible")
        c = counts.setdefault(f"{k['rejected_by']}-only/{g}", {x: 0 for x in ("supported", "unsupported", "indeterminate")})
        c[jj["judgment"]] += 1
        table_rows.append({"issue": k["task"], "patch_sha256": it["patch_sha256"], "item": it["item"],
                           "citations": it["citations"], "verdict": "fail", "rejected_by": k["rejected_by"],
                           "hidden_grade": g, "judgment": jj["judgment"], "justification": jj["note"]})
    return {"status": "complete", "name": "substantiated discordant-rejection contrast", "counts": counts,
            "fail_fail_unaudited": q["fail_fail_unaudited"], "table": table_rows,
            "disclosure": "one adjudicator, the owner, who saw the hidden test definitions during the audit but "
                          "not each patch's hidden-test result; no independent second judgment"}


# ------------------------------------------------------------------ report


def pct(x) -> str:
    return "not estimable" if x is None else f"{x * 100:+.1f} pp"


def fr(r: dict) -> str:
    if not r or r.get("n", 0) == 0:
        return "not estimable (0 of 0)"
    lo, hi = r["ci95"]
    return f"{r['k']} of {r['n']} ({r['rate'] * 100:.0f}%, 95% CI {lo * 100:.0f} to {hi * 100:.0f}%)"


def report(res: dict, cfg: dict) -> str:
    L = [f"# Cross-vendor checking benchmark: {cfg['name']}, {res['phase']}", "",
         f"Designation: **{res['designation']}**. Scored {res['at']}. Study digest `{res['study_sha256'][:12]}`.", "",
         "The benchmark calls the Claude Code and Codex CLIs directly, not through Control Rod's daemon.",
         "\"Rejection\" means an explicit fail verdict, not a confirmed defect. Hidden tests measure whether",
         "tests pass, not whether a maintainer would merge.", ""]
    if res["designation"] != "publication run":
        L += ["This run makes **no effectiveness claim**.", ""]
    L += ["## Equal-author-weight contrast (cross-vendor minus same-model explicit rejection)", "",
          "| Patches | Point | 95% CI (task bootstrap) | Inconclusive bounds | Pooled |", "|---|---|---|---|---|"]
    for g, label in (("bad", "Hidden-test-failing"), ("good", "Hidden-test-passing (false rejection)")):
        e = res["equal_author_weight"][g]
        ci = e["ci95"]
        L.append(f"| {label} | {pct(e['point'])} | {'not estimable' if not ci else f'{pct(ci[0])} to {pct(ci[1])}'} | "
                 f"{pct(e['bounds'][0])} to {pct(e['bounds'][1])} | {pct(e['pooled_diff'])} |")
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
                  f"- Difference {pct(c['diff'])}, bounds {pct(c['bounds'][0])} to {pct(c['bounds'][1])}; "
                  f"complete-case {pct(c['complete_case']['diff'])} (n = {c['complete_case']['n']}); "
                  f"fail-closed {pct(c['fail_closed']['diff'])}.",
                  f"- Discordant: cross only {c['discordant']['cross_only']}, same only {c['discordant']['same_only']}; "
                  f"exact McNemar p = {c['mcnemar_p'] if c['mcnemar_p'] is not None else 'not estimable'}.", "",
                  "| same \\ cross | pass | fail | inconclusive |", "|---|---|---|---|"]
            for s, row in c["table_same_by_cross"].items():
                L.append(f"| {s} | {row['pass']} | {row['fail']} | {row['inconclusive']} |")
            L.append("")
    L += ["## Checker rates (Youden's J = TPR - FPR)", "", "| Author / checker | TPR (bad rejected) | FPR (good rejected) | J |",
          "|---|---|---|---|"]
    for k, y in res["youden"].items():
        L.append(f"| {k} | {fr(y['tpr'])} | {fr(y['fpr'])} | {'not estimable' if y['j'] is None else y['j']} |")
    L += ["", "## Inconclusive verdicts", ""]
    for k, v in res["inconclusive"].items():
        L.append(f"- {k}: {v['inconclusive']} of {v['checks']}")
    L += ["", "## Verdict stability (first check against a repeat)", ""]
    for v, s in res["stability"].items():
        L.append(f"- {v}: {s['flips']} flips of {s['n']}; Cohen's kappa {s['kappa'] if s['kappa'] is not None else 'not estimable'}")
    if res["leave_one_repo_out"]:
        L += ["", "## Leave one repository out (equal-weight point estimates)", ""]
        for rp, v in res["leave_one_repo_out"].items():
            L.append(f"- without {rp}: bad {pct(v['bad'])}, good {pct(v['good'])}")
    L += ["", "## Workflow outcomes (reference tests, not established correctness)", ""]
    for a, w in res["workflow"].items():
        L.append(f"- Author {a}: {w['attempted']} tasks; statuses {w['statuses']}.")
        for arm in ("A1", "A2", "A3"):
            x = w[arm]
            L.append(f"  - {arm}: accepted {x['accepted']}, good delivered {fr(x['good_delivered_per_task'])}, "
                     f"escapes {fr(x['escapes_per_attempt'])}, bad among accepted {fr(x['bad_among_accepted'])}")
    L += ["", "A4 (human sign-off) is omitted from this run; it reports no human comparison and no human time saved.", ""]
    adj = res["adjudication"]
    L += ["## Substantiated discordant-rejection contrast", ""]
    if adj.get("status") == "complete":
        for k, c in adj["counts"].items():
            L.append(f"- {k}: supported {c['supported']}, unsupported {c['unsupported']}, indeterminate {c['indeterminate']}")
        L += [f"- Fail-fail pairs, not audited: {adj['fail_fail_unaudited']}", "", f"Disclosure: {adj['disclosure']}.", ""]
    else:
        L += [f"Not available ({adj.get('status')}). Without adjudication this report does not use the words \"defects caught\".", ""]
    sp = res["spend"]
    L += ["## Spend", "", f"Actual: ${sp['actual_usd']} ({sp['basis']}). API-equivalent for disclosure only: "
          f"{'not computed' if sp['api_equivalent_usd'] is None else '$' + str(sp['api_equivalent_usd'])}. "
          f"Calls with unknown usage: {sp['calls_with_unknown_usage']}.", ""]
    if cfg["cohort"].get("historical"):
        L += ["## Contamination", "", "This cohort is historical: its issues may predate the models' training cutoffs.", ""]
    return "\n".join(L)
