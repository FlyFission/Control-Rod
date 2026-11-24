"""Offline tests for the benchmark harness: every rule in DESIGN.md v3.3 that code enforces, run on
fixture tasks with stub agents. No network, no model calls, no Docker.

    python3 -m unittest bench/cross-check/test_bench.py
"""

from __future__ import annotations

import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from crbench import adjudicate as adj  # noqa: E402
from crbench import agents as ag  # noqa: E402
from crbench import grading, manifest, patches, power, preflight, release, run, score, stats, workspace  # noqa: E402
from crbench.common import Refused, Study, read_json, read_jsonl, write_json  # noqa: E402
from crbench.ledger import Ledger  # noqa: E402

FIXTURE = read_json(HERE / "configs" / "fixture.json")


class Tmp(unittest.TestCase):
    """A temporary study, workspace root and HOME for each test."""

    def setUp(self):
        self._d = tempfile.mkdtemp(prefix="crb-test-")
        self.d = Path(self._d)
        self.home = self.d / "home"
        self.home.mkdir()
        self._env = mock.patch.dict(os.environ, {"HOME": str(self.home)})
        self._env.start()

    def tearDown(self):
        self._env.stop()
        workspace.remove(self.d)

    def config(self, **over) -> Path:
        cfg = json.loads(json.dumps(FIXTURE))
        cfg["caps"]["workspace_root"] = str(self.d / "ws")
        for k, v in over.items():
            tgt = cfg
            *path, last = k.split(".")
            for p in path:
                tgt = tgt[p]
            tgt[last] = v
        p = self.d / "config.json"
        p.write_text(json.dumps(cfg))
        return p

    def study(self, **over) -> Study:
        s = Study(self.d / "study")
        manifest.init_study(s, self.config(**over))
        return s

    def ready(self, s: Study, phase: str = "calibration") -> None:
        """select, preflight, probes and controls, as a person would run them."""
        if not (s.phase_dir(phase) / "manifest.json").exists():
            manifest.select(s, phase)
        self.assertTrue(preflight.preflight(s, phase)["passed"])
        if phase == "calibration":
            self.assertTrue(preflight.run_probes(s, ledger=Ledger(s))["passed"])
        cfg = s.protocol()["frozen"]["config"]
        m = manifest.load_manifest(s, phase)
        c = grading.run_controls(cfg, m["rows"], m["tasks"], workspace.workspace_root(cfg), s.dir / "cache",
                                 s.phase_dir(phase) / "eval-controls")
        self.assertTrue(c["passed"], c)
        write_json(s.phase_dir(phase) / "controls.json", c)


# ---------------------------------------------------------------------- statistics


class Stats(unittest.TestCase):
    def test_wilson(self):
        self.assertEqual(stats.wilson(0, 10), [0.0, 0.2775])
        self.assertIsNone(stats.wilson(0, 0))
        lo = stats.wilson80_lower(3, 12)
        self.assertTrue(0 < lo < 3 / 12)
        self.assertLess(stats.wilson(3, 12)[0], lo)  # the 80% interval is narrower than the 95% one

    def test_mcnemar(self):
        self.assertEqual(stats.mcnemar_exact(1, 1), 1.0)
        self.assertEqual(stats.mcnemar_exact(6, 0), 0.0312)
        self.assertIsNone(stats.mcnemar_exact(0, 0))

    def test_kappa(self):
        self.assertEqual(stats.kappa([("pass", "pass"), ("fail", "fail")]), 1.0)
        self.assertIsNone(stats.kappa([("pass", "pass"), ("pass", "pass")]))  # undefined: not estimable
        self.assertIsNone(stats.kappa([]))

    def test_bootstrap_is_seeded(self):
        data = [[1], [0], [1], [1], [0]]
        f = lambda s: sum(x[0] for x in s) / len(s)  # noqa: E731
        self.assertEqual(stats.cluster_bootstrap(data, f, 200, 7), stats.cluster_bootstrap(data, f, 200, 7))
        self.assertIsNone(stats.cluster_bootstrap(data, lambda s: None, 50, 7)["ci95"])


# ---------------------------------------------------------------------- verdicts and agents


