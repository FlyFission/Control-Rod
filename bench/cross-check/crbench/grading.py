"""Hidden-test grading with per-test-ID evidence, patch statuses and control patches (DESIGN.md §6).

A patch passes A1 only if every frozen PASS_TO_PASS ID ran and passed. It resolves the task only if,
in addition, every FAIL_TO_PASS ID ran and passed. An absent ID or an unreadable report is missing
evidence (infra_error); a skipped or timed-out test is not a pass."""

from __future__ import annotations

import json
import secrets
import subprocess
from pathlib import Path

from .common import Refused, now, read_json, sha256_bytes
from .workspace import _git, export_base, remove

STATUSES = ("graded", "empty", "patch_invalid", "author_timeout", "infra_error")

RUNNER = r'''
import json, sys, unittest
repo, out, ids = sys.argv[1], sys.argv[2], sys.argv[3:]
sys.path.insert(0, repo)
res = {}
class R(unittest.TextTestResult):
    def addSuccess(self, t): super().addSuccess(t); res[t.id()] = "passed"
    def addFailure(self, t, e): super().addFailure(t, e); res[t.id()] = "failed"
    def addError(self, t, e): super().addError(t, e); res[t.id()] = "error"
    def addSkip(self, t, r): super().addSkip(t, r); res[t.id()] = "skipped"
for i in ids:  # one suite per required ID, so an import or collection error is charged to that ID
    try:
        suite = unittest.defaultTestLoader.loadTestsFromName(i)
    except Exception:
        res[i] = "error"
        continue
    r = unittest.TextTestRunner(resultclass=R, verbosity=0, stream=open("/dev/null", "w")).run(suite)
    if i not in res and (r.errors or r.failures):
        res[i] = "error"
json.dump(res, open(out, "w"))
'''


def judge(task: dict, outcomes: dict | None) -> dict:
    """Apply the frozen criterion to per-ID outcomes ("passed", "failed", "error", "skipped")."""
    f2p, p2p = list(task["FAIL_TO_PASS"]), list(task["PASS_TO_PASS"])
    if not f2p or not p2p:
        raise Refused("§6 A1", f"{task['instance_id']} has an empty expected test-ID set")
    if outcomes is None:
        return {"status": "infra_error", "why": "no report"}
    missing = [t for t in f2p + p2p if t not in outcomes]
    if missing:
        return {"status": "infra_error", "why": f"{len(missing)} required test IDs absent from the report",
                "missing": missing[:20]}
    a1 = all(outcomes[t] == "passed" for t in p2p)
    f2p_ok = all(outcomes[t] == "passed" for t in f2p)
    skipped = sorted(t for t in f2p + p2p if outcomes[t] == "skipped")
    return {"status": "graded", "a1_pass": a1, "resolved": a1 and f2p_ok, "skipped": skipped,
            "p2p_failed": sorted(t for t in p2p if outcomes[t] != "passed"),
            "f2p_failed": sorted(t for t in f2p if outcomes[t] != "passed")}


# ------------------------------------------------------------------ fixture grader (offline)


def grade_fixture(task: dict, patch: str, root: Path, cache: Path, timeout: int = 120) -> dict:
    repo = export_base(task, root, cache)
    try:
        for name, diff in (("model.diff", patch), ("tests.diff", task["test_patch"])):
            if diff.strip():
                pf = repo.parent / name
                pf.write_text(diff)
                try:
                    _git(["apply", "--binary", str(pf)], repo)
                except SystemExit as e:
                    return {"status": "patch_invalid" if name == "model.diff" else "infra_error", "why": str(e)}
        runner = repo.parent / "runner.py"
        runner.write_text(RUNNER)
        out = repo.parent / "report.json"
        try:
            subprocess.run(["python3", "-I", str(runner), str(repo), str(out), *task["FAIL_TO_PASS"],
                            *task["PASS_TO_PASS"]], cwd=repo, capture_output=True, timeout=timeout,
                           env={"PATH": "/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin", "PYTHONDONTWRITEBYTECODE": "1"})
        except subprocess.TimeoutExpired:
            return {"status": "infra_error", "why": "grader timeout"}
        outcomes = json.loads(out.read_text()) if out.exists() else None
        return judge(task, outcomes)
    finally:
        remove(repo.parent)


# ------------------------------------------------------------------ SWE-bench grader (Docker)


def report_paths(eval_dir: Path, run_id: str, model: str, tid: str) -> list[Path]:
    """The harness has written reports under both layouts across versions; phase 0 records which."""
    return [eval_dir / "logs" / layout / run_id / model / tid / "report.json"
            for layout in ("run_evaluation", "evaluation")]


def parse_swebench_report(path: Path | None, tid: str) -> dict | None:
    if path is None or not path.exists():
        return None
    try:
        rj = read_json(path)[tid]
        ts = rj["tests_status"]
    except (KeyError, json.JSONDecodeError, TypeError):
        return None
    out = {}
    for group in ("FAIL_TO_PASS", "PASS_TO_PASS"):
        for t in ts.get(group, {}).get("failure", []):
            out[t] = "failed"
        for t in ts.get(group, {}).get("success", []):
            out[t] = "passed"
    return out


