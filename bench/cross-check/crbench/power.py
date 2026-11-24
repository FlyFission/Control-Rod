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
from .manifest import load_manifest, load_snapshot, pool_for
from .score import pairs
from .stats import Z95, wilson80_lower

MIN_YIELD = 0.15
SIMS = 1000
N_CAP = 4000


def _phi(x: float) -> float:
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def simulate(N: int, q: list[float], g: list[float], p_d: float, rho: float, miss: float, delta: float,
             delta_fr: float, sims: int, seed, f_both: float = 0.5) -> float:
    """Share of simulated studies meeting both criteria together.

    Each task draws one outcome per author (hidden-test-failing with probability q, passing with g,
    else ineligible), correlated within the task. Each eligible patch then gets a paired verdict:
    cross-only rejection with probability (p_d + gain)/2, same-only with (p_d - gain)/2, else
    concordant, and a concordant pair is a double rejection with probability f_both. One Bernoulli
    per task decides, with probability rho, whether both authors' patches share the verdict draw.
    Each checker is then inconclusive with probability miss; an inconclusive is a non-rejection and
    the pair stays in the denominator, as in `score`."""
    rng = random.Random(f"{seed}:{N}:{p_d}:{rho}")
    wins = 0
    gains = {"bad": delta, "good": 0.0}
    for _ in range(sims):
        m = {k: [[0] * N, [0] * N] for k in gains}
        x = {k: [[0] * N, [0] * N] for k in gains}
        for i in range(N):
            zs = rng.gauss(0, 1)
            share = rng.random() < rho
            u_shared, v_shared = rng.random(), rng.random()
            for a in (0, 1):
                u0 = _phi(math.sqrt(rho) * zs + math.sqrt(1 - rho) * rng.gauss(0, 1))
                k = "bad" if u0 < q[a] else ("good" if u0 < q[a] + g[a] else None)
                if k is None:
                    continue
                m[k][a][i] = 1
                u, v = (u_shared, v_shared) if share else (rng.random(), rng.random())
                up, down = (p_d + gains[k]) / 2, (p_d - gains[k]) / 2
                if u < up:
                    cf, sf = 1, 0
                elif u < up + down:
                    cf, sf = 0, 1
                else:
                    cf = sf = int(v < f_both)
                cf *= rng.random() >= miss
                sf *= rng.random() >= miss
                x[k][a][i] = cf - sf
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
            if se == 0:  # a degenerate interval never counts as a win
                ok = False
                break
            if (k == "bad" and not D - Z95 * se > 0) or (k == "good" and not D + Z95 * se < delta_fr):
                ok = False
                break
        wins += ok
    return wins / sims


def mc_lower(p: float, sims: int) -> float:
    """Lower 95% Monte Carlo bound on a simulated power."""
    return p - Z95 * math.sqrt(max(p * (1 - p), 1e-12) / sims)


def required_n(q, g, grid, miss, margins, sims=SIMS, seed=0, f_both=0.5) -> tuple[int | None, dict]:
    """Smallest N whose simulated power, less its Monte Carlo error, reaches the target at every grid
    point. N_CAP itself is evaluated before giving up."""
    power = margins.get("power", 0.8)

    def meets(N):
        out = {f"p_d={p},rho={r}": simulate(N, q, g, p, r, miss, margins["delta_catch"], margins["delta_fr"], sims,
                                            seed, f_both) for p, r in grid}
        return all(mc_lower(v, sims) >= power for v in out.values()), out

    lo, hi = 2, 8
    while not meets(hi)[0]:
        if hi >= N_CAP:
            return None, {"searched_to": N_CAP}
        lo, hi = hi, min(hi * 2, N_CAP)
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if meets(mid)[0]:
            hi = mid
        else:
            lo = mid
    return hi, meets(hi)[1]


