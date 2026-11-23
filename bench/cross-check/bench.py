#!/usr/bin/env python3
"""Control Rod's own benchmark: does a second checker, and a checker from another vendor, catch
defects in coding-agent patches that the tests alone let through?

The same author patches are judged four ways (README.md has the full design):

  A1  author + tests      accept when the task's existing tests still pass
  A2  + same-model check  A1, and a checker running the author's own model says pass
  A3  + cross-vendor      A1, and a checker from the other vendor says pass
  A4  + human             A3, and the owner accepts the patch in `bench.py review`

Ground truth is the task's hidden tests (SWE-bench FAIL_TO_PASS and PASS_TO_PASS). Nothing here
runs on a schedule: every step is started by hand.

  python3 bench/cross-check/bench.py select   --config CONFIG            # pick tasks, write tasks.md
  python3 bench/cross-check/bench.py run      --run DIR [--yes]          # author + checker calls
  python3 bench/cross-check/bench.py evaluate --run DIR                  # hidden tests
  python3 bench/cross-check/bench.py review   --run DIR                  # A4, timed, by a person
  python3 bench/cross-check/bench.py score    --run DIR                  # results.json, report.md

Standard library only. Every number in report.md comes from score().
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import platform
import random
import re
import shutil
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
VERDICT = re.compile(r"<verdict>\s*(\{.*?\})\s*</verdict>", re.S)
ARMS = ("A1", "A2", "A3", "A4")
ARM_NAMES = {
    "A1": "Author + tests",
    "A2": "+ same-model checker",
    "A3": "+ cross-vendor checker",
    "A4": "+ cross-vendor checker + human",
}


# ---------------------------------------------------------------- small helpers


def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def sha256_file(p: Path) -> str:
    return sha256_bytes(p.read_bytes())


def read_json(p: Path):
    return json.loads(p.read_text())


def write_json(p: Path, data) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n")


def sh(args: list[str], cwd: Path | None = None, check: bool = True, **kw) -> subprocess.CompletedProcess:
    r = subprocess.run(args, cwd=cwd, text=True, capture_output=True, **kw)
    if check and r.returncode != 0:
        raise SystemExit(f"failed: {' '.join(args)}\n{r.stderr.strip()}")
    return r


def git_head() -> str:
    r = sh(["git", "rev-parse", "HEAD"], cwd=ROOT, check=False)
    return r.stdout.strip() if r.returncode == 0 else "unknown"


def tool_version(cmd: str) -> str | None:
    if not shutil.which(cmd):
        return None
    r = sh([cmd, "--version"], check=False)
    return (r.stdout or r.stderr).strip().splitlines()[0] if r.returncode == 0 else None


def wilson(k: int, n: int, z: float = 1.959963984540054) -> list[float] | None:
    """95% Wilson score interval for k successes in n trials."""
    if n == 0:
        return None
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return [round(max(0.0, c - h), 4), round(min(1.0, c + h), 4)]


def mcnemar_exact(b: int, c: int) -> float | None:
    """Two-sided exact McNemar p-value from the discordant counts b and c."""
    n = b + c
    if n == 0:
        return None
    k = min(b, c)
    tail = sum(math.comb(n, i) for i in range(k + 1)) / 2**n
    return round(min(1.0, 2 * tail), 4)


# ---------------------------------------------------------------- task selection


def load_rows(cfg: dict) -> tuple[list[dict], dict]:
    """Rows of the task source and a record of where they came from."""
    src = cfg["source"]
    if src["kind"] == "fixture":
        rows = [read_json(p) for p in sorted((HERE / src["path"]).glob("*/task.json"))]
        return rows, {"kind": "fixture", "path": src["path"]}
    if src["kind"] == "jsonl":
        p = Path(src["path"]).expanduser()
        rows = [json.loads(line) for line in p.read_text().splitlines() if line.strip()]
        return rows, {"kind": "jsonl", "path": str(p), "sha256": sha256_file(p)}
    if src["kind"] == "huggingface":
        return fetch_hf(src)
    raise SystemExit(f"unknown source kind {src['kind']}")


def fetch_hf(src: dict) -> tuple[list[dict], dict]:
    """Fetch a SWE-bench split through the Hugging Face datasets server, standard library only."""
    ds = src["dataset"]
    info = json.load(urllib.request.urlopen(f"https://huggingface.co/api/datasets/{ds}", timeout=60))
    rows, offset = [], 0
    while True:
        q = urllib.parse.urlencode({"dataset": ds, "config": src.get("config", "default"),
                                    "split": src.get("split", "test"), "offset": offset, "length": 100})
        page = json.load(urllib.request.urlopen(f"https://datasets-server.huggingface.co/rows?{q}", timeout=60))
        batch = [r["row"] for r in page.get("rows", [])]
        rows += batch
        offset += len(batch)
        if not batch or offset >= page.get("num_rows_total", 0):
            break
    blob = json.dumps(sorted(rows, key=lambda r: r["instance_id"]), sort_keys=True).encode()
    return rows, {"kind": "huggingface", "dataset": ds, "revision": info.get("sha"),
                  "rows": len(rows), "rows_sha256": sha256_bytes(blob)}


def select_tasks(rows: list[dict], sel: dict, excluded: set[str]) -> list[dict]:
    """Seeded sample: filter, sort by id, shuffle with the seed, cap per repository."""
    pool = [r for r in rows if r["instance_id"] not in excluded]
    if sel.get("difficulty"):
        pool = [r for r in pool if r.get("difficulty") in sel["difficulty"]]
    if sel.get("repos"):
        pool = [r for r in pool if r.get("repo") in sel["repos"]]
    pool.sort(key=lambda r: r["instance_id"])
    random.Random(sel["seed"]).shuffle(pool)
    cap, per_repo, out = sel.get("max_per_repo"), {}, []
    for r in pool:
        repo = r.get("repo", "")
        if cap and per_repo.get(repo, 0) >= cap:
            continue
        per_repo[repo] = per_repo.get(repo, 0) + 1
        out.append(r)
        if len(out) == sel["n"]:
            break
    return sorted(out, key=lambda r: r["instance_id"])


def cmd_select(a) -> None:
    cfg_path = Path(a.config).resolve()
    cfg = read_json(cfg_path)
    rows, provenance = load_rows(cfg)
    excluded_file = HERE / cfg.get("excluded", "excluded.json")
    excluded = {e["instance_id"] for e in read_json(excluded_file)["excluded"]} if excluded_file.exists() else set()
    tasks = select_tasks(rows, cfg["selection"], excluded)
    run_id = a.run_id or f"{datetime.now(timezone.utc):%Y%m%d}-{cfg['name']}-{git_head()[:7]}"
    run = Path(a.out or HERE / "runs" / run_id)
    if (run / "run.json").exists() and not a.force:
        raise SystemExit(f"{run} already has a run; pass --force or another --run-id")
    write_json(run / "tasks.json", tasks)
    write_json(run / "run.json", {
        "run_id": run_id, "created": now(), "config": cfg, "config_sha256": sha256_file(cfg_path),
        "source": provenance, "excluded_sha256": sha256_file(excluded_file) if excluded_file.exists() else None,
        "control_rod_commit": git_head(), "host": {"os": platform.system(), "machine": platform.machine(),
                                                 "python": platform.python_version()},
        "tasks": [t["instance_id"] for t in tasks],
    })
    lines = [f"# Tasks for {run_id}", "", f"Source: {json.dumps(provenance)}",
             f"Seed {cfg['selection']['seed']}, n = {len(tasks)}. Read each issue before any paid run, and add a",
             "task to excluded.json (with the reason) if its tests demand behavior the issue does not ask for.", ""]
    for t in tasks:
        lines += [f"## {t['instance_id']}", "", f"Repo `{t.get('repo')}` at `{t.get('base_commit', '')[:12]}`, "
                  f"difficulty `{t.get('difficulty', 'n/a')}`.", "", "<details><summary>Issue</summary>", "",
                  "```text", t["problem_statement"].strip()[:4000], "```", "</details>", ""]
    (run / "tasks.md").write_text("\n".join(lines))
    print(f"{len(tasks)} tasks -> {run}/tasks.md")


# ---------------------------------------------------------------- agents


def load_agents() -> dict:
    """agents.json, with agents.local.json (not committed) laid over it for per-machine flags."""
    agents = read_json(HERE / "agents.json")
    local = HERE / "agents.local.json"
    if local.exists():
        for name, extra in read_json(local).items():
            agents.setdefault(name, {}).update(extra)
    return agents


def author_prompt(task: dict) -> str:
    return (HERE / "prompts" / "author.md").read_text().replace("{{issue}}", task["problem_statement"].strip())


def checker_prompt(task: dict, diff: str) -> str:
    return (HERE / "prompts" / "checker.md").read_text().replace(
        "{{issue}}", task["problem_statement"].strip()).replace("{{diff}}", diff)


def call_agent(agent: dict, role: str, prompt: str, cwd: Path, out: Path, timeout: int) -> dict:
    """Run one headless agent call in cwd. Returns timing, usage and the final text."""
    kind = agent["kind"]
    out.mkdir(parents=True, exist_ok=True)
    (out / "prompt.md").write_text(prompt)
    start = time.monotonic()
    if kind == "stub":
        text = stub_agent(role, cwd, prompt, agent.get("strict", False))
        rec = {"exit": 0, "text": text, "usage": {}, "cost_usd": None}
    elif kind == "claude":
        tools = agent["author_tools"] if role == "author" else agent["checker_tools"]
        mode = "acceptEdits" if role == "author" else "plan"
        args = [agent.get("bin", "claude"), "-p", "--model", agent["model"], "--output-format", "json",
                "--permission-mode", mode, "--allowedTools", tools, *agent.get("extra_args", [])]
        r = subprocess.run(args, cwd=cwd, input=prompt, text=True, capture_output=True, timeout=timeout)
        (out / "stdout.json").write_text(r.stdout)
        (out / "stderr.txt").write_text(r.stderr)
        try:
            j = json.loads(r.stdout)
        except json.JSONDecodeError:
            j = {}
        rec = {"exit": r.returncode, "text": j.get("result", ""), "usage": j.get("usage", {}),
               "cost_usd": j.get("total_cost_usd"), "num_turns": j.get("num_turns")}
    elif kind == "codex":
        sandbox = "workspace-write" if role == "author" else "read-only"
        last = out / "last-message.txt"
        args = [agent.get("bin", "codex"), "exec", "-s", sandbox, "--ephemeral", "--skip-git-repo-check",
                "-m", agent["model"], "--json", "-o", str(last), *agent.get("extra_args", []), prompt]
        r = subprocess.run(args, cwd=cwd, stdin=subprocess.DEVNULL, text=True, capture_output=True, timeout=timeout)
        (out / "events.jsonl").write_text(r.stdout)
        (out / "stderr.txt").write_text(r.stderr)
        rec = {"exit": r.returncode, "text": last.read_text() if last.exists() else "",
               "usage": codex_usage(r.stdout), "cost_usd": None}
    else:
        raise SystemExit(f"unknown agent kind {kind}")
    rec["seconds"] = round(time.monotonic() - start, 1)
    rec["model"] = agent.get("model")
    rec["kind"] = kind
    return rec


def codex_usage(events: str) -> dict:
    """Sum the token counts Codex reports on turn.completed events."""
    total: dict[str, int] = {}
    for line in events.splitlines():
        try:
            e = json.loads(line)
        except json.JSONDecodeError:
            continue
        if e.get("type") == "turn.completed" and isinstance(e.get("usage"), dict):
            for k, v in e["usage"].items():
                if isinstance(v, int):
                    total[k] = total.get(k, 0) + v
    return total


def stub_agent(role: str, cwd: Path, prompt: str, strict: bool = False) -> str:
    """Offline stand-in used by the fixture dry run. The author applies the fixture's stub patch;
    the checker fails any diff that leaves a TODO in an added line. A strict stub also fails a
    diff that adds no `raise` when the issue asks for an error, so the two stubs disagree."""
    if role == "author":
        patch = cwd / ".stub-fix.patch"
        if patch.exists():
            sh(["git", "apply", patch.name], cwd=cwd)
            patch.unlink()
        return "Applied the fix."
    added = [line for line in prompt.splitlines() if line.startswith("+")]
    bad = any("TODO" in line for line in added)
    if strict and "Error" in prompt.split("<diff>")[0] and not any("raise" in line for line in added):
        bad = True
    v = {"verdict": "fail", "defects": ["added line still marked TODO"]} if bad else {"verdict": "pass", "defects": []}
    return f"<verdict>{json.dumps(v)}</verdict>"


def parse_verdict(text: str) -> dict:
    m = VERDICT.findall(text or "")
    if not m:
        return {"verdict": "inconclusive", "defects": [], "why": "no <verdict> block"}
    try:
        v = json.loads(m[-1])
    except json.JSONDecodeError:
        return {"verdict": "inconclusive", "defects": [], "why": "verdict block is not JSON"}
    if v.get("verdict") not in ("pass", "fail"):
        v["verdict"] = "inconclusive"
    return v


# ---------------------------------------------------------------- workspaces


def checkout(task: dict, dest: Path, cache: Path) -> None:
    """A clean working copy of the task's repository at its base commit."""
    if dest.exists():
        shutil.rmtree(dest)
    if task.get("fixture_dir"):
        shutil.copytree(HERE / task["fixture_dir"] / "repo", dest)
        sh(["git", "init", "-q"], cwd=dest)
        sh(["git", "add", "-A"], cwd=dest)
        sh(["git", "-c", "user.email=bench@localhost", "-c", "user.name=bench", "commit", "-qm", "base"], cwd=dest)
        stub = HERE / task["fixture_dir"] / "stub-fix.patch"
        if stub.exists():
            shutil.copy(stub, dest / ".stub-fix.patch")
        return
    mirror = cache / (task["repo"].replace("/", "__") + ".git")
    if not mirror.exists():
        sh(["git", "clone", "-q", "--mirror", f"https://github.com/{task['repo']}.git", str(mirror)])
    sh(["git", "clone", "-q", "--no-checkout", str(mirror), str(dest)])
    sh(["git", "checkout", "-q", task["base_commit"]], cwd=dest)