class Verdicts(unittest.TestCase):
    def test_strict_schema(self):
        ok = '<verdict>{"verdict": "fail", "defects": [{"location": "a.py:3", "reason": "wrong"}]}</verdict>'
        self.assertEqual(ag.parse_verdict("text " + ok)[0]["verdict"], "fail")
        self.assertEqual(ag.parse_verdict('<verdict>{"verdict": "pass", "defects": []}</verdict>')[0]["verdict"], "pass")
        bad = ["no block", "<verdict>{not json}</verdict>", '<verdict>{"verdict": "maybe", "defects": []}</verdict>',
               '<verdict>{"verdict": "fail", "defects": []}</verdict>',
               '<verdict>{"verdict": "fail", "defects": ["one line"]}</verdict>',
               '<verdict>{"verdict": "pass", "defects": [], "extra": 1}</verdict>', ok + ok]
        for b in bad:
            v, why = ag.parse_verdict(b)
            self.assertIsNone(v, b)
            self.assertTrue(why)

    def test_checker_prompt_example_is_valid(self):
        text = (HERE / "prompts" / "checker.md").read_text()
        self.assertNotIn("would merge", text)
        for block in ag.VERDICT.findall(text):
            if "{{" not in block:
                self.assertIsNotNone(ag.parse_verdict(f"<verdict>{block}</verdict>")[0])

    def test_author_prompt_states_the_test_rule(self):
        self.assertIn("{{test_rule}}", (HERE / "prompts" / "author.md").read_text())


class AgentArgs(unittest.TestCase):
    def test_codex_isolation_flags(self):
        a = ag.codex_args("checker", Path("/w/repo"), Path("/w/scratch"), ["/home/u", "/study"], "m", "high",
                          Path("/c/last.txt"), {"config": {}})
        s = " ".join(a)
        for need in ("--ignore-user-config", "--ignore-rules", "--ephemeral", 'web_search="disabled"',
                     "network.enabled=false", 'approval_policy="never"', "notify=[]",
                     "check_for_update_on_startup=false", "--disable memories", "--disable multi_agent"):
            self.assertIn(need, s)
        self.assertEqual(a[-1], "-")  # prompt on stdin
        self.assertIn('"/home/u"="deny"', s)
        self.assertIn('"/w/repo"="read"', s)
        self.assertIn('"/w/scratch"="write"', s)
        author = " ".join(ag.codex_args("author", Path("/w/repo"), None, [], "m", None, Path("/l"), {"config": {}}))
        self.assertIn('"/w/repo"="write"', author)

    def test_claude_isolation_flags(self):
        a = ag.claude_args("checker", Path("/w"), ["/home/u"], "m", None, 50)
        self.assertIn("--strict-mcp-config", a)
        self.assertEqual(a[a.index("--tools") + 1], "Read,Glob,Grep,Bash")
        self.assertIn("WebSearch", a[a.index("--disallowedTools") + 1])
        self.assertIn("Agent", a[a.index("--disallowedTools") + 1])
        self.assertNotIn("plan", a)
        st = json.loads(a[a.index("--settings") + 1])
        self.assertEqual(st["sandbox"]["network"]["allowedDomains"], [])
        self.assertTrue(st["permissions"]["blockReadsOutsideWorkingDirectories"])
        self.assertIn("Read(//home/u/**)", st["permissions"]["deny"])

    def test_env_drops_billing_keys(self):
        with mock.patch.dict(os.environ, {"OPENAI_API_KEY": "x", "ANTHROPIC_API_KEY": "y", "PATH": "/bin"}):
            env = ag.clean_env({})
        self.assertNotIn("OPENAI_API_KEY", env)
        self.assertNotIn("ANTHROPIC_API_KEY", env)
        self.assertEqual(env["PYTHONDONTWRITEBYTECODE"], "1")

    def test_local_file_cannot_set_model(self):
        p = HERE / "agents.local.json"
        if p.exists():
            self.skipTest("a real agents.local.json is present")
        try:
            p.write_text(json.dumps({"codex": {"config": {"model": "other"}}}))
            with self.assertRaises(SystemExit):
                ag.load_local("codex")
            p.write_text(json.dumps({"codex": {"config": {"openai_base_url": "https://x"}}}))
            self.assertEqual(ag.local_record("codex")["config"], {"openai_base_url": "https://x"})
        finally:
            p.unlink()

    def test_usage_normalized(self):
        c = ag.norm_usage("claude", {"input_tokens": 10, "cache_creation_input_tokens": 5, "cache_read_input_tokens": 100,
                                     "output_tokens": 7})
        self.assertEqual((c["input"], c["cached_input"], c["output"], c["total"]), (15, 100, 7, 122))
        x = ag.norm_usage("codex", {"input_tokens": 110, "cached_input_tokens": 100, "output_tokens": 7})
        self.assertEqual((x["input"], x["cached_input"], x["total"]), (10, 100, 117))
        self.assertFalse(ag.norm_usage("codex", {})["known"])

    def test_failure_taxonomy(self):
        self.assertEqual(ag.classify_failure("You've hit your usage limit. Resets at 5pm", {}), "quota_paused")
        self.assertEqual(ag.classify_failure("segfault", {}), "infra_error")

    def test_timeout_kills_process_group(self):
        with self.assertRaises(subprocess.TimeoutExpired):
            ag.run_proc(["sh", "-c", "sleep 30 & sleep 30"], Path("/"), "", 1, dict(os.environ))


