"""Hidden-test grading with per-test-ID evidence, patch statuses and control patches (DESIGN.md §6).

A patch passes A1 only if every frozen PASS_TO_PASS ID ran and passed. It resolves the task only if,
in addition, every FAIL_TO_PASS ID ran and passed. An ID that did not run, or an unreadable report,
is missing evidence (infra_error), never a failure; a skipped test is not a pass.

For SWE-bench the executed-test map comes from the pinned harness's own log parser
(swebench.harness.grading.get_logs_eval), because its report files a test that never ran under
"failure"."""

from __future__ import annotations

import json
import os
import re
import secrets
import subprocess
import time
from pathlib import Path

from . import confine
from .common import Refused, now, read_json, sha256_bytes, sha256_file
from .agents import read_capped, run_proc
from .workspace import _gitb, apply_patch, export_base, remove

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
for i in ids:  # one suite per required ID, so an import error is charged to that ID
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

LOG_MAP = r'''
import json, sys
from swebench.harness.grading import get_logs_eval
try:  # swebench 5: built from the dataset row's own image, eval_script and log_parser
    from swebench.harness.utils import make_test_spec
except ImportError:  # swebench 4
    from swebench.harness.test_spec.test_spec import make_test_spec
snapshot, tid, log = sys.argv[1], sys.argv[2], sys.argv[3]
row = next(json.loads(l) for l in open(snapshot) if l.strip() and json.loads(l)["instance_id"] == tid)
status, found = get_logs_eval(make_test_spec(row), log)
print(json.dumps({"found": bool(found), "status": status}))
'''
# XFAIL counts as a pass because the pinned harness's own grading counts it so (test_passed).
SWE_STATUS = {"PASSED": "passed", "XFAIL": "passed", "FAILED": "failed", "ERROR": "error", "SKIPPED": "skipped"}
COLLECTION_ERROR = re.compile(rb"ERROR collecting|Interrupted: \d+ errors? during collection|"
                              rb"^(SyntaxError|IndentationError|ImportError|ModuleNotFoundError)\b|"
                              rb"ImportError while (importing|loading)", re.M)


# SWE-bench harness markers: a log without both test-output markers, or with any infrastructure
# marker, never supports a collection-error verdict.
TEST_OUTPUT = (b">>>>> Start Test Output", b">>>>> End Test Output")
INFRA_MARKERS = (b">>>>> Tests Timed Out", b">>>>> Tests Errored", b">>>>> Reset Failed", b">>>>> Patch Apply Failed",
                 b">>>>> Test timed out", b">>>>> Tests errored", b">>>>> Error applying patch")  # 5.x, then older spellings


def collection_failed(log: Path, swebench: bool = True) -> bool:
    """The suite started and then died importing the candidate's code: a failure, not missing
    evidence. For SWE-bench the error must sit between complete test-output markers in a log with
    no timeout, crash or patch failure marker."""
    try:
        with log.open("rb") as f:
            data = f.read(32 * 1024 * 1024)
    except OSError:
        return False
    if swebench:
        a, b = data.find(TEST_OUTPUT[0]), data.find(TEST_OUTPUT[1])
        if a < 0 or b < a or any(m in data for m in INFRA_MARKERS):
            return False
        data = data[a:b]
    return bool(COLLECTION_ERROR.search(data))


def judge_collection_failure(task: dict, outcomes: dict | None) -> dict:
    """A suite that died collecting, before any required test ran, fails A1 as its own outcome. No
    per-test result is invented: the failed-test lists stay empty, so a collection error can never
    stand in for a failing test (the known-bad control needs real per-test failures). If some
    required tests ran and others are missing, the evidence is incomplete: infra_error."""
    req = list(task["FAIL_TO_PASS"]) + list(task["PASS_TO_PASS"])
    if outcomes is None:
        return {"status": "infra_error", "why": "collection error, but the executed-test map is unavailable"}
    if any(t in outcomes for t in req):
        return {"status": "infra_error", "why": "collection error after some required tests ran"}
    return {"status": "graded", "a1_pass": False, "resolved": False, "collection_error": True, "skipped": [],
            "p2p_failed": [], "f2p_failed": [], "why": "the test suite failed to collect before any required test ran"}