def test_files(task: dict) -> set[str]:
    return set(re.findall(r"^diff --git a/(\S+) ", task.get("test_patch", ""), re.M))


def author_diff(repo: Path, task: dict) -> str:
    """The author's change, without edits to files the hidden test patch touches (those would
    conflict when the hidden tests are applied) and without the stub helper."""
    sh(["git", "add", "-A"], cwd=repo)
    names = sh(["git", "diff", "--cached", "--name-only"], cwd=repo).stdout.split()
    keep = [n for n in names if n not in test_files(task) and not n.startswith(".stub")]
    if not keep:
        return ""
    return sh(["git", "diff", "--cached", "--", *keep], cwd=repo).stdout


# ---------------------------------------------------------------- run


def plan_calls(run: dict, agents: dict) -> list[dict]:
    calls = []
    authors = run["config"]["authors"]
    for tid in run["tasks"]:
        for author in authors:
            calls.append({"task": tid, "role": "author", "author": author, "agent": author})
            for checker in authors:
                calls.append({"task": tid, "role": "checker", "author": author, "agent": checker,
                              "same": checker == author})
    return calls


def cmd_run(a) -> None:
    run_dir = Path(a.run).resolve()
    run = read_json(run_dir / "run.json")
    tasks = {t["instance_id"]: t for t in read_json(run_dir / "tasks.json")}
    agents = load_agents()
    authors = run["config"]["authors"]
    if len(authors) != 2 or agents[authors[0]].get("vendor") == agents[authors[1]].get("vendor"):
        if not all(agents[x]["kind"] == "stub" for x in authors):
            raise SystemExit("config.authors must name two agents from different vendors")
    calls = plan_calls(run, agents)
    budget = run["config"].get("budget", {})
    max_calls = a.max_calls or budget.get("max_calls", len(calls))
    max_usd = budget.get("max_reported_usd")
    paid = any(agents[x]["kind"] != "stub" for x in authors)
    print(f"{len(run['tasks'])} tasks x {len(authors)} authors: {len(calls)} agent calls "
          f"(cap {max_calls}, reported-cost cap {max_usd}). Timeout {budget.get('timeout_s', 1800)} s per call.")
    if paid and not a.yes:
        print("Paid agent calls. Re-run with --yes to start.")
        return
    meta = run.setdefault("agents", {})
    for name in authors:
        ag = agents[name]
        meta[name] = {"kind": ag["kind"], "vendor": ag.get("vendor"), "model": ag.get("model"),
                      "cli": tool_version(ag.get("bin", ag["kind"])) if ag["kind"] != "stub" else "stub",
                      "extra_args": ag.get("extra_args", [])}
    run.setdefault("started", now())
    write_json(run_dir / "run.json", run)
    cache = Path(os.environ.get("CONTROLROD_BENCH_CACHE", Path.home() / ".controlrod" / "bench-cache"))
    work = run_dir / "work"
    spent_usd, made = 0.0, 0
    for c in calls:
        task = tasks[c["task"]]
        tdir = run_dir / "calls" / c["task"] / c["author"]
        rec_path = tdir / ("author.json" if c["role"] == "author" else f"check-{c['agent']}.json")
        if rec_path.exists():
            prev = read_json(rec_path)
            spent_usd += prev.get("cost_usd") or 0
            continue
        if made >= max_calls or (max_usd is not None and spent_usd >= max_usd):
            print("Budget reached; stopping. Re-run to continue from here.")
            break
        repo = work / c["task"] / c["author"]
        if c["role"] == "author":
            checkout(task, repo, cache)
            rec = guarded(agents[c["agent"]], "author", author_prompt(task), repo, tdir / "author", budget)
            diff = author_diff(repo, task)
            (tdir / "patch.diff").write_text(diff)
            rec["patch_sha256"] = sha256_bytes(diff.encode())
            rec["patch_lines"] = len(diff.splitlines())
        else:
            diff = (tdir / "patch.diff").read_text()
            if not diff.strip():
                rec = {"skipped": "empty patch", "verdict": {"verdict": "fail", "defects": ["empty patch"]},
                       "seconds": 0, "usage": {}, "cost_usd": None}
            else:
                # The checker gets a fresh copy with the patch applied, the issue and the diff:
                # never the author's reasoning, transcript or identity.
                ck = work / c["task"] / f"{c['author']}--check-{c['agent']}"
                checkout(task, ck, cache)
                stub = ck / ".stub-fix.patch"
                if stub.exists():
                    stub.unlink()
                (tdir / "apply.diff").write_text(diff)
                sh(["git", "apply", str(tdir / "apply.diff")], cwd=ck)
                rec = guarded(agents[c["agent"]], "checker", checker_prompt(task, diff), ck,
                              tdir / f"check-{c['agent']}", budget)
                rec["verdict"] = parse_verdict(rec.get("text", ""))
                rec["patch_sha256"] = sha256_bytes(diff.encode())
        rec.update({"task": c["task"], "author": c["author"], "agent": c["agent"], "role": c["role"],
                    "finished": now()})
        write_json(rec_path, rec)
        made += 1
        spent_usd += rec.get("cost_usd") or 0
        print(f"{c['task']} {c['role']} {c['agent']}"
              f"{' on ' + c['author'] if c['role'] == 'checker' else ''}: {rec.get('seconds')} s"
              f"{' ' + rec['verdict']['verdict'] if 'verdict' in rec else ''}")
    run["finished_calls"] = now()
    write_json(run_dir / "run.json", run)


