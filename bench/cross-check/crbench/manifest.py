"""Study protocol, task snapshot, selection, audit and exclusions (DESIGN.md §2, §3, §9)."""

from __future__ import annotations

import fnmatch
import json
import random
from pathlib import Path

from .common import HERE, Refused, Study, digest, git_dirty, git_head, harness_digest, load_sizing, now, read_json, sha256_file, write_json

REQUIRED_TASK_FIELDS = ("instance_id", "repo", "base_commit", "problem_statement", "test_patch",
                        "FAIL_TO_PASS", "PASS_TO_PASS")
PROMPTS = ("author.md", "checker.md")


# ------------------------------------------------------------------ protocol


def validate_config(cfg: dict) -> None:
    """Refuse a protocol that leaves a frozen choice open."""
    need = ["name", "cohort", "snapshot", "selection", "authors", "margins", "nuisance", "caps", "evaluation",
            "test_path_rule", "stability", "lower_bound"]
    missing = [k for k in need if k not in cfg]
    if missing:
        raise Refused("§2 freeze", f"config is missing {missing}")
    if len(cfg["authors"]) != 2:
        raise Refused("§1", "exactly two authors, one per vendor")
    m = cfg["margins"]
    for k in ("delta_catch", "delta_fr", "alpha", "power"):
        if not isinstance(m.get(k), (int, float)):
            raise Refused("§2 freeze", f"margins.{k} must be a number")
    caps = cfg["caps"]
    for k in ("calendar_days", "calibration_max_calls", "max_calls", "max_tokens",
              "author_timeout_s", "checker_timeout_s"):
        if not isinstance(caps.get(k), (int, float)) or caps[k] <= 0:
            raise Refused("§9 caps", f"caps.{k} must be a positive number")
    if cfg["snapshot"]["kind"] == "swebench":
        h = cfg["evaluation"].get("harness", "")
        if "==" not in h:
            raise Refused("§6 grading", f"evaluation.harness must pin a version (name==X.Y.Z), got {h!r}")
        if not cfg["evaluation"].get("python"):
            raise Refused("§6 grading", "evaluation.python must pin the interpreter version")
    if not (0 < m["delta_catch"] <= min(cfg["nuisance"]["p_d"]) and m["delta_fr"] > 0 and 0 < m["alpha"] < 1
            and 0 < m["power"] < 1):
        raise Refused("§2 margins", "need 0 < delta_catch <= min(p_d), delta_fr > 0, 0 < alpha, power < 1")
    if not all(0 <= r < 1 for r in cfg["nuisance"]["rho"]) or not all(0 < p < 1 for p in cfg["nuisance"]["p_d"]):
        raise Refused("§2 nuisance", "need 0 <= rho < 1 and 0 < p_d < 1")
    if caps["calibration_max_calls"] > caps["max_calls"]:
        raise Refused("§9 caps", "calibration_max_calls cannot exceed max_calls")
    if cfg["evaluation"].get("max_workers", 1) > 2:
        raise Refused("§9", "at most 2 evaluation workers")
    if cfg["snapshot"]["kind"] == "swebench":
        snap = cfg["snapshot"]
        if not snap.get("sha256") or not isinstance(snap.get("expected_rows"), int) \
                or isinstance(snap.get("expected_rows"), bool) or snap["expected_rows"] <= 0 or not snap.get("split"):
            raise Refused("§3 snapshot", "a SWE-bench snapshot needs a pinned sha256, a positive whole expected_rows and split")
        pre = cfg["selection"].get("pre_exclusions")
        if pre is not None and not (pre.get("path") and pre.get("sha256")):
            raise Refused("§3", "selection.pre_exclusions needs a path and a sha256")
    if cfg["lower_bound"] != "wilson80":
        raise Refused("§2 sizing", "lower_bound must be wilson80 (the method frozen in DESIGN.md)")
    if not cfg["cohort"].get("population"):
        raise Refused("§3", "cohort.population must state the target population")