# ---------------------------------------------------------------------- protocol and tasks


class Protocol(Tmp):
    def test_config_refusals(self):
        for over, rule in (({"lower_bound": "wilson95"}, "§2"), ({"authors": ["stub-a"]}, "§1"),
                           ({"caps.max_calls": 0}, "§9")):
            cfg = json.loads(self.config(**over).read_text())
            with self.assertRaises(Refused) as e:
                manifest.validate_config(cfg)
            self.assertIn(rule, e.exception.rule)
        cfg = json.loads(self.config().read_text())
        cfg["snapshot"]["kind"] = "swebench"
        cfg["evaluation"] = {"harness": "swebench", "python": "3.11"}
        with self.assertRaises(Refused):
            manifest.validate_config(cfg)

    def test_same_vendor_refused(self):
        agents = read_json(HERE / "agents.json")
        agents["stub-b"]["vendor"] = "stub-a"
        p = self.d / "agents.json"
        p.write_text(json.dumps(agents))
        with self.assertRaises(Refused):
            manifest.init_study(Study(self.d / "s"), self.config(), p)

    def test_freeze(self):
        s = self.study()
        with self.assertRaises(Refused):
            manifest.init_study(s, self.config())
        proto = read_json(s.protocol_path)
        proto["frozen"]["config"]["margins"]["delta_fr"] = 0.2
        write_json(s.protocol_path, proto)
        with self.assertRaises(Refused):
            s.protocol()

    def test_selection(self):
        s = self.study(**{"selection.max_per_repo": 3, "selection.reserve": 1})
        m = manifest.select(s, "calibration")
        self.assertEqual(len(m["tasks"]), 4)
        self.assertLessEqual(max(sum(m["rows"][t]["repo"] == r for t in m["tasks"]) for r in
                                 ("fixture/lists", "fixture/lists-b")), 3)
        self.assertTrue((s.phase_dir("calibration") / "audit.md").read_text().count("FAIL_TO_PASS") >= 4)
        with self.assertRaises(Refused):
            manifest.select(s, "calibration")  # never re-drawn
        s2 = Study(self.d / "s2")
        manifest.init_study(s2, self.config(**{"selection.max_per_repo": 3, "selection.reserve": 1}))
        self.assertEqual(manifest.select(s2, "calibration")["tasks"], m["tasks"])  # seeded
        write_json(s.dir / "sizing.json", {"n_phase1": 3})
        main = manifest.select(s, "main")
        self.assertFalse(set(main["tasks"]) & (set(m["tasks"]) | set(m["reserve"])))

    def test_select_fails_when_it_cannot_fill(self):
        s = self.study(**{"selection.calibration_n": 9})
        with self.assertRaises(Refused):
            manifest.select(s, "calibration")

    def test_exclusion(self):
        s = self.study(**{"selection.reserve": 2})
        m = manifest.select(s, "calibration")
        t = m["tasks"][0]
        m2 = manifest.exclude(s, "calibration", t, "hidden test asks for more than the issue")
        self.assertNotIn(t, m2["tasks"])
        self.assertEqual(m2["tasks"][0], m["reserve"][0])
        self.assertIn(t, read_json(s.dir / "exclusions.json"))
        (s.phase_dir("calibration") / "calls" / "x").mkdir(parents=True)
        with self.assertRaises(Refused):
            manifest.exclude(s, "calibration", m2["tasks"][1], "late")

    def test_manifest_tamper(self):
        s = self.study()
        manifest.select(s, "calibration")
        p = s.phase_dir("calibration") / "manifest.json"
        m = read_json(p)
        m["tasks"].reverse()
        write_json(p, m)
        with self.assertRaises(Refused):
            manifest.load_manifest(s, "calibration")


# ---------------------------------------------------------------------- workspaces and patches