def guarded(agent, role, prompt, cwd, out, budget) -> dict:
    try:
        return call_agent(agent, role, prompt, cwd, out, budget.get("timeout_s", 1800))
    except subprocess.TimeoutExpired:
        return {"exit": None, "text": "", "error": "timeout", "seconds": budget.get("timeout_s", 1800),
                "usage": {}, "cost_usd": None, "model": agent.get("model"), "kind": agent["kind"]}


# ---------------------------------------------------------------- evaluate (hidden tests)


def cmd_evaluate(a) -> None:
    run_dir = Path(a.run).resolve()
    run = read_json(run_dir / "run.json")
    tasks = {t["instance_id"]: t for t in read_json(run_dir / "tasks.json")}
    results = {}
    if run["source"]["kind"] == "fixture":
        for tid, task in tasks.items():
            for author in run["config"]["authors"]:
                results.setdefault(tid, {})[author] = eval_fixture(task, run_dir, author)
    else:
        results = eval_swebench(run, tasks, run_dir)
    write_json(run_dir / "evaluation.json", {"evaluated": now(), "results": results})
    print(f"hidden tests -> {run_dir}/evaluation.json")


def eval_fixture(task: dict, run_dir: Path, author: str) -> dict:
    """Fixture tasks: apply the patch and the hidden test patch, run the two test commands."""
    diff = (run_dir / "calls" / task["instance_id"] / author / "patch.diff").read_text()
    ws = run_dir / "work" / task["instance_id"] / f"{author}--eval"
    checkout(task, ws, Path("/nonexistent"))
    (ws / ".stub-fix.patch").unlink(missing_ok=True)
    if diff.strip():
        (ws / ".model.diff").write_text(diff)
        sh(["git", "apply", ".model.diff"], cwd=ws)
    (ws / ".test.diff").write_text(task["test_patch"])
    sh(["git", "apply", ".test.diff"], cwd=ws)

    def ok(cmd):
        return subprocess.run(cmd, cwd=ws, shell=True, capture_output=True).returncode == 0
    p2p = ok(task["pass_to_pass_cmd"])
    f2p = ok(task["fail_to_pass_cmd"])
    return {"empty": not diff.strip(), "existing_tests_pass": p2p, "resolved": p2p and f2p}