def init_study(study: Study, config_path: Path, agents_path: Path = HERE / "agents.json") -> dict:
    if study.protocol_path.exists():
        raise Refused("§2 freeze", f"{study.protocol_path} is already frozen; start a new study directory")
    cfg = read_json(config_path)
    validate_config(cfg)
    agents = read_json(agents_path)
    for a in cfg["authors"]:
        if a not in agents:
            raise Refused("§5", f"author {a!r} is not in agents.json")
    if agents[cfg["authors"][0]].get("vendor") == agents[cfg["authors"][1]].get("vendor"):
        raise Refused("§1", "the two authors must come from different vendors")
    for a in cfg["authors"]:
        if agents[a]["kind"] != "stub":
            if not (cfg.get("container") or {}).get("image"):
                raise Refused("§4 container", "real agents run only in the per-call container; set container.image")
            hosts = agents[a].get("egress")
            if not hosts or any("*" in h or not h or h != h.lower() for h in hosts):
                raise Refused("§4 network", f"{a}: egress must list exact lower-case host names, no wildcards")
    frozen = {
        "config": cfg,
        "agents": {a: agents[a] for a in cfg["authors"]},
        "prompts": {p: (HERE / "prompts" / p).read_text() for p in PROMPTS},
        "control_rod_commit": git_head(),
        "control_rod_dirty": git_dirty(),
        "harness_sha256": harness_digest(),
    }
    proto = {"frozen": frozen, "frozen_sha256": digest(frozen), "frozen_at": now()}
    write_json(study.protocol_path, proto)
    return proto


# ------------------------------------------------------------------ snapshot


def load_snapshot(cfg: dict) -> tuple[list[dict], dict]:
    """The one immutable local snapshot used for selection and grading (§3)."""
    snap = cfg["snapshot"]
    if snap["kind"] == "fixture":
        base = HERE / snap["path"]
        rows = []
        for p in sorted(base.glob("*/task.json")):
            r = read_json(p)
            r["fixture_dir"] = str(p.parent.relative_to(HERE))
            rows.append(r)
        prov = {"kind": "fixture", "path": snap["path"], "rows_sha256": digest(rows)}
    elif snap["kind"] == "swebench":
        p = Path(snap["path"]).expanduser()
        if not p.exists():
            raise Refused("§3 snapshot", f"local snapshot {p} not found; download it once and pin its digest")
        text = p.read_text()
        rows = [json.loads(line) for line in text.splitlines() if line.strip()]
        prov = {"kind": "swebench", "path": snap["path"], "file_sha256": sha256_file(p), "rows_sha256": digest(rows),
                "dataset_name": snap.get("dataset_name"), "split": snap.get("split")}
        if snap.get("sha256") and snap["sha256"] != prov["file_sha256"]:
            raise Refused("§3 snapshot", "snapshot file digest differs from the pinned sha256")
    else:
        raise Refused("§3 snapshot", f"unknown snapshot kind {snap['kind']!r}")
    validate_rows(rows, snap.get("expected_rows"))
    prov["rows"] = len(rows)
    return rows, prov


def validate_rows(rows: list[dict], expected: int | None) -> None:
    ids = [r.get("instance_id") for r in rows]
    if len(set(ids)) != len(ids):
        raise Refused("§3 snapshot", "instance IDs are not unique")
    if expected is not None and len(rows) != expected:
        raise Refused("§3 snapshot", f"expected {expected} rows, found {len(rows)} (truncated download?)")
    for r in rows:
        miss = [f for f in REQUIRED_TASK_FIELDS if f not in r]
        if miss:
            raise Refused("§3 snapshot", f"{r.get('instance_id')} lacks {miss}")
        for f in ("FAIL_TO_PASS", "PASS_TO_PASS"):
            if isinstance(r[f], str):  # SWE-bench stores these lists as JSON text
                r[f] = json.loads(r[f])
            if not isinstance(r[f], list) or not r[f]:
                raise Refused("§6 A1", f"{r['instance_id']} has an empty {f}")
        if not r.get("patch"):
            raise Refused("§6 controls", f"{r['instance_id']} has no gold patch")