def judge(task: dict, outcomes: dict | None) -> dict:
    """Apply the frozen criterion to per-ID outcomes ("passed", "failed", "error", "skipped")."""
    f2p, p2p = list(task["FAIL_TO_PASS"]), list(task["PASS_TO_PASS"])
    if not f2p or not p2p:
        raise Refused("§6 A1", f"{task['instance_id']} has an empty expected test-ID set")
    if outcomes is None:
        return {"status": "infra_error", "why": "no report"}
    missing = [t for t in f2p + p2p if t not in outcomes]
    if missing:
        return {"status": "infra_error", "why": f"{len(missing)} required test IDs did not run", "missing": missing[:20]}
    a1 = all(outcomes[t] == "passed" for t in p2p)
    f2p_ok = all(outcomes[t] == "passed" for t in f2p)
    return {"status": "graded", "a1_pass": a1, "resolved": a1 and f2p_ok,
            "skipped": sorted(t for t in f2p + p2p if outcomes[t] == "skipped"),
            "p2p_failed": sorted(t for t in p2p if outcomes[t] != "passed"),
            "f2p_failed": sorted(t for t in f2p if outcomes[t] != "passed")}


def label_dir(label: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]", "_", label)


# ------------------------------------------------------------------ fixture grader (offline)


def grade_fixture(task: dict, patch: bytes, root: Path, cache: Path, deny: list[str], timeout: int = 120) -> dict:
    """Candidate code runs under the outer confinement with no network and an outer deadline."""
    repo = export_base(task, root, cache)
    try:
        for name, diff in (("model", patch), ("tests", task["test_patch"].encode())):
            if diff.strip():
                try:
                    apply_patch(repo, diff, index=False)
                except SystemExit as e:
                    return {"status": "patch_invalid" if name == "model" else "infra_error", "why": str(e)[:300]}
        runner = repo.parent / "runner.py"
        runner.write_text(RUNNER)
        out = repo.parent / "report.json"
        argv, conf = confine.wrap(["python3", "-I", str(runner), str(repo), str(out), *task["FAIL_TO_PASS"],
                                   *task["PASS_TO_PASS"]], deny_read=deny, allow_read=[repo.parent],
                                  writable=[repo.parent], network=False, required=False)
        _, stop = run_proc(argv, repo, "", timeout, {"PATH": "/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin",
                                                    "PYTHONDONTWRITEBYTECODE": "1"},
                           repo.parent / "grader.out", repo.parent / "grader.err", cap=16 * 1024 * 1024)
        if stop:
            return {"status": "infra_error", "why": f"grader {stop}"}
        try:
            outcomes = json.loads(read_capped(out)) if out.exists() and not out.is_symlink() else None
        except json.JSONDecodeError:
            outcomes = None
        return {**judge(task, outcomes), "outcomes": outcomes, "confinement": conf["mechanism"]}
    finally:
        remove(repo.parent)


# ------------------------------------------------------------------ SWE-bench grader (Docker)


HARNESS_FLAGS = ("--dataset_name", "--split", "--predictions_path", "--run_id", "--max_workers", "--timeout",
                 "--instance_ids")
GRADER_CHECK = r'''
import json, subprocess, sys
snapshot, ids = sys.argv[1], set(sys.argv[2:])
help_text = subprocess.run([sys.executable, "-m", "swebench.harness.run_evaluation", "--help"],
                           capture_output=True, text=True).stdout
try:
    from swebench.harness.utils import make_test_spec
except ImportError:
    from swebench.harness.test_spec.test_spec import make_test_spec
bad = {}
for line in open(snapshot):
    if not line.strip():
        continue
    row = json.loads(line)
    if row["instance_id"] in ids:
        try:
            make_test_spec(row)
        except Exception as e:
            bad[row["instance_id"]] = f"{type(e).__name__}: {e}"
print(json.dumps({"help": help_text, "bad_rows": bad}))
'''


def grader_check(cfg: dict, task_ids: list[str]) -> dict:
    """Before any grading: the pinned harness accepts every flag the harness passes, and builds a
    test spec from each selected row of the snapshot (swebench 5 needs the row's image,
    eval_script, log_parser and eval_type). No container runs."""
    ev = cfg["evaluation"]
    snapshot = Path(cfg["snapshot"]["path"]).expanduser()
    try:
        r = subprocess.run(["uv", "run", "--python", ev["python"], "--with", ev["harness"], "python", "-c", GRADER_CHECK,
                            str(snapshot), *task_ids], capture_output=True, text=True, timeout=900)
        j = json.loads(r.stdout.strip().splitlines()[-1])
    except (OSError, subprocess.TimeoutExpired, json.JSONDecodeError, IndexError) as e:
        return {"ok": False, "why": f"grader check did not run: {type(e).__name__}"}
    if not isinstance(j, dict) or not isinstance(j.get("help"), str) or not isinstance(j.get("bad_rows"), dict):
        return {"ok": False, "why": "grader check printed no result"}
    missing = [f for f in HARNESS_FLAGS if f not in j["help"]]
    bad = j["bad_rows"]
    why = "; ".join(([f"harness lacks {missing}"] if missing else []) +
                    ([f"{len(bad)} rows lack fields the harness needs, e.g. {next(iter(bad.items()))}"] if bad else []))
    return {"ok": not missing and not bad, "missing_flags": missing, "bad_rows": bad, "why": why or None}