def eval_swebench(run: dict, tasks: dict, run_dir: Path) -> dict:
    """The official SWE-bench harness (MIT) in Docker, once per author. Needs Docker and uv."""
    ev = run["config"]["evaluation"]
    out = {}
    for author in run["config"]["authors"]:
        preds = run_dir / "eval" / f"{author}.jsonl"
        preds.parent.mkdir(parents=True, exist_ok=True)
        with preds.open("w") as f:
            for tid in tasks:
                diff = (run_dir / "calls" / tid / author / "patch.diff").read_text()
                f.write(json.dumps({"instance_id": tid, "model_name_or_path": author, "model_patch": diff}) + "\n")
        run_id = f"{run['run_id']}-{author}"
        args = ["uv", "run", "--with", ev["harness"], "python", "-m", "swebench.harness.run_evaluation",
                "--dataset_name", run["source"].get("dataset", ev.get("dataset_name")),
                "--predictions_path", str(preds), "--run_id", run_id,
                "--max_workers", str(ev.get("max_workers", 2)), "--instance_ids", *tasks]
        r = subprocess.run(args, cwd=run_dir / "eval", text=True, capture_output=True)
        (run_dir / "eval" / f"{author}.log").write_text(r.stdout + r.stderr)
        ver = subprocess.run(["uv", "run", "--with", ev["harness"], "python", "-c",
                              "import importlib.metadata as m; print(m.version('swebench'))"],
                             text=True, capture_output=True)
        run.setdefault("evaluation_harness", {})[author] = ver.stdout.strip() or "unknown"
        for tid in tasks:
            rep = run_dir / "eval" / "logs" / "run_evaluation" / run_id / author / tid / "report.json"
            diff = (run_dir / "calls" / tid / author / "patch.diff").read_text()
            if not rep.exists():
                out.setdefault(tid, {})[author] = {"empty": not diff.strip(), "existing_tests_pass": False,
                                                    "resolved": False, "note": "no harness report"}
                continue
            rj = read_json(rep).get(tid, {})
            p2p = rj.get("tests_status", {}).get("PASS_TO_PASS", {})
            out.setdefault(tid, {})[author] = {"empty": not diff.strip(),
                                                "existing_tests_pass": bool(rj.get("patch_successfully_applied"))
                                                and not p2p.get("failure"),
                                                "resolved": bool(rj.get("resolved"))}
    write_json(run_dir / "run.json", run)
    return out