class Workspaces(Tmp):
    task = {**read_json(HERE / "fixtures" / "t1" / "task.json"), "fixture_dir": "fixtures/t1"}

    def test_export_is_one_generic_commit_outside_repo(self):
        root = workspace.workspace_root({"caps": {"workspace_root": str(self.d / "ws")}})
        repo = workspace.export_base(self.task, root, self.d / "cache")
        self.assertEqual(workspace.commit_count(repo), 1)
        log = subprocess.run(["git", "log", "--format=%an %ae %ad", "--date=iso"], cwd=repo, capture_output=True,
                             text=True).stdout
        self.assertIn("bench bench@invalid 2000-01-01", log)
        self.assertEqual(subprocess.run(["git", "remote"], cwd=repo, capture_output=True, text=True).stdout, "")
        self.assertEqual(len(repo.parent.name), 24)  # opaque nonce, no task or vendor name
        self.assertEqual(oct(root.stat().st_mode & 0o777), "0o711")

    def test_root_inside_repo_or_home_refused(self):
        for bad in (HERE / "ws", self.home / "ws"):
            with self.assertRaises(Refused):
                workspace.workspace_root({"caps": {"workspace_root": str(bad)}})

    def test_checker_tree_read_only_with_patch_uncommitted(self):
        root = workspace.workspace_root({"caps": {"workspace_root": str(self.d / "ws")}})
        patch = (HERE / "fixtures" / "t1" / "stub-fix.patch").read_text()
        repo, scratch = workspace.checker_tree(self.task, patch, root, self.d / "cache")
        self.assertIn("raise ValueError", subprocess.run(["git", "diff"], cwd=repo, capture_output=True,
                                                         text=True).stdout)
        if os.geteuid() != 0:  # root ignores file modes
            with self.assertRaises(OSError):
                (repo / "new.txt").write_text("x")
        (scratch / "ok.txt").write_text("x")

    def capture(self, edit):
        root = workspace.workspace_root({"caps": {"workspace_root": str(self.d / "ws")}})
        repo = workspace.export_base(self.task, root, self.d / "cache")
        base = workspace.base_rev(repo)
        edit(repo)
        return patches.capture(repo, base, FIXTURE["test_path_rule"]), repo, root

    def test_capture_statuses(self):
        self.assertEqual(self.capture(lambda r: None)[0]["status"], "empty")

        def fix(r):
            (r / "lists.py").write_text("def last_n(items, n):\n    return items[-n:] if n else []\n")
            (r / "__pycache__").mkdir()
            (r / "__pycache__" / "x.pyc").write_bytes(b"\0")
            (r / "data.bin").write_bytes(bytes(range(256)))
        cap, repo, root = self.capture(fix)
        self.assertEqual(cap["status"], "ok")
        self.assertNotIn("__pycache__", cap["patch"])
        self.assertIn("GIT binary patch", cap["patch"])
        ok, h = patches.reapply_ok(self.task, cap["patch"], root, self.d / "cache")
        self.assertTrue(ok)
        self.assertEqual(h, cap["sha256"])
        for edit in (lambda r: (r / "test_new.py").write_text("x"),
                     lambda r: (r / "test_existing.py").unlink(),
                     lambda r: (r / "test_existing.py").rename(r / "moved.py"),
                     lambda r: (r / "lists.py").rename(r / "test_lists.py")):
            c = self.capture(edit)[0]
            self.assertEqual(c["status"], "patch_invalid", c["changes"])


# ---------------------------------------------------------------------- ledger