def grade_swebench(ev: dict, snapshot: Path, items: list[tuple[str, str, str]], tasks: dict, eval_dir: Path) -> dict:
    """items: (label, instance_id, patch). Runs the pinned harness once per call and reads every
    report back by ID. Returns {label: grade}."""
    eval_dir.mkdir(parents=True, exist_ok=True)
    run_id = f"crb-{secrets.token_hex(6)}"
    model = "candidate"
    out = {}
    # one harness invocation per instance keeps labels unambiguous when a task appears twice
    for label, tid, patch in items:
        sub = eval_dir / f"{run_id}-{label}"
        sub.mkdir(parents=True, exist_ok=True)
        (sub / "preds.jsonl").write_text(json.dumps({"instance_id": tid, "model_name_or_path": model,
                                                     "model_patch": patch}) + "\n")
        rid = f"{run_id}-{secrets.token_hex(3)}"
        args = ["uv", "run", "--python", ev["python"], "--with", ev["harness"], "python", "-m",
                "swebench.harness.run_evaluation", "--dataset_name", str(snapshot), "--split", ev.get("split", "test"),
                "--predictions_path", str(sub / "preds.jsonl"), "--run_id", rid,
                "--max_workers", str(ev.get("max_workers", 2)), "--timeout", str(ev.get("timeout_s", 1800)),
                "--instance_ids", tid]
        r = subprocess.run(args, cwd=sub, text=True, capture_output=True)
        (sub / "harness.log").write_text(r.stdout + r.stderr)
        found = next((p for p in report_paths(sub, rid, model, tid) if p.exists()), None)
        if r.returncode != 0:
            out[label] = {"status": "infra_error", "why": f"harness exit {r.returncode}", "evaluator_run_id": rid}
            continue
        g = judge(tasks[tid], parse_swebench_report(found, tid))
        g.update({"evaluator_run_id": rid, "report": str(found.relative_to(sub)) if found else None})
        out[label] = g
    return out


# ------------------------------------------------------------------ one entry point


def grade(cfg: dict, items: list[tuple[str, str, str]], tasks: dict, root: Path, cache: Path, eval_dir: Path) -> dict:
    kind = cfg["snapshot"]["kind"]
    if kind == "fixture":
        return {label: {**grade_fixture(tasks[tid], patch, root, cache), "evaluator_run_id": f"fx-{secrets.token_hex(4)}"}
                for label, tid, patch in items}
    return grade_swebench(cfg["evaluation"], Path(cfg["snapshot"]["path"]).expanduser(), items, tasks, eval_dir)


def grade_submission(sub: dict, graded: dict | None) -> dict:
    """The status of one author submission, from its capture status and its grade."""
    if sub["status"] in ("empty", "patch_invalid", "author_timeout", "infra_error"):
        return {"status": sub["status"]}
    if graded is None:
        return {"status": "infra_error", "why": "not graded"}
    return graded


# ------------------------------------------------------------------ controls (§6)


def noop_patch() -> str:
    body = "control patch: changes nothing the tests can see\n"
    return ("diff --git a/CR_BENCH_NOOP.txt b/CR_BENCH_NOOP.txt\nnew file mode 100644\n"
            "--- /dev/null\n+++ b/CR_BENCH_NOOP.txt\n@@ -0,0 +1 @@\n+" + body)


def known_bad(task: dict, root: Path, cache: Path) -> str:
    """Empty the first source file the gold patch changes: the fix cannot be present."""
    if task.get("known_bad"):
        return task["known_bad"]
    gold = task.get("patch") or ""
    target = next((ln[6:] for ln in gold.splitlines() if ln.startswith("+++ b/")), None)
    if not target:
        raise Refused("§6 controls", f"{task['instance_id']} has no gold patch to derive a known-bad control")
    repo = export_base(task, root, cache)
    try:
        (repo / target).write_text("")
        _git(["add", "-A"], repo)
        return _git(["diff", "--cached", "--binary", "--full-index", "HEAD"], repo)
    finally:
        remove(repo.parent)


def run_controls(cfg: dict, tasks: dict, ids: list[str], root: Path, cache: Path, eval_dir: Path) -> dict:
    items, expect = [], {}
    for tid in ids:
        t = tasks[tid]
        if not t.get("patch"):
            raise Refused("§6 controls", f"{tid} has no gold patch")
        for kind, patch in (("base", noop_patch()), ("gold", t["patch"]), ("known_bad", known_bad(t, root, cache))):
            label = f"{kind}:{tid}"
            items.append((label, tid, patch))
            expect[label] = {"base": {"status": "graded", "a1_pass": True, "resolved": False},
                             "gold": {"status": "graded", "a1_pass": True, "resolved": True},
                             "known_bad": {"status": "graded", "resolved": False}}[kind]
    got = grade(cfg, items, tasks, root, cache, eval_dir)
    results = {}
    for label, want in expect.items():
        g = got[label]
        ok = all(g.get(k) == v for k, v in want.items())
        results[label] = {"expected": want, "got": {k: g.get(k) for k in ("status", "a1_pass", "resolved", "why")},
                          "ok": ok}
    # a deliberately missing report must read as missing evidence, never as a grade
    miss = judge(tasks[ids[0]], parse_swebench_report(eval_dir / "no-such-report.json", ids[0]))
    results["missing_report"] = {"expected": {"status": "infra_error"}, "got": {"status": miss["status"]},
                                 "ok": miss["status"] == "infra_error"}
    return {"at": now(), "passed": all(r["ok"] for r in results.values()), "results": results,
            "evaluation": {k: v for k, v in cfg["evaluation"].items()}}


def patch_digest(patch: str) -> str:
    return sha256_bytes(patch.encode())