# ---------------------------------------------------------------- review (A4, a person)


def cmd_review(a) -> None:
    """Show each patch that passed the tests and the cross-vendor checker, blind to author and
    verdicts, in seeded order. Time from showing to answer is the human time for A4."""
    run_dir = Path(a.run).resolve()
    run = read_json(run_dir / "run.json")
    tasks = {t["instance_id"]: t for t in read_json(run_dir / "tasks.json")}
    ev = read_json(run_dir / "evaluation.json")["results"]
    reviews_path = run_dir / "reviews.json"
    reviews = read_json(reviews_path) if reviews_path.exists() else {}
    queue = []
    for tid in run["tasks"]:
        for author in run["config"]["authors"]:
            other = next(x for x in run["config"]["authors"] if x != author)
            if gate(run_dir, ev, tid, author, other) and f"{tid}/{author}" not in reviews:
                queue.append((tid, author))
    random.Random(run["config"]["selection"]["seed"]).shuffle(queue)
    print(f"{len(queue)} patches to review. Answer y (would merge), n (would not), s (skip for now).")
    for i, (tid, author) in enumerate(queue, 1):
        diff = (run_dir / "calls" / tid / author / "patch.diff").read_text()
        print(f"\n===== {i}/{len(queue)}  {tid} =====\n")
        print(tasks[tid]["problem_statement"].strip()[:3000])
        print("\n----- patch -----\n" + diff)
        t0 = time.monotonic()
        ans = input("Merge this patch as is? [y/n/s] ").strip().lower()
        secs = round(time.monotonic() - t0, 1)
        if ans not in ("y", "n"):
            continue
        note = input("One-line reason (optional): ").strip()
        reviews[f"{tid}/{author}"] = {"accept": ans == "y", "seconds": secs, "note": note, "at": now()}
        write_json(reviews_path, reviews)