class LedgerRules(Tmp):
    def test_call_cap_and_calibration_allocation(self):
        s = self.study(**{"caps.calibration_max_calls": 2, "caps.max_calls": 3})
        lg = Ledger(s)
        for i in range(2):
            lg.launch(f"c{i}", "calibration", "v", "author", 0)
            lg.done(f"c{i}", "calibration", "v", "author", {"status": "ok", "usage": {"known": False}})
        with self.assertRaises(Refused) as e:
            lg.launch("c2", "calibration", "v", "author", 0)
        self.assertIn("calibration", e.exception.rule)
        lg.launch("m0", "main", "v", "author", 0)
        with self.assertRaises(Refused) as e:
            lg.launch("m1", "main", "v", "author", 0)
        self.assertIn("call cap", e.exception.rule)

    def test_interrupted_launch_still_counts(self):
        s = self.study(**{"caps.max_calls": 2})
        lg = Ledger(s)
        lg.launch("c0", "calibration", "v", "author", 0)
        lg.launch("c0", "calibration", "v", "author", 0)  # relaunch after a crash
        self.assertEqual(lg.summary()["launched"], 2)
        self.assertTrue(any(e.get("why") == "interrupted launch" for e in lg.events()))
        with self.assertRaises(Refused):
            lg.launch("c1", "calibration", "v", "author", 0)

    def test_token_gate_phase1_only(self):
        s = self.study(**{"caps.max_tokens": 1000})
        lg = Ledger(s)
        lg.launch("c0", "calibration", "v", "checker", 0)
        lg.done("c0", "calibration", "v", "checker", {"status": "ok", "usage": {"known": True, "total": 400}})
        lg.launch("c1", "calibration", "v", "checker", 0)  # phase 0 never needs a percentile
        lg.done("c1", "calibration", "v", "checker", {"status": "ok", "usage": {"known": True, "total": 100}})
        with self.assertRaises(Refused) as e:  # used 500 + reserve 2 x 400 > 1000
            lg.launch("m0", "main", "v", "checker", 0)
        self.assertIn("token", e.exception.rule)
        lg.launch("m1", "main", "other", "checker", 0)  # unknown p95: gated on calls and time only

    def test_quota_pause_and_grace(self):
        s = self.study()
        lg = Ledger(s)
        with mock.patch("crbench.ledger.now", return_value="2026-11-24T10:00:00Z"):
            lg.launch("c0", "calibration", "v", "author", 0)
            lg.done("c0", "calibration", "v", "author", {"status": "quota_paused", "usage": {"known": False}})
            with self.assertRaises(Refused) as e:
                lg.launch("c1", "calibration", "v", "author", 0)
            self.assertIn("quota", e.exception.rule)
            lg.launch("c1", "calibration", "w", "author", 0)  # only that vendor pauses
        with mock.patch("crbench.ledger.now", return_value="2026-11-24T16:00:00Z"):
            lg.launch("c2", "calibration", "v", "author", 0)
        self.assertFalse(any(e["event"] == "halt" for e in lg.events()))
        with mock.patch("crbench.ledger.now", return_value="2026-11-25T16:00:00Z"):
            lg.done("c2", "calibration", "v", "author", {"status": "quota_paused", "usage": {"known": False}})
        self.assertTrue(any(e["event"] == "halt" for e in lg.events()))

    def test_three_infra_errors_halt(self):
        s = self.study()
        lg = Ledger(s)
        for i in range(3):
            lg.launch(f"c{i}", "calibration", "v", "author", 0)
            lg.done(f"c{i}", "calibration", "v", "author", {"status": "infra_error", "why": "boom",
                                                             "usage": {"known": False}})
        with self.assertRaises(Refused) as e:
            lg.launch("c9", "calibration", "v", "author", 0)
        self.assertIn("halt", e.exception.rule)

    def test_sign_in_error_halts(self):
        s = self.study()
        lg = Ledger(s)
        lg.launch("c0", "calibration", "v", "author", 0)
        lg.done("c0", "calibration", "v", "author", {"status": "infra_error", "why": "Not logged in",
                                                     "usage": {"known": False}})
        with self.assertRaises(Refused):
            lg.launch("c1", "calibration", "v", "author", 0)

    def test_deadline(self):
        s = self.study(**{"caps.calendar_days": 1})
        with mock.patch("crbench.ledger.now", return_value="2099-01-01T00:00:00Z"):
            with self.assertRaises(Refused) as e:
                Ledger(s).launch("c0", "calibration", "v", "author", 0)
        self.assertIn("deadline", e.exception.rule)


# ---------------------------------------------------------------------- preflight and probes


