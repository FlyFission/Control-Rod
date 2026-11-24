#!/usr/bin/env python3
"""Control Rod's cross-vendor checking benchmark (design: DESIGN.md v3.3). Started by hand, every time.

    python3 bench/cross-check/bench.py init --study DIR --config configs/fixture.json
    ... select, exclude, preflight, probe, controls, run, lock, adjudicate, evaluate, score, size, release

See README.md for the order and what each step refuses."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from crbench import adjudicate as adj  # noqa: E402
from crbench import grading, manifest, power, preflight, release, run, score  # noqa: E402
from crbench.common import HERE, PHASES, Study, stamp, write_json  # noqa: E402
from crbench.ledger import Ledger  # noqa: E402
from crbench.workspace import workspace_root  # noqa: E402


def out(x) -> None:
    print(json.dumps(x, indent=2, sort_keys=True, default=str))


def controls(study: Study, phase: str) -> dict:
    """Base, gold and known-bad controls for every task of the phase, bound to its manifest."""
    cfg = study.protocol()["frozen"]["config"]
    m = manifest.load_manifest(study, phase)
    lg = Ledger(study)
    with lg.run_lock():
        root = workspace_root(cfg, study.dir)
        r = grading.run_controls(cfg, m["rows"], m["tasks"], root, study.dir / "cache",
                                 study.phase_dir(phase) / "eval-controls", preflight.denied_paths(study, root),
                                 m["source"].get("file_sha256"))
        r["stamp"] = stamp(study, phase)
        write_json(study.phase_dir(phase) / "controls.json", r)
        (study.phase_dir(phase) / "controls.md").write_text(grading.controls_md(r))
    return r


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(prog="bench", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    def cmd(name, phase=False, **kw):
        p = sub.add_parser(name, **kw)
        p.add_argument("--study", required=True, help="study directory (outside the repo is fine)")
        if phase:
            p.add_argument("--phase", required=True, choices=PHASES)
        return p

    p = cmd("init", help="freeze the protocol: config, agents, prompts, commit")
    p.add_argument("--config", required=True)
    p.add_argument("--agents", default=str(HERE / "agents.json"))
    cmd("select", phase=True, help="draw the phase's tasks and write audit.md")
    p = cmd("exclude", phase=True, help="strike a defective task before any agent runs")
    p.add_argument("--task", required=True)
    p.add_argument("--reason", required=True)
    p = cmd("preflight", phase=True, help="billing route, sign-in, CLI versions, host, Docker")
    p.add_argument("--confirm-overage-off", action="store_true",
                   help="you checked that paid overage / extra usage is off on both subscriptions")
    cmd("probe", help="isolation probes for every vendor and role (phase 0)")
    cmd("controls", phase=True, help="grade base, gold, known-bad and missing-report controls")
    p = cmd("run", phase=True, help="author and checker calls; prints the plan unless --yes")
    p.add_argument("--yes", action="store_true", help="start the calls")
    cmd("lock", phase=True, help="hash and lock every verdict, then build the adjudication queue")
    p = cmd("adjudicate", phase=True, help="record one blind judgment, or skip adjudication")
    p.add_argument("--item")
    p.add_argument("--judgment", choices=adj.JUDGMENTS)
    p.add_argument("--note")
    p.add_argument("--skip", metavar="REASON")
    cmd("evaluate", phase=True, help="hidden-test grading, after lock and adjudication")
    cmd("score", phase=True, help="completeness check, then results.json and report.md")
    p = cmd("size", help="power.py sizing from calibration; frozen once written")
    p.add_argument("--sims", type=int, default=power.SIMS)
    p = cmd("release", help="privacy scan, digests, transcript asset and share.md")
    p.add_argument("--confirm-redistribution", action="store_true",
                   help="you checked the task repositories' licences allow redistributing their code")
    cmd("status", help="ledger summary")
    a = ap.parse_args(argv)
    study = Study(Path(a.study))

    if a.cmd == "init":
        proto = manifest.init_study(study, Path(a.config), Path(a.agents))
        out({"frozen_sha256": proto["frozen_sha256"], "study": str(study.dir)})
    elif a.cmd == "select":
        m = manifest.select(study, a.phase)
        out({"tasks": m["tasks"], "reserve": m["reserve"], "audit": str(study.phase_dir(a.phase) / "audit.md")})
    elif a.cmd == "exclude":
        m = manifest.exclude(study, a.phase, a.task, a.reason)
        out({"tasks": m["tasks"], "replaced": m["replaced"]})
    elif a.cmd == "preflight":
        r = preflight.preflight(study, a.phase, a.confirm_overage_off)
        out(r)
        sys.exit(0 if r["passed"] else 1)
    elif a.cmd == "probe":
        r = preflight.run_probes(study, ledger=Ledger(study))
        out(r)
        sys.exit(0 if r["passed"] else 1)
    elif a.cmd == "controls":
        r = controls(study, a.phase)
        out(r)
        sys.exit(0 if r["passed"] else 1)
    elif a.cmd == "run":
        r = run.Runner(study, a.phase).run(yes=a.yes)
        out(r)
        sys.exit(0 if r["status"] in ("planned", "complete") else 1)
    elif a.cmd == "lock":
        r = adj.lock(study, a.phase)
        out({"locked": r["sha256"], "rows": len(r["rows"])})
    elif a.cmd == "adjudicate":
        out(adj.adjudicate(study, a.phase, a.item, a.judgment, a.note, a.skip))
    elif a.cmd == "evaluate":
        r = adj.evaluate(study, a.phase)
        out({k: {x: v["status"] for x, v in r["results"][k].items()} for k in r["results"]})
    elif a.cmd == "score":
        r = score.score(study, a.phase)
        out({"designation": r["designation"], "equal_author_weight": r["equal_author_weight"],
             "report": str(study.phase_dir(a.phase) / "report.md")})
    elif a.cmd == "size":
        out(power.size(study, a.sims))
    elif a.cmd == "release":
        out(release.release(study, a.confirm_redistribution))
    elif a.cmd == "status":
        out(Ledger(study).summary())


if __name__ == "__main__":
    main()