def check_rec(run_dir: Path, tid: str, author: str, checker: str) -> dict:
    p = run_dir / "calls" / tid / author / f"check-{checker}.json"
    return read_json(p) if p.exists() else {}


def gate(run_dir, ev, tid, author, checker) -> bool:
    e = ev.get(tid, {}).get(author, {})
    v = check_rec(run_dir, tid, author, checker).get("verdict", {}).get("verdict")
    return bool(e.get("existing_tests_pass")) and not e.get("empty") and v == "pass"


# ---------------------------------------------------------------- score


def cmd_score(a) -> None:
    run_dir = Path(a.run).resolve()
    res = score(run_dir)
    write_json(run_dir / "results.json", res)
    (run_dir / "report.md").write_text(report(res))
    (run_dir / "share.md").write_text(share(res))
    print(f"-> {run_dir}/results.json, report.md, share.md")


def score(run_dir: Path) -> dict:
    run = read_json(run_dir / "run.json")
    ev = read_json(run_dir / "evaluation.json")["results"]
    reviews = read_json(run_dir / "reviews.json") if (run_dir / "reviews.json").exists() else {}
    authors = run["config"]["authors"]
    rows = []
    for tid in run["tasks"]:
        for author in authors:
            other = next(x for x in authors if x != author)
            e = ev.get(tid, {}).get(author, {})
            ar = read_json(run_dir / "calls" / tid / author / "author.json")
            same, cross = check_rec(run_dir, tid, author, author), check_rec(run_dir, tid, author, other)
            tests_ok = bool(e.get("existing_tests_pass")) and not e.get("empty")
            rv = reviews.get(f"{tid}/{author}")
            a3 = tests_ok and cross.get("verdict", {}).get("verdict") == "pass"
            rows.append({
                "task": tid, "author": author, "resolved": bool(e.get("resolved")), "empty": bool(e.get("empty")),
                "accept": {
                    "A1": tests_ok,
                    "A2": tests_ok and same.get("verdict", {}).get("verdict") == "pass",
                    "A3": a3,
                    "A4": (a3 and rv["accept"]) if (rv or not a3) else None,
                },
                "verdict_same": same.get("verdict", {}).get("verdict"),
                "verdict_cross": cross.get("verdict", {}).get("verdict"),
                "seconds": {"author": ar.get("seconds", 0), "same": same.get("seconds", 0),
                            "cross": cross.get("seconds", 0), "human": (rv or {}).get("seconds", 0)},
                "usage": {"author": ar.get("usage", {}), "same": same.get("usage", {}), "cross": cross.get("usage", {})},
                "cost": {"author": ar.get("cost_usd"), "same": same.get("cost_usd"), "cross": cross.get("cost_usd")},
            })
    arms = {}
    for arm in ARMS:
        rs = [r for r in rows if r["accept"][arm] is not None]
        acc = [r for r in rs if r["accept"][arm]]
        bad = [r for r in rs if not r["resolved"]]
        good = [r for r in rs if r["resolved"]]
        caught = [r for r in bad if not r["accept"][arm]]
        false_rej = [r for r in good if not r["accept"][arm]]
        escaped = [r for r in acc if not r["resolved"]]
        parts = {"A1": ["author"], "A2": ["author", "same"], "A3": ["author", "cross"],
                 "A4": ["author", "cross", "human"]}[arm]
        tok = sum(sum(v for k, v in r["usage"].get(p, {}).items() if "token" in k and isinstance(v, int))
                  for r in rs for p in parts if p != "human")
        usd = [r["cost"].get(p) for r in rs for p in parts if p != "human"]
        arms[arm] = {
            "name": ARM_NAMES[arm], "patches": len(rs), "accepted": len(acc),
            "accepted_rate": rate(len(acc), len(rs)),
            "accepted_and_resolved": len(acc) - len(escaped),
            "escaped_defects": len(escaped), "escaped_share_of_accepted": rate(len(escaped), len(acc)),
            "unresolved": len(bad), "defects_caught": len(caught), "catch_rate": rate(len(caught), len(bad)),
            "resolved": len(good), "false_rejections": len(false_rej),
            "false_rejection_rate": rate(len(false_rej), len(good)),
            "agent_minutes": round(sum(r["seconds"][p] for r in rs for p in parts if p != "human") / 60, 1),
            "human_minutes": round(sum(r["seconds"]["human"] for r in rs) / 60, 1) if "human" in parts else 0,
            "tokens_reported": tok,
            "reported_usd": round(sum(x for x in usd if x is not None), 2) if any(x is not None for x in usd) else None,
        }
    # Paired: on unresolved patches the tests let through, did the same-model or the
    # cross-vendor checker catch it?
    esc1 = [r for r in rows if r["accept"]["A1"] and not r["resolved"]]
    only_cross = sum(1 for r in esc1 if r["verdict_cross"] != "pass" and r["verdict_same"] == "pass")
    only_same = sum(1 for r in esc1 if r["verdict_same"] != "pass" and r["verdict_cross"] == "pass")
    pend = sum(1 for r in rows if r["accept"]["A4"] is None)
    return {
        "run_id": run["run_id"], "scored": now(), "control_rod_commit": run.get("control_rod_commit"),
        "source": run["source"], "seed": run["config"]["selection"]["seed"], "tasks": len(run["tasks"]),
        "authors": run.get("agents", {}), "evaluation_harness": run.get("evaluation_harness"),
        "arms": arms, "rows": rows, "a4_pending_review": pend,
        "paired_on_test_escapes": {"escapes_after_tests": len(esc1), "caught_only_by_cross": only_cross,
                                   "caught_only_by_same": only_same,
                                   "mcnemar_exact_p": mcnemar_exact(only_cross, only_same)},
        "inconclusive_checks": sum(1 for r in rows for k in ("verdict_same", "verdict_cross")
                                   if r[k] not in ("pass", "fail")),
    }