def report_paths(eval_dir: Path, run_id: str, model: str, tid: str) -> list[Path]:
    """The harness has written reports under both layouts across versions; phase 0 records which."""
    return [eval_dir / "logs" / layout / run_id / model / tid / "report.json"
            for layout in ("run_evaluation", "evaluation")]


def parse_swebench_report(path: Path | None, tid: str) -> dict | None:
    """The report's verdict fields, or None if it is missing or malformed."""
    if path is None or not path.exists():
        return None
    try:
        rj = read_json(path)[tid]
    except (KeyError, json.JSONDecodeError, TypeError):
        return None
    if not isinstance(rj, dict) or not all(isinstance(rj.get(k), bool) for k in ("patch_successfully_applied", "resolved")):
        return None  # a verdict field must be a literal boolean, never a truthy string
    return {"applied": rj["patch_successfully_applied"], "resolved": rj["resolved"], "tests_status": rj.get("tests_status")}


def executed_map(ev: dict, snapshot: Path, tid: str, log: Path) -> dict | None:
    """Per-test outcomes of tests that actually appear in the harness log. Three states: None when
    the map is unavailable (no log, the parser failed, or the harness marks the log incomplete),
    {} when a complete log holds no test result, and the outcomes otherwise. Only {} can support a
    collection-error verdict."""
    if not log.exists():
        return None
    r = subprocess.run(["uv", "run", "--python", ev["python"], "--with", ev["harness"], "python", "-c", LOG_MAP,
                        str(snapshot), tid, str(log)], capture_output=True, text=True, timeout=600)
    if r.returncode != 0:
        return None
    try:
        j = json.loads(r.stdout.strip().splitlines()[-1])
    except (json.JSONDecodeError, IndexError):
        return None
    if j.get("found") is not True or not isinstance(j.get("status"), dict):
        return None  # found=false is the harness's own "incomplete log" (timeout, crash, failed apply)
    return {k: SWE_STATUS.get(v, "error") for k, v in j["status"].items()}


def grade_swebench(cfg: dict, frozen_snapshot_sha: str | None, items: list[tuple[str, str, bytes]], tasks: dict,
                   eval_dir: Path) -> dict:
    ev = cfg["evaluation"]
    snapshot = Path(cfg["snapshot"]["path"]).expanduser()
    if not snapshot.exists() or (frozen_snapshot_sha and sha256_file(snapshot) != frozen_snapshot_sha):
        raise Refused("§3 snapshot", "the grading snapshot is missing or differs from the frozen digest")
    out = {}
    for label, tid, patch in items:
        sub = eval_dir / label_dir(label)
        sub.mkdir(parents=True, exist_ok=True)
        model = "candidate"
        (sub / "preds.jsonl").write_text(json.dumps({"instance_id": tid, "model_name_or_path": model,
                                                     "model_patch": patch.decode("utf-8", errors="surrogateescape")}) + "\n")
        rid = f"crb-{secrets.token_hex(6)}"
        args = ["uv", "run", "--python", ev["python"], "--with", ev["harness"], "python", "-m",
                "swebench.harness.run_evaluation", "--dataset_name", str(snapshot), "--split", ev.get("split", "test"),
                "--predictions_path", str(sub / "preds.jsonl"), "--run_id", rid, "--max_workers", "1",
                "--timeout", str(ev.get("timeout_s", 1800)), "--instance_ids", tid]
        t0 = time.monotonic()
        code, stop = run_proc(args, sub, "", ev.get("timeout_s", 1800) + 900, dict(os.environ),
                              sub / "harness.out", sub / "harness.err", cap=256 * 1024 * 1024)
        if stop:
            out[label] = {"status": "infra_error", "why": f"harness {stop}", "evaluator_run_id": rid}
            continue
        found = next((p for p in report_paths(sub, rid, model, tid) if p.exists()), None)
        base = {"evaluator_run_id": rid, "seconds": round(time.monotonic() - t0, 1),
                "report_layout": found.relative_to(sub).parts[1] if found else None}
        if code != 0:
            out[label] = {**base, "status": "infra_error", "why": f"harness exit {code}"}
            continue
        rep = parse_swebench_report(found, tid)
        if rep is None:
            out[label] = {**base, "status": "infra_error", "why": "missing or malformed report"}
            continue
        if not rep["applied"]:
            out[label] = {**base, "status": "patch_invalid", "why": "the harness could not apply the patch"}
            continue
        log = found.parent / "test_output.txt"
        outcomes = executed_map(ev, snapshot, tid, log)
        g = judge(tasks[tid], outcomes)
        if g["status"] == "infra_error" and log.exists() and collection_failed(log):
            g = judge_collection_failure(tasks[tid], outcomes)
            if rep["resolved"]:
                g = {"status": "infra_error", "why": "report says resolved but the suite failed to import"}
        elif g["status"] == "graded" and g["resolved"] != rep["resolved"]:
            g = {"status": "infra_error", "why": "report and executed-test map disagree on resolution"}
        out[label] = {**base, **g, "outcomes": outcomes}
    out["_images"] = docker_images()
    return out


