"""Phase-1 sizing from phase 0 (DESIGN.md §2, Owner decision 1). Run once; its output is frozen.

The simulation follows the clustered paired design for the equal-author-weight contrast. For speed
it judges each simulated study with a cluster-robust normal interval (a delta-method linearization
of the ratio estimator over tasks), not the full task bootstrap used in `score`; this is recorded
in the output as an assumption.

Rule: the smallest task count with at least `power` simulated probability that both
(a) the 95% lower bound of the bad-patch contrast is above 0 (true gain delta_catch), and
(b) the 95% upper bound of the good-patch contrast is below +delta_fr (true change 0)
hold together, at every point of the preregistered nuisance grid. Then +10% attrition."""

from __future__ import annotations

import math
import random
from datetime import timedelta

from .common import Refused, Study, digest, now, parse_time, read_json, sha256_file, write_json
from .ledger import Ledger
from .manifest import load_snapshot, pool_for
from .score import pairs
from .stats import Z95, wilson80_lower

MIN_YIELD = 0.15
SIMS = 1000
N_CAP = 4000


def _phi(x: float) -> float:
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def simulate(N: int, q: list[float], g: list[float], p_d: float, rho: float, miss: float, delta: float,
             delta_fr: float, sims: int, seed) -> float:
    """Share of simulated studies meeting both criteria together. Each task draws one outcome per
    author (hidden-test-failing with probability q, passing with g, else ineligible), correlated
    within the task, then a paired verdict per eligible patch."""
    rng = random.Random(f"{seed}:{N}:{p_d}:{rho}")
    wins = 0
    gains = {"bad": delta, "good": 0.0}
    for _ in range(sims):
        m = {k: [[0] * N, [0] * N] for k in gains}
        x = {k: [[0] * N, [0] * N] for k in gains}
        for i in range(N):
            zs = rng.gauss(0, 1)
            u_shared = rng.random()
            for a in (0, 1):
                u0 = _phi(math.sqrt(rho) * zs + math.sqrt(1 - rho) * rng.gauss(0, 1))
                k = "bad" if u0 < q[a] else ("good" if u0 < q[a] + g[a] else None)
                if k is None or rng.random() < miss:
                    continue
                m[k][a][i] = 1
                u = u_shared if rng.random() < rho else rng.random()
                up, down = (p_d + gains[k]) / 2, (p_d - gains[k]) / 2
                x[k][a][i] = 1 if u < up else (-1 if u < up + down else 0)
        ok = True
        for k in gains:
            M = [sum(m[k][0]), sum(m[k][1])]
            if min(M) == 0:
                ok = False
                break
            d = [sum(x[k][a]) / M[a] for a in (0, 1)]
            D = (d[0] + d[1]) / 2
            var = sum((0.5 * sum((x[k][a][i] - d[a] * m[k][a][i]) / M[a] for a in (0, 1))) ** 2 for i in range(N))
            se = math.sqrt(var * N / max(N - 1, 1))
            if (k == "bad" and not D - Z95 * se > 0) or (k == "good" and not D + Z95 * se < delta_fr):
                ok = False
                break
        wins += ok
    return wins / sims


def required_n(q, g, grid, miss, margins, sims=SIMS, seed=0) -> tuple[int | None, dict]:
    power = margins.get("power", 0.8)

    def meets(N):
        out = {f"p_d={p},rho={r}": simulate(N, q, g, p, r, miss, margins["delta_catch"], margins["delta_fr"], sims, seed)
               for p, r in grid}
        return all(v >= power for v in out.values()), out

    lo, hi = 2, 8
    while True:
        okk, _ = meets(hi)
        if okk:
            break
        lo, hi = hi, hi * 2
        if hi > N_CAP:
            return None, {"searched_to": N_CAP}
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if meets(mid)[0]:
            hi = mid
        else:
            lo = mid
    return hi, meets(hi)[1]