def rate(k: int, n: int) -> dict:
    return {"k": k, "n": n, "value": round(k / n, 4) if n else None, "wilson95": wilson(k, n)}


def pct(r: dict) -> str:
    if r["value"] is None:
        return "n/a"
    lo, hi = r["wilson95"]
    return f"{r['k']}/{r['n']} ({r['value']:.0%}, 95% CI {lo:.0%}–{hi:.0%})"


def context_lines(res: dict) -> list[str]:
    src = res["source"]
    who = ", ".join(f"{k}: {v.get('model')} via {v.get('cli')}" for k, v in res["authors"].items())
    return [
        f"- Run `{res['run_id']}`, Control Rod `{(res['control_rod_commit'] or '')[:12]}`, scored {res['scored']}.",
        f"- Tasks: {res['tasks']} from {src.get('dataset', src.get('kind'))} "
        f"(revision `{src.get('revision', 'n/a')}`), seed {res['seed']}. Each task is solved once by each author.",
        f"- Agents: {who}.",
        "- Ground truth is the task's hidden tests. Passing them does not mean a maintainer would merge the patch.",
        "- Agent calls are not seeded; a re-run can differ. One run is one sample.",
    ]


def report(res: dict) -> str:
    L = [f"# Cross-vendor checking: {res['run_id']}", "", "## Context", "", *context_lines(res), "",
         "## Results by workflow", "",
         "| Workflow | Accepted | Defects caught (of unresolved) | Good patches rejected | "
         "Accepted but unresolved | Agent min | Human min | Tokens | Reported USD |",
         "|---|---|---|---|---|---|---|---|---|"]
    for arm in ARMS:
        x = res["arms"][arm]
        L.append(f"| {arm} {x['name']} | {pct(x['accepted_rate'])} | {pct(x['catch_rate'])} | "
                 f"{pct(x['false_rejection_rate'])} | {pct(x['escaped_share_of_accepted'])} | {x['agent_minutes']} | "
                 f"{x['human_minutes']} | {x['tokens_reported']} | {x['reported_usd'] if x['reported_usd'] is not None else 'n/a'} |")
    p = res["paired_on_test_escapes"]
    L += ["", "## Same-model versus cross-vendor, on the same patches", "",
          f"Patches the existing tests let through that the hidden tests fail: {p['escapes_after_tests']}. "
          f"Caught only by the cross-vendor checker: {p['caught_only_by_cross']}. "
          f"Caught only by the same-model checker: {p['caught_only_by_same']}. "
          f"Exact McNemar p = {p['mcnemar_exact_p'] if p['mcnemar_exact_p'] is not None else 'n/a'}.", "",
          f"Inconclusive checker answers (counted as not passing): {res['inconclusive_checks']}.",
          f"A4 patches still waiting for human review: {res['a4_pending_review']}.", "",
          "## Limits", "",
          "- Small samples give wide intervals. Read the intervals, not the point values.",
          "- Two vendors only (the two that run work in Control Rod today). Results say nothing about others.",
          "- Hidden tests can be wrong; tasks a person struck before the run are listed in excluded.json.",
          "- Authors work without the task's test environment; the Codex author can run commands in its own "
          "sandbox, the Claude author has no shell. That affects authors, not the checker comparison.",
          "- Reported USD is only what a CLI reports. Subscription use is shown as tokens.", ""]
    return "\n".join(L)