# ------------------------------------------------------------------ selection


def exclusions(study: Study) -> dict[str, str]:
    p = study.dir / "exclusions.json"
    return read_json(p) if p.exists() else {}


def pool_for(study: Study, phase: str, rows: list[dict]) -> list[dict]:
    """Tasks eligible for a phase: the frozen filters, minus exclusions and anything calibration drew."""
    sel = study.protocol()["frozen"]["config"]["selection"]
    used = set()
    if phase == "main":
        cal = load_manifest(study, "calibration")
        used = set(cal["tasks"]) | set(cal["reserve"]) | set(cal.get("replaced", {}))
    excl = dict(exclusions(study))
    pre = sel.get("pre_exclusions")
    if pre:
        pp = Path(pre["path"]).expanduser()
        if not pp.is_absolute():
            pp = HERE / pp
        if not pp.exists() or sha256_file(pp) != pre["sha256"]:
            raise Refused("§3", f"pre-exclusion list {pre['path']} is missing or differs from its pinned sha256")
        for tid in json.loads(pp.read_text()):
            excl.setdefault(tid, "pre-sampling exclusion list")
    pool = [r for r in rows if r["instance_id"] not in used and r["instance_id"] not in excl]
    if sel.get("difficulty"):
        pool = [r for r in pool if r.get("difficulty") in sel["difficulty"]]
    if sel.get("repos"):
        pool = [r for r in pool if r.get("repo") in sel["repos"]]
    return sorted(pool, key=lambda r: r["instance_id"])


def select(study: Study, phase: str, n: int | None = None) -> dict:
    proto = study.protocol()
    cfg = proto["frozen"]["config"]
    pdir = study.phase_dir(phase)
    if (pdir / "manifest.json").exists():
        raise Refused("§2", f"{phase} already has a manifest; tasks are never re-drawn")
    rows, prov = load_snapshot(cfg)
    sel = cfg["selection"]
    if phase == "calibration":
        n = sel["calibration_n"]
    else:
        sz = load_sizing(study)
        if sz is None:
            raise Refused("§2 sizing", "main needs a frozen sizing.json from `size`")
        n = sz["n_phase1"]
        if n < 1:
            raise Refused("§2 sizing", "sizing says stop; no phase 1")
    pool = pool_for(study, phase, rows)
    random.Random(f"{sel['seed']}:{phase}").shuffle(pool)
    cap, per_repo, picked = sel.get("max_per_repo"), {}, []
    want = n + sel.get("reserve", 0)
    for r in pool:
        if cap and per_repo.get(r["repo"], 0) >= cap:
            continue
        per_repo[r["repo"]] = per_repo.get(r["repo"], 0) + 1
        picked.append(r)
        if len(picked) == want:
            break
    if len(picked) < want:
        raise Refused("§3 quotas", f"only {len(picked)} tasks fit the filters and quotas; {n} plus a reserve of "
                      f"{want - n} needed")
    tasks, reserve = picked[:n], picked[n:]
    order = [r["instance_id"] for r in tasks]
    random.Random(f"{sel['seed']}:{phase}:order").shuffle(order)
    manifest = {
        "phase": phase, "created": now(), "source": prov, "seed": sel["seed"],
        "tasks": [r["instance_id"] for r in tasks], "reserve": [r["instance_id"] for r in reserve],
        "block_order": order, "replaced": {}, "rows": {r["instance_id"]: r for r in tasks + reserve},
        "study_sha256": proto["frozen_sha256"],
        "sizing_sha256": sz["sha256"] if phase == "main" else None,
    }
    manifest["manifest_sha256"] = digest({k: v for k, v in manifest.items() if k != "manifest_sha256"})
    write_json(pdir / "manifest.json", manifest)
    write_audit(pdir, manifest)
    return manifest