def throughput(study: Study, cfg: dict, n_cal: int) -> dict:
    """Phase-1 task capacity from phase 0: busy call time per task (probes and idle gaps left out),
    slowed to wall-clock pace for a vendor that hit a quota pause, and bounded by the remaining call
    and token caps."""
    lg = Ledger(study)
    st = lg.state()
    caps = cfg["caps"]
    dones = [d for d in st["dones"].values() if d["phase"] == "calibration" and not d.get("probe")]
    launches = [e for e in st["launches"] if e["phase"] == "calibration" and not e["call"].startswith("probe")]
    per_vendor = {}
    for d in dones:
        v = per_vendor.setdefault(d["vendor"], {"calls": 0, "busy_s": 0.0, "known_tokens": 0, "unknown_usage": 0})
        v["calls"] += 1
        v["busy_s"] += d.get("seconds") or 0
        if (d.get("usage") or {}).get("known"):
            v["known_tokens"] += d["usage"]["total"]
        else:
            v["unknown_usage"] += 1
    busy = sum(v["busy_s"] for v in per_vendor.values())
    per_day_busy = 86400 * n_cal / busy if busy > 0 else None
    paused = {e["vendor"] for e in st["events"] if e["event"] == "quota_paused"}
    per_day = per_day_busy
    if paused and launches:
        span = (parse_time(dones[-1]["at"]) - parse_time(launches[0]["at"])).total_seconds() / 86400 if dones else 0
        wall = n_cal / max(span, 1 / 24)
        per_day = min(per_day_busy or wall, wall)
    days_left = max((lg.deadline() - parse_time(now())) / timedelta(days=1), 0)
    by_time = None if per_day is None else per_day * days_left
    calls_per_task = len(launches) / n_cal if n_cal else None
    by_calls = (caps["max_calls"] - len(st["launches"])) / calls_per_task if calls_per_task else None
    p95 = lg.calibration_p95()
    tok_task = None
    if p95 and all(p95.values()):
        tok_task = sum(p95.get(f"{d['vendor']}/{d['role']}") or 0 for d in dones) / n_cal
    by_tokens = (caps["max_tokens"] - lg.known_tokens(st)) / tok_task if tok_task else None
    bounds = {"time": by_time, "calls": by_calls, "tokens": by_tokens}
    known = [b for b in bounds.values() if b is not None]
    return {"per_vendor": per_vendor, "quota_paused_vendors": sorted(paused), "tasks_per_day": per_day,
            "days_left": days_left, "bounds": bounds, "n_feasible": int(min(known)) if known else 0,
            "token_p95": p95}


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
        per[a] = {"attempts": n, "eligible_bad": bad, "eligible_good": good, "q_point": bad / n if n else None,
                  "q_lower80": wilson80_lower(bad, n), "good_lower80": wilson80_lower(good, n)}
    checks = [r[f"{role}0"] for r in rows for role in ("same", "cross") if r[f"{role}0"] is not None]
    miss = sum(v == "inconclusive" for v in checks) / len(checks) if checks else 0.0
    conc = [r for r in rows if r["eligible"] and r["same0"] == r["cross0"] and r["same0"] in ("pass", "fail")]
    f_both = sum(r["same0"] == "fail" for r in conc) / len(conc) if conc else 0.5
    nu = cfg["nuisance"]
    grid = [(p, r) for p in nu["p_d"] for r in nu["rho"]]
    rec = {"at": now(), "study_sha256": proto["frozen_sha256"], "script_sha256": sha256_file(__file__),
           "inputs": {"per_author": per, "missingness": miss, "f_both": f_both, "grid": grid, "margins": cfg["margins"], "sims": sims},
           "assumptions": ["true catch gain equals delta_catch; no true change in false rejection",
                           "discordance splits (p_d + gain)/2 cross-only and (p_d - gain)/2 same-only",
                           "within-task correlation rho on both yield and verdict discordance",
                           "cluster-robust normal interval stands in for the task bootstrap inside the simulation",
                           "each checker is inconclusive with the phase-0 share of inconclusive checks; an "
                           "inconclusive is a non-rejection and stays in the denominator",
                           "a concordant pair is a double rejection with the phase-0 share f_both",
                           "power must clear the target after subtracting 1.96 Monte Carlo standard errors"],
           "token_p95": Ledger(study).calibration_p95()}
    gate = None
    if any(v["eligible_bad"] == 0 for v in per.values()):
        gate = "uninformative calibration: an author had no eligible hidden-test-failing patch"
    elif any(v["eligible_good"] == 0 for v in per.values()):
        gate = "uninformative calibration: an author had no eligible hidden-test-passing patch"
    elif any(v["q_point"] is not None and v["q_point"] < MIN_YIELD for v in per.values()):
        gate = f"an author's q point estimate is below {MIN_YIELD}: switch to a harder tier or source and calibrate again"
    if gate:
        rec.update({"designation": "stop", "reason": gate, "n_phase1": 0})
        return _write(out_p, rec)
    q = [per[a]["q_lower80"] for a in authors]
    g = [per[a]["good_lower80"] for a in authors]
    need, curve = required_n(q, g, grid, miss, cfg["margins"], sims, cfg["selection"]["seed"], f_both)
    rec["power_at_required"] = curve
    required = None if need is None else math.ceil(need * 1.10)
    n_cal = len(load_manifest(study, "calibration")["tasks"])
    tp = throughput(study, cfg, n_cal)
    n_feasible = tp["n_feasible"]
    srows, _ = load_snapshot(cfg)
    pool = pool_for(study, "main", srows)
    cap = cfg["selection"].get("max_per_repo")
    by = {}
    for r in pool:
        by[r["repo"]] = by.get(r["repo"], 0) + 1
    supply = sum(min(v, cap) if cap else v for v in by.values()) - cfg["selection"].get("reserve", 0)
    rec["capacity"] = {"calibration_tasks": n_cal, **tp, "task_supply": supply}
    rec["n_required"] = required
    if required is not None and required <= n_feasible and required <= supply:
        rec.update({"designation": "publication run", "n_phase1": required})
    else:
        n = max(min(n_feasible, supply), 0)
        rec.update({"designation": "feasibility pilot" if n > 0 else "stop", "n_phase1": n,
                    "reason": "required count exceeds the verified subscription capacity, the horizon or the task supply"
                    if required else f"no count up to {N_CAP} meets the rule"})
    return _write(out_p, rec)


def _write(out_p, rec: dict) -> dict:
    rec["sha256"] = digest({k: v for k, v in rec.items() if k != "sha256"})
    write_json(out_p, rec)
    return rec