class Preflight(Tmp):
    def test_billing_keys_found_in_config_and_env(self):
        (self.home / "auth.json").write_text(json.dumps({"OPENAI_API_KEY": "sk-x", "tokens": {}}))
        (self.home / "config.toml").write_text('model = "x"\npreferred_auth_method = "apikey"\n')
        agent = {"billing_config_files": ["~/auth.json", "~/config.toml"]}
        with mock.patch.dict(os.environ, {"ANTHROPIC_API_KEY": "y"}):
            hits = preflight.scan_billing(agent)
        self.assertEqual(len(hits), 3, hits)
        self.assertFalse(any("sk-x" in h for h in hits))  # values are never recorded

    def test_auth_status_route(self):
        fake = self.d / "fakecli"
        fake.write_text("#!/bin/sh\necho 'Logged in using ChatGPT'\n")
        fake.chmod(0o755)
        root = workspace.workspace_root({"caps": {"workspace_root": str(self.d / "ws")}})
        spec = {"argv": ["login", "status"], "require": "chatgpt", "refuse": "api key"}
        self.assertTrue(preflight.auth_status({"kind": "codex", "bin": str(fake), "auth_status": spec}, root)["ok"])
        fake.write_text("#!/bin/sh\necho 'Logged in using an API key'\n")
        self.assertFalse(preflight.auth_status({"kind": "codex", "bin": str(fake), "auth_status": spec}, root)["ok"])

    def test_sealed_probe_passes_and_leaky_fails(self):
        s = self.study()
        manifest.select(s, "calibration")
        self.assertTrue(preflight.run_probes(s)["passed"])
        leaky = lambda agent, *a, **k: ag.run_call({**agent, "leaky": True}, *a, **k)  # noqa: E731
        r = preflight.run_probes(s, run_call=leaky)
        self.assertFalse(r["passed"])
        failed = {k for v in r["results"].values() for k, ok in v["checks"].items() if not ok}
        for k in ("negative: cannot read run directory", "negative: cannot read sibling workspace",
                  "negative: cannot read real HOME", "negative: cannot read other sign-in",
                  "negative: cannot read AGENTS.md"):
            self.assertIn(k, failed)
        self.assertEqual(list(self.home.iterdir()), [])  # the HOME canary is cleaned up

    def test_run_refuses_without_gates(self):
        s = self.study()
        manifest.select(s, "calibration")
        with self.assertRaises(Refused):
            run.Runner(s, "calibration").run(yes=True)


# ---------------------------------------------------------------------- grading


class Grading(Tmp):
    task = {"instance_id": "x", "FAIL_TO_PASS": ["f"], "PASS_TO_PASS": ["p"]}

    def test_judge(self):
        self.assertEqual(grading.judge(self.task, {"f": "passed", "p": "passed"})["resolved"], True)
        g = grading.judge(self.task, {"f": "failed", "p": "passed"})
        self.assertEqual((g["a1_pass"], g["resolved"]), (True, False))
        self.assertEqual(grading.judge(self.task, {"f": "passed"})["status"], "infra_error")  # absent ID
        self.assertEqual(grading.judge(self.task, None)["status"], "infra_error")  # no report
        self.assertFalse(grading.judge(self.task, {"f": "passed", "p": "skipped"})["a1_pass"])  # skip is not a pass
        with self.assertRaises(Refused):
            grading.judge({"instance_id": "y", "FAIL_TO_PASS": ["f"], "PASS_TO_PASS": []}, {})

    def test_swebench_report_parsing(self):
        p = self.d / "report.json"
        p.write_text(json.dumps({"x": {"resolved": True, "tests_status": {
            "FAIL_TO_PASS": {"success": ["f"], "failure": []}, "PASS_TO_PASS": {"success": [], "failure": ["p"]}}}}))
        self.assertEqual(grading.parse_swebench_report(p, "x"), {"f": "passed", "p": "failed"})
        self.assertIsNone(grading.parse_swebench_report(self.d / "missing.json", "x"))
        p.write_text("{}")
        self.assertIsNone(grading.parse_swebench_report(p, "x"))
        self.assertEqual(len(grading.report_paths(self.d, "r", "m", "x")), 2)

    def test_controls_pass_on_fixtures(self):
        s = self.study()
        m = manifest.select(s, "calibration")
        cfg = s.protocol()["frozen"]["config"]
        c = grading.run_controls(cfg, m["rows"], m["tasks"][:2], workspace.workspace_root(cfg), s.dir / "cache",
                                 s.dir / "eval")
        self.assertTrue(c["passed"], c)
        self.assertIn("missing_report", c["results"])


# ---------------------------------------------------------------------- the whole pipeline