def size(study: Study, sims: int = SIMS) -> dict:
    out_p = study.dir / "sizing.json"
    if out_p.exists():
        raise Refused("§2 freeze", "sizing.json is frozen; it is computed once")
    proto = study.protocol()
    cfg = proto["frozen"]["config"]
    res = read_json(study.phase_dir("calibration") / "results.json")
    if res.get("status") != "complete":
        raise Refused("§2", "score calibration completely before sizing")
    rows = pairs(study, "calibration")
    authors = cfg["authors"]
    per = {}
    for a in authors:
        mine = [r for r in rows if r["author"] == a]
        n = len(mine)
        bad = sum(r["eligible"] and r["grade"] == "bad" for r in mine)
        good = sum(r["eligible"] and r["grade"] == "good" for r in mine)
        per[a] = {"attempts": n, "eligible_bad": bad, "eligible_good": good, "q_point": round(bad / n, 4) if n else None,
                  "q_lower80": wilson80_lower(bad, n), "good_lower80": wilson80_lower(good, n)}
    checks = [r[f"{role}0"] for r in rows for role in ("same", "cross") if r[f"{role}0"] is not None]
    miss = round(sum(v == "inconclusive" for v in checks) / len(checks), 4) if checks else 0.0
    nu = cfg["nuisance"]
    grid = [(p, r) for p in nu["p_d"] for r in nu["rho"]]
    rec = {"at": now(), "study_sha256": proto["frozen_sha256"], "script_sha256": sha256_file(__file__),
           "inputs": {"per_author": per, "missingness": miss, "grid": grid, "margins": cfg["margins"], "sims": sims},
           "assumptions": ["true catch gain equals delta_catch; no true change in false rejection",
                           "discordance splits (p_d + gain)/2 cross-only and (p_d - gain)/2 same-only",
                           "within-task correlation rho on both yield and verdict discordance",
                           "cluster-robust normal interval stands in for the task bootstrap inside the simulation",
                           "missingness is the phase-0 share of inconclusive checks, applied per pair"]}
    gate = None
    if any(v["eligible_bad"] == 0 for v in per.values()):
        gate = "uninformative calibration: an author had no eligible hidden-test-failing patch"
    elif any(v["q_point"] is not None and v["q_point"] < MIN_YIELD for v in per.values()):
        gate = f"an author's q point estimate is below {MIN_YIELD}: switch to a harder tier or source and calibrate again"
    if gate:
        rec.update({"designation": "stop", "reason": gate, "n_phase1": 0})
        write_json(out_p, rec)
        return rec
    q = [per[a]["q_lower80"] for a in authors]
    g = [per[a]["good_lower80"] for a in authors]
    need, curve = required_n(q, g, grid, miss, cfg["margins"], sims, cfg["selection"]["seed"])
    rec["power_at_required"] = curve
    required = None if need is None else math.ceil(need * 1.10)
    # throughput: phase-0 tasks per day, bottlenecked by the slower vendor, stability repeats included
    lg = Ledger(study)
    ev = [e for e in lg.events() if e.get("phase") == "calibration"]
    span_days = (parse_time(ev[-1]["at"]) - parse_time(ev[0]["at"])).total_seconds() / 86400 if len(ev) > 1 else 0
    n_cal = len(read_json(study.phase_dir("calibration") / "manifest.json")["tasks"])
    per_day = n_cal / max(span_days, 1 / 24)
    remaining = max((lg.deadline() - parse_time(now())) / timedelta(days=1), 0)
    n_feasible = int(per_day * remaining)
    srows, _ = load_snapshot(cfg)
    pool = pool_for(study, "main", srows)
    cap = cfg["selection"].get("max_per_repo")
    by = {}
    for r in pool:
        by[r["repo"]] = by.get(r["repo"], 0) + 1
    supply = sum(min(v, cap) if cap else v for v in by.values()) - cfg["selection"].get("reserve", 0)
    rec["capacity"] = {"calibration_tasks": n_cal, "calibration_days": round(span_days, 3),
                       "tasks_per_day": round(per_day, 2), "days_left": round(remaining, 2), "n_feasible": n_feasible,
                       "task_supply": supply}
    rec["n_required"] = required
    if required is not None and required <= n_feasible and required <= supply:
        rec.update({"designation": "publication run", "n_phase1": required})
    else:
        n = max(min(n_feasible, supply), 0)
        rec.update({"designation": "feasibility pilot" if n > 0 else "stop", "n_phase1": n,
                    "reason": "required count exceeds the verified subscription capacity, the horizon or the task supply"
                    if required else f"no count up to {N_CAP} meets the rule"})
    rec["sha256"] = digest({k: v for k, v in rec.items() if k != "sha256"})
    write_json(out_p, rec)
    return rec