def docker_images() -> list[dict]:
    try:
        r = subprocess.run(["docker", "images", "--digests", "--format", "{{json .}}"], capture_output=True, text=True,
                           timeout=60)
    except (OSError, subprocess.TimeoutExpired):
        return []
    rows = []
    for line in r.stdout.splitlines():
        try:
            j = json.loads(line)
        except json.JSONDecodeError:
            continue
        if "sweb" in j.get("Repository", ""):
            rows.append({k: j.get(k) for k in ("Repository", "Tag", "Digest", "ID")})
    return rows


# ------------------------------------------------------------------ one entry point


def grade(cfg: dict, items: list[tuple[str, str, bytes]], tasks: dict, root: Path, cache: Path, eval_dir: Path,
          deny: list[str], snapshot_sha: str | None = None) -> dict:
    if cfg["snapshot"]["kind"] == "fixture":
        return {label: {**grade_fixture(tasks[tid], patch, root, cache, deny), "evaluator_run_id": f"fx-{secrets.token_hex(4)}"}
                for label, tid, patch in items}
    return grade_swebench(cfg, snapshot_sha, items, tasks, eval_dir)


def grade_submission(sub: dict, graded: dict | None) -> dict:
    """The status of one author submission, from its capture status and its grade."""
    if sub["status"] in ("empty", "patch_invalid", "author_timeout", "infra_error"):
        return {"status": sub["status"]}
    if graded is None:
        return {"status": "infra_error", "why": "not graded"}
    return graded


# ------------------------------------------------------------------ controls (§6)


def noop_patch() -> bytes:
    """The base with one sentinel file added: the harness skips an empty patch, so the base
    control carries a change no test can see."""
    return (b"diff --git a/CR_BENCH_NOOP.txt b/CR_BENCH_NOOP.txt\nnew file mode 100644\n"
            b"--- /dev/null\n+++ b/CR_BENCH_NOOP.txt\n@@ -0,0 +1 @@\n+control patch: changes nothing\n")


def safe_target(repo: Path, rel: str) -> Path:
    """A path from the dataset's gold patch, checked to be a regular file inside this export
    with no link anywhere on the way."""
    if not rel or rel.startswith("/") or any(part in ("", ".", "..") for part in rel.split("/")):
        raise Refused("§6 controls", f"unsafe path {rel!r} in the gold patch")
    cur = repo
    for part in rel.split("/"):
        cur = cur / part
        if cur.is_symlink():
            raise Refused("§6 controls", f"{rel} passes through a link")
    if not cur.is_file() or not cur.resolve().is_relative_to(repo.resolve()):
        raise Refused("§6 controls", f"{rel} is not a regular file in the export")
    return cur


def known_bad(task: dict, root: Path, cache: Path) -> bytes:
    """The gold patch with one file it modifies then emptied: any test that gold passes and this
    fails was broken by the damage, not by the base."""
    if task.get("known_bad"):
        return task["known_bad"].encode()
    gold = task.get("patch") or ""
    olds = {ln[6:] for ln in gold.splitlines() if ln.startswith("--- a/")}
    target = next((ln[6:] for ln in gold.splitlines() if ln.startswith("+++ b/") and ln[6:] in olds), None)
    if not target:
        raise Refused("§6 controls", f"{task['instance_id']}: the gold patch modifies no existing file")
    repo = export_base(task, root, cache)
    try:
        apply_patch(repo, gold.encode(), index=True)
        f = safe_target(repo, target)
        with open(f, "r+b") as fh:
            fh.truncate(0)
        _gitb(["add", "-A"], repo)
        return _gitb(["diff", "--cached", "--binary", "--full-index", "HEAD"], repo)
    finally:
        remove(repo.parent)