def share(res: dict) -> str:
    """Plain text for a post. Numbers and context come together, or not at all."""
    a1, a2, a3, a4 = (res["arms"][k] for k in ARMS)
    src = res["source"]
    what = (f"{res['tasks']} real GitHub issues from {src['dataset']}" if src.get("dataset")
            else f"{res['tasks']} {src.get('kind')} tasks (a dry run, not a result)")
    return "\n".join([
        f"Control Rod benchmark run {res['run_id']}: one author agent, then a checker agent, on {what}.",
        "",
        f"Tests alone accepted {pct(a1['accepted_rate'])}; {a1['escaped_defects']} of those failed the hidden tests.",
        f"A same-model checker caught {pct(a2['catch_rate'])} of the unresolved patches and rejected "
        f"{pct(a2['false_rejection_rate'])} of the good ones.",
        f"A checker from the other vendor caught {pct(a3['catch_rate'])} and rejected "
        f"{pct(a3['false_rejection_rate'])} of the good ones.",
        f"With a person signing off last: {pct(a4['accepted_rate'])} accepted, {a4['human_minutes']} human minutes.",
        "",
        "What this is not: one run, two vendors, small n, agent calls not seeded. Hidden tests are the ground "
        "truth, and passing tests is not the same as mergeable.",
        "Every input, patch, verdict and script is in the repo, so you can re-run it.",
        "",
        "Control Rod is open source and free. Try it today: https://github.com/FlyFission/Control-Rod",
        "",
    ])


# ---------------------------------------------------------------- main


def main(argv=None) -> None:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("select")
    s.add_argument("--config", required=True)
    s.add_argument("--run-id")
    s.add_argument("--out")
    s.add_argument("--force", action="store_true")
    r = sub.add_parser("run")
    r.add_argument("--run", required=True)
    r.add_argument("--yes", action="store_true", help="start paid agent calls")
    r.add_argument("--max-calls", type=int)
    for name in ("evaluate", "review", "score"):
        sub.add_parser(name).add_argument("--run", required=True)
    a = p.parse_args(argv)
    {"select": cmd_select, "run": cmd_run, "evaluate": cmd_evaluate, "review": cmd_review,
     "score": cmd_score}[a.cmd](a)


if __name__ == "__main__":
    main()