class EndToEnd(Tmp):
    def test_calibration_pipeline(self):
        s = self.study(**{"selection.calibration_n": 8, "caps.calibration_max_calls": 100})  # every fixture shape
        self.ready(s)
        planned = run.Runner(s, "calibration").run()
        self.assertEqual(planned["status"], "planned")
        self.assertEqual(read_jsonl(s.ledger_path)[-1]["call"].startswith("probe"), True)  # nothing ran but probes
        r = run.Runner(s, "calibration").run(yes=True)
        self.assertEqual(r["status"], "complete", r)
        launched = r["ledger"]["launched"]
        self.assertEqual(run.Runner(s, "calibration").run(yes=True)["ledger"]["launched"], launched)  # idempotent
        stab = read_json(s.phase_dir("calibration") / "stability.json")
        self.assertEqual((stab["n_checked"], len(stab["sample"])), (16, 12))
        with self.assertRaises(Refused):
            adj.evaluate(s, "calibration")  # not before the lock
        adj.lock(s, "calibration")
        q = read_json(s.phase_dir("calibration") / "adjudication" / "queue.json")
        self.assertEqual(len(q["items"]), 4)  # t4 and t8 shapes, both authors: the strict checker alone fails them
        blob = json.dumps(q)
        for leak in ("stub-a", "stub-b", "same", "cross", "resolved"):
            self.assertNotIn(leak, blob)
        with self.assertRaises(Refused):
            adj.evaluate(s, "calibration")  # adjudication pending
        for it in q["items"]:
            adj.adjudicate(s, "calibration", it["item"], "supported", "negative n is not rejected")
        with self.assertRaises(Refused):
            adj.adjudicate(s, "calibration", q["items"][0]["item"], "unsupported", "changed my mind")
        adj.evaluate(s, "calibration")
        with self.assertRaises(Refused):
            adj.adjudicate(s, "calibration", None, None, None, skip="late")
        res = score.score(s, "calibration")
        d = res["directional"]
        self.assertEqual((d["stub-a"]["bad"]["n"], d["stub-a"]["bad"]["diff"]), (4, 0.5))
        self.assertEqual(d["stub-b"]["bad"]["diff"], -0.5)
        self.assertEqual(res["equal_author_weight"]["bad"]["point"], 0.0)
        self.assertEqual(d["stub-a"]["bad"]["discordant"], {"cross_only": 2, "same_only": 0})
        self.assertEqual(res["adjudication"]["counts"]["cross-only/bad"]["supported"], 2)
        self.assertEqual(res["stability"]["stub-a"]["flips"], 0)
        self.assertEqual(res["workflow"]["stub-a"]["A1"]["accepted"], 8)
        self.assertEqual(res["spend"]["actual_usd"], 0)
        rep = (s.phase_dir("calibration") / "report.md").read_text()
        self.assertIn("no effectiveness claim", rep)
        self.assertIn("A4 (human sign-off) is omitted", rep)

    def test_missing_grade_blocks_score(self):
        s = self.study()
        self.ready(s)
        run.Runner(s, "calibration").run(yes=True)
        adj.lock(s, "calibration")
        adj.adjudicate(s, "calibration", None, None, None, skip="calibration only")
        ev = adj.evaluate(s, "calibration")
        tid = next(iter(ev["results"]))
        a = next(iter(ev["results"][tid]))
        ev["results"][tid][a] = {"status": "infra_error", "why": "no report"}
        write_json(s.phase_dir("calibration") / "evaluation.json", ev)
        with self.assertRaises(Refused):
            score.score(s, "calibration")
        self.assertEqual(read_json(s.phase_dir("calibration") / "results.json")["status"], "incomplete")

    def test_quota_pause_resume_and_interrupt(self):
        s = self.study()
        self.ready(s)
        calls = {"n": 0}

        def flaky(agent, role, *a, **k):
            calls["n"] += 1
            if calls["n"] == 3:
                return {"status": "quota_paused", "why": "usage limit", "usage": {"known": False}, "seconds": 0}
            if calls["n"] == 5:
                raise KeyboardInterrupt
            return ag.run_call(agent, role, *a, **k)
        r = run.Runner(s, "calibration", run_call=flaky).run(yes=True)
        self.assertTrue(r["status"].startswith("paused"), r)
        with mock.patch("crbench.ledger.now", return_value="2099-01-01T00:00:00Z"), \
                self.assertRaises(Refused):  # the frozen deadline is never extended by a pause
            Ledger(s).launch("x", "calibration", "stub-a", "author", 0)
        lg = Ledger(s)
        last = [e for e in lg.events() if e["event"] == "quota_paused"][-1]
        later = last["expected_reset"].replace("Z", "") + "Z"
        with mock.patch("crbench.ledger.now", return_value=later):
            with self.assertRaises(KeyboardInterrupt):
                run.Runner(s, "calibration", run_call=flaky).run(yes=True)
            r = run.Runner(s, "calibration", run_call=flaky).run(yes=True)
        self.assertEqual(r["status"], "complete", r)
        self.assertTrue(any(e.get("why") in ("interrupted launch", "interrupted call") for e in lg.events()
                            if e["event"] == "done") or
                        any(read_json(p).get("why") == "interrupted call"
                            for p in (s.phase_dir("calibration") / "calls").glob("*/result.json")))

    def test_checker_changing_source_halts(self):
        s = self.study()
        self.ready(s)

        def vandal(agent, role, prompt, workspace_, *a, **k):
            if role == "checker":
                for p in [workspace_, *workspace_.rglob("*")]:
                    p.chmod(p.stat().st_mode | 0o200)
                (workspace_ / "lists.py").write_text("vandalized\n")
            return ag.run_call(agent, role, prompt, workspace_, *a, **k)
        r = run.Runner(s, "calibration", run_call=vandal).run(yes=True)
        self.assertTrue(r["status"].startswith("stopped"), r)
        self.assertTrue(any(e["event"] == "halt" for e in Ledger(s).events()))

    def test_model_change_stops(self):
        s = self.study()
        self.ready(s)
        n = {"i": 0}

        def drift(agent, role, *a, **k):
            rec = ag.run_call(agent, role, *a, **k)
            n["i"] += 1
            if n["i"] > 2:
                rec["model_resolved"] = "something-else"
            return rec
        r = run.Runner(s, "calibration", run_call=drift).run(yes=True)
        self.assertIn("model change", r["status"])

    def test_cli_version_change_stops(self):
        s = self.study()
        self.ready(s)
        with mock.patch("crbench.preflight.cli_version", return_value="2.0"), self.assertRaises(Refused):
            run.Runner(s, "calibration").run(yes=True)

    def full_calibration(self, s):
        self.ready(s)
        run.Runner(s, "calibration").run(yes=True)
        adj.lock(s, "calibration")
        adj.adjudicate(s, "calibration", None, None, None, skip="calibration")
        adj.evaluate(s, "calibration")
        score.score(s, "calibration")

    def test_sizing_and_release(self):
        s = self.study()
        self.full_calibration(s)
        sz = power.size(s, sims=10)
        self.assertIn(sz["designation"], ("stop", "feasibility pilot", "publication run"))
        with self.assertRaises(Refused):
            power.size(s, sims=10)  # frozen once
        # phase 1 at a fixed count, to exercise the release gate
        write_json(s.dir / "sizing.json", {**sz, "designation": "feasibility pilot", "n_phase1": 4})
        manifest.select(s, "main")
        self.ready(s, "main")
        self.assertEqual(run.Runner(s, "main").run(yes=True)["status"], "complete")
        adj.lock(s, "main")
        adj.adjudicate(s, "main", None, None, None, skip="test")
        adj.evaluate(s, "main")
        score.score(s, "main")
        m = release.release(s)
        share_md = (s.dir / "release" / "share.md").read_text()
        for need in ("FEASIBILITY PILOT", "directly, not through Control Rod's daemon", "(A4) was omitted",
                     "not adjudicated", "Open source, free"):
            self.assertIn(need, share_md)
        self.assertIn("main/results.json", m["files"])
        rel = (s.dir / "release" / "records" / "ledger.jsonl").read_text()
        self.assertNotIn(str(self.d), rel)
        with self.assertRaises(Refused):
            release.release(s)  # once

    def test_release_refuses_private_data(self):
        s = self.study()
        self.full_calibration(s)
        write_json(s.dir / "sizing.json", {"designation": "feasibility pilot", "n_phase1": 4})
        manifest.select(s, "main")
        self.ready(s, "main")
        run.Runner(s, "main").run(yes=True)
        adj.lock(s, "main")
        adj.adjudicate(s, "main", None, None, None, skip="test")
        adj.evaluate(s, "main")
        score.score(s, "main")
        call = next((s.phase_dir("main") / "calls").glob("*-a0"))
        (call / "stdout.txt").write_text("contact someone@example.com")
        with self.assertRaises(Refused) as e:
            release.release(s)
        self.assertIn("privacy", e.exception.rule)
        self.assertFalse((s.dir / "release").exists())


class Cli(Tmp):
    def test_cli_dry_path(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location("bench_cli", HERE / "bench.py")
        bench = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(bench)
        with redirect_stdout(io.StringIO()) as o:
            bench.main(["init", "--study", str(self.d / "c"), "--config", str(self.config())])
            bench.main(["select", "--study", str(self.d / "c"), "--phase", "calibration"])
            bench.main(["status", "--study", str(self.d / "c")])
        self.assertIn("launched", o.getvalue())


if __name__ == "__main__":
    unittest.main()