def missing_evidence_control(cfg: dict, task: dict, gold: dict, eval_dir: Path) -> dict:
    """Missing evidence through the real parser: the fixture runner's report with one required ID
    taken out, or the SWE-bench log parser on an empty log. Either must read as infra_error."""
    if cfg["snapshot"]["kind"] == "fixture":
        outcomes = dict(gold.get("outcomes") or {})
        outcomes.pop(task["FAIL_TO_PASS"][0], None)
        got = judge(task, outcomes)
    else:
        log = eval_dir / "missing-control" / "test_output.txt"
        log.parent.mkdir(parents=True, exist_ok=True)
        log.write_text("")
        got = judge(task, executed_map(cfg["evaluation"], Path(cfg["snapshot"]["path"]).expanduser(),
                                       task["instance_id"], log))
    return {"kind": "missing_report", "task": task["instance_id"], "ok": got["status"] == "infra_error",
            "got": {"status": got["status"]}}


def run_controls(cfg: dict, tasks: dict, ids: list[str], root: Path, cache: Path, eval_dir: Path, deny: list[str],
                 snapshot_sha: str | None = None, repeats: int | None = None) -> dict:
    """Base and gold repeated (flakiness), and a known-bad patch, for every task of the phase; plus
    missing evidence through the real parser, which must read as infra_error."""
    repeats = repeats or cfg["evaluation"].get("control_repeats", 2)
    items, expect = [], {}
    for tid in ids:
        t = tasks[tid]
        if not t.get("patch"):
            raise Refused("§6 controls", f"{tid} has no gold patch")
        kinds = [("base", noop_patch()), ("gold", t["patch"].encode())] * repeats + [("known_bad", known_bad(t, root, cache))]
        for i, (kind, patch) in enumerate(kinds):
            label = f"{kind}-{i}-{tid}"
            items.append((label, tid, patch))
            expect[label] = (tid, kind)
    got = grade(cfg, items, tasks, root, cache, eval_dir, deny, snapshot_sha)
    gold_ok = {tid: all(got[lb].get("status") == "graded" and got[lb].get("resolved") is True
                        for lb, (t, k) in expect.items() if t == tid and k == "gold") for tid in ids}
    results, per_task = {}, {}
    for label, (tid, kind) in expect.items():
        g = got[label]
        if kind == "base":
            ok = g.get("status") == "graded" and g.get("a1_pass") is True and g.get("resolved") is False
        elif kind == "gold":
            ok = g.get("status") == "graded" and g.get("resolved") is True
        else:  # gold passes every required test, so any failure here comes from the damage
            # the gold patch collected and passed, so a collection error here is the damage's own
            ok = gold_ok[tid] and g.get("status") == "graded" and g.get("resolved") is False and \
                bool(g.get("f2p_failed") or g.get("p2p_failed") or g.get("collection_error"))
        results[label] = {"task": tid, "kind": kind, "ok": ok,
                          "got": {k: g.get(k) for k in ("status", "a1_pass", "resolved", "why", "report_layout", "seconds")}}
        per_task.setdefault(tid, []).append(ok)
    first_gold = next(lb for lb, (t, k) in expect.items() if k == "gold")
    results["missing_report"] = missing_evidence_control(cfg, tasks[expect[first_gold][0]], got[first_gold], eval_dir)
    layouts = sorted({r["got"].get("report_layout") for r in results.values() if r["got"].get("report_layout")})
    return {"at": now(), "passed": all(r["ok"] for r in results.values()), "results": results,
            "flaky_or_failing_tasks": sorted(t for t, oks in per_task.items() if not all(oks)),
            "report_layout": layouts, "images": got.get("_images", []), "repeats": repeats}


def controls_md(rec: dict) -> str:
    L = ["# Controls", "", f"Base and gold each graded {rec['repeats']} times, and one known-bad patch, per task.",
         "A task listed here should be struck with `exclude` before any agent runs.", ""]
    for t in rec["flaky_or_failing_tasks"]:
        rows = [r for r in rec["results"].values() if r.get("task") == t]
        L.append(f"- `{t}`: " + ", ".join(f"{r['kind']} {'ok' if r['ok'] else 'FAILED'}" for r in rows))
    if not rec["flaky_or_failing_tasks"]:
        L.append("Every task's controls behaved as expected.")
    return "\n".join(L) + "\n"


def patch_digest(patch: bytes) -> str:
    return sha256_bytes(patch)