def write_audit(pdir: Path, manifest: dict) -> None:
    """audit.md: everything a person needs to strike a defective task before any output (§3)."""
    L = [f"# Audit: {manifest['phase']}", "",
         "Read each task before any agent runs. Strike a task whose hidden tests ask for more, or less,",
         "than its issue does, or whose base or gold behavior is flaky, with",
         "`bench.py exclude --study DIR --phase PHASE --task ID --reason TEXT`. It is replaced from the",
         "frozen reserve, in order. Exclusions are refused once any agent call has run.", ""]
    for tid in manifest["tasks"]:
        r = manifest["rows"][tid]
        L += [f"## {tid}", "", f"Repo `{r['repo']}` at `{r['base_commit']}`, difficulty `{r.get('difficulty', 'n/a')}`.",
              "", "### Issue", "", "```text", r["problem_statement"].strip(), "```", "",
              "### Hidden tests that must start passing (FAIL_TO_PASS)", "",
              *[f"- `{t}`" for t in r["FAIL_TO_PASS"]], "",
              f"### Hidden regression tests (PASS_TO_PASS): {len(r['PASS_TO_PASS'])}", "",
              *[f"- `{t}`" for t in r["PASS_TO_PASS"][:50]],
              *([f"- ... {len(r['PASS_TO_PASS']) - 50} more"] if len(r["PASS_TO_PASS"]) > 50 else []), "",
              "### Hidden test patch", "", "```diff", r["test_patch"].rstrip(), "```", ""]
        if r.get("patch"):
            L += ["### Gold patch", "", "```diff", r["patch"].rstrip(), "```", ""]
    (pdir / "audit.md").write_text("\n".join(L))


def exclude(study: Study, phase: str, task: str, reason: str) -> dict:
    pdir = study.phase_dir(phase)
    if (pdir / "calls").exists() and any((pdir / "calls").iterdir()):
        raise Refused("§3 audit", "agents have already run in this phase; exclusions are closed")
    if not reason.strip():
        raise Refused("§3 audit", "an exclusion needs a reason")
    m = load_manifest(study, phase)
    if task not in m["tasks"]:
        raise Refused("§3 audit", f"{task} is not a selected task in {phase}")
    if not m["reserve"]:
        raise Refused("§3 quotas", "the reserve is empty; nothing can replace this task")
    cap = study.protocol()["frozen"]["config"]["selection"].get("max_per_repo")
    stratum = m["rows"][task].get("difficulty")
    left = [t for t in m["tasks"] if t != task]

    def fits(r):
        row = m["rows"][r]
        return row.get("difficulty") == stratum and (
            not cap or sum(m["rows"][t]["repo"] == row["repo"] for t in left) < cap)
    nxt = next((r for r in m["reserve"] if fits(r)), None)
    if nxt is None:
        raise Refused("§3 quotas", f"no reserve task in the same difficulty stratum ({stratum!r}) within the "
                      "repository cap; the phase cannot keep its sampling design")
    m["reserve"].remove(nxt)
    i = m["tasks"].index(task)
    m["tasks"][i] = nxt
    m["block_order"] = [nxt if t == task else t for t in m["block_order"]]
    m["replaced"][task] = {"by": nxt, "stratum": stratum, "reason": reason, "at": now()}
    excl = exclusions(study)
    excl[task] = reason
    write_json(study.dir / "exclusions.json", excl)
    m["manifest_sha256"] = digest({k: v for k, v in m.items() if k != "manifest_sha256"})
    write_json(pdir / "manifest.json", m)
    write_audit(pdir, m)
    return m


def load_manifest(study: Study, phase: str) -> dict:
    m = read_json(study.phase_dir(phase) / "manifest.json")
    if digest({k: v for k, v in m.items() if k != "manifest_sha256"}) != m["manifest_sha256"]:
        raise Refused("§9 manifest", f"{phase} manifest changed after it was written")
    return m


def is_test_path(path: str, rule: list[str]) -> bool:
    """The public test-path rule from author.md (§6)."""
    return any(fnmatch.fnmatchcase(path, g) for g in rule)
