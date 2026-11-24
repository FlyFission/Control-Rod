"""Offline tests for the benchmark harness: every rule in DESIGN.md v3.3 that code enforces, run on
fixture tasks with stub agents. No network, no model calls, no Docker.

    python3 -m unittest bench/cross-check/test_bench.py
"""

from __future__ import annotations

import importlib.util
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
from crbench import confine, grading, manifest, patches, power, preflight, release, run, score, stats, workspace  # noqa: E402
from crbench.common import Refused, Study, digest, load_sizing, read_json, read_jsonl, write_json  # noqa: E402
from crbench.ledger import Ledger, pause_of  # noqa: E402

FIXTURE = read_json(HERE / "configs" / "fixture.json")
_spec = importlib.util.spec_from_file_location("bench_cli", HERE / "bench.py")
bench_cli = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bench_cli)


def freeze_sizing(s: Study, n: int, **extra) -> None:
    rec = {"n_phase1": n, "designation": "feasibility pilot", "study_sha256": s.protocol()["frozen_sha256"], **extra}
    rec["sha256"] = digest(rec)
    write_json(s.dir / "sizing.json", rec)


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
        c = bench_cli.controls(s, phase)
        self.assertTrue(c["passed"], c)


# ---------------------------------------------------------------------- statistics


class Stats(unittest.TestCase):
    def test_wilson(self):
        lo, hi = stats.wilson(0, 10)
        self.assertEqual(lo, 0.0)
        self.assertAlmostEqual(hi, 0.27753, places=5)  # full precision; only reports round
        self.assertIsNone(stats.wilson(0, 0))
        lo = stats.wilson80_lower(3, 12)
        self.assertTrue(0 < lo < 3 / 12)
        self.assertLess(stats.wilson(3, 12)[0], lo)  # the 80% interval is narrower than the 95% one

    def test_mcnemar(self):
        self.assertEqual(stats.mcnemar_exact(1, 1), 1.0)
        self.assertEqual(stats.mcnemar_exact(6, 0), 0.03125)
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


AGENTS = read_json(HERE / "agents.json")


class AgentArgs(unittest.TestCase):
    def test_codex_isolation_flags(self):
        codex = AGENTS["codex"]
        a = ag.codex_args(codex, "checker", Path("/w/repo"), Path("/w/scratch"), ["/home/u", "/home/u/x", "/study"],
                          Path("/c/last.txt"))
        s = " ".join(a)
        for need in ("--ignore-user-config", "--ignore-rules", "--ephemeral", 'web_search="disabled"',
                     "permissions.control-rod.network.enabled=false", 'approval_policy="never"', "notify=[]",
                     "check_for_update_on_startup=false", "--disable memories", "--disable multi_agent",
                     "--disable hooks", '":root"="read"'):
            self.assertIn(need, s)
        self.assertEqual(a[-1], "-")  # prompt on stdin
        self.assertIn('"/home/u"="deny"', s)
        self.assertNotIn('"/home/u/x"="deny"', s)  # outermost denials only
        self.assertIn('"/w/repo"="read"', s)
        self.assertIn('"/w/scratch"="write"', s)
        author = " ".join(ag.codex_args(codex, "author", Path("/w/repo"), None, [], Path("/l")))
        self.assertIn('extends=":workspace"', author)
        self.assertNotIn('":root"', author)

    def test_claude_isolation_flags(self):
        claude = dict(AGENTS["claude"])
        a = ag.claude_args(claude, "checker", Path("/w/repo"), Path("/w/scratch"), ["/home/u", "/w"])
        self.assertIn("--strict-mcp-config", a)
        self.assertEqual(a[a.index("--output-format") + 1], "stream-json")
        self.assertEqual(a[a.index("--tools") + 1], "Read,Glob,Grep,Bash")
        self.assertIn("WebSearch", a[a.index("--disallowedTools") + 1])
        self.assertIn("Agent", a[a.index("--disallowedTools") + 1])
        self.assertEqual(a[a.index("--add-dir") + 1], "/w/scratch")
        st = json.loads(a[a.index("--settings") + 1])
        self.assertEqual(st["sandbox"]["network"]["allowedDomains"], [])
        self.assertTrue(st["permissions"]["blockReadsOutsideWorkingDirectories"])
        self.assertIn("Read(//home/u/**)", st["permissions"]["deny"])
        self.assertNotIn("Read(//w/**)", st["permissions"]["deny"])  # contains the workspace: left to the outer layer

    def test_env_drops_billing_keys(self):
        with mock.patch.dict(os.environ, {"OPENAI_API_KEY": "x", "ANTHROPIC_API_KEY": "y", "ANTHROPIC_BASE_URL": "z",
                                          "PATH": "/bin"}):
            env = ag.clean_env({})
        for k in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL"):
            self.assertNotIn(k, env)
        self.assertEqual(env["PYTHONDONTWRITEBYTECODE"], "1")

    def test_local_file_cannot_set_model_or_free_transport(self):
        with tempfile.TemporaryDirectory() as d, mock.patch.object(ag, "HERE", Path(d)):
            p = Path(d) / "agents.local.json"
            codex = AGENTS["codex"]
            p.write_text(json.dumps({"codex": {"config": {"model": "other"}}}))
            with self.assertRaises(SystemExit):
                ag.load_local("codex", codex)
            p.write_text(json.dumps({"codex": {"config": {"openai_base_url": "https://evil.example"}}}))
            with self.assertRaises(SystemExit):
                ag.load_local("codex", codex)
            ok = codex["transport_allow"]["openai_base_url"][0]
            p.write_text(json.dumps({"codex": {"config": {"openai_base_url": ok}}}))
            self.assertEqual(ag.local_record("codex", codex)["config"], {"openai_base_url": ok})

    def test_usage_normalized(self):
        c = ag.norm_usage("claude", {"input_tokens": 10, "cache_creation_input_tokens": 5, "cache_read_input_tokens": 100,
                                     "output_tokens": 7})
        self.assertEqual((c["input"], c["cached_input"], c["output"], c["total"]), (15, 100, 7, 122))
        x = ag.norm_usage("codex", {"input_tokens": 110, "cached_input_tokens": 100, "output_tokens": 7})
        self.assertEqual((x["input"], x["cached_input"], x["total"]), (10, 100, 117))
        self.assertFalse(ag.norm_usage("codex", {})["known"])
        self.assertFalse(ag.norm_usage("codex", {"input_tokens": "x", "output_tokens": 1})["known"])

    def test_failure_taxonomy(self):
        q = ag.classify_failure("You've hit your usage limit. Try again in 3 hours.", {})
        self.assertEqual(q["status"], "quota_paused")
        self.assertEqual(ag.classify_failure("segfault", {}), {"status": "infra_error"})
        self.assertTrue(ag.classify_failure("Error: not logged in", {}).get("auth"))

    def test_pass_with_defects_is_malformed(self):
        v = ag.parse_verdict('<verdict>{"verdict": "pass", "defects": [{"location": "a.py:1", "reason": "x"}]}</verdict>')
        self.assertIsNone(v[0])

    def test_timeout_kills_process_group(self):
        with tempfile.TemporaryDirectory() as d:
            rc, stop = ag.run_proc(["sh", "-c", "sleep 30 & sleep 30"], Path("/"), "", 1, dict(os.environ),
                                   Path(d) / "o", Path(d) / "e")
        self.assertEqual(stop, "timeout")
        self.assertIsNone(rc)

    def test_output_cap_is_enforced_while_running(self):
        with tempfile.TemporaryDirectory() as d:
            rc, stop = ag.run_proc(["sh", "-c", "yes x"], Path("/"), "", 30, dict(os.environ),
                                   Path(d) / "o", Path(d) / "e", cap=100_000)
            self.assertEqual(stop, "output cap")
            self.assertLessEqual((Path(d) / "o").stat().st_size, 100_000)
            big = Path(d) / "big"
            big.write_bytes(b"x" * 5000)
            self.assertEqual(len(ag.read_capped(big, cap=100)), 100)

    def test_bool_usage_is_unknown(self):
        self.assertFalse(ag.norm_usage("codex", {"input_tokens": True, "output_tokens": 1})["known"])

    def test_quota_is_classified_before_sign_in(self):
        q = ag.classify_failure("Not logged in to the org's plan: usage limit reached, try again in 2 hours", {})
        self.assertEqual(q["status"], "quota_paused")

    def test_cli_denies_name_every_sibling_but_not_its_own_dirs(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            mine, other, priv = root / "m", root / "o", root / "p"
            for x in (mine / "repo", other / "repo", priv):
                x.mkdir(parents=True)
            ws = {"workspace": mine / "repo", "private": priv, "scratch": None, "deny": [str(root), "/etc/secret"]}
            deny = ag.cli_denies(ws)
            self.assertIn(confine.canonical(other), deny)
            self.assertIn("/etc/secret", deny)
            self.assertNotIn(confine.canonical(root), deny)  # it contains the call's own dirs
            self.assertNotIn(confine.canonical(mine), deny)

    def test_seatbelt_profile_allows_dns_and_ptys_and_keeps_read_only(self):
        p = confine.seatbelt_profile(["/d"], ["/d/a"], ["/w"], True, read_only=["/w/src"])
        self.assertIn("mDNSResponder", p)
        self.assertIn("/dev/ptmx", p)
        self.assertLess(p.index('(allow file-write* (subpath "/w"))'), p.rindex('(deny file-write* (subpath "/w/src"))'))
        self.assertNotIn("mDNSResponder", confine.seatbelt_profile([], [], [], False))


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
        with self.assertRaises(Refused):
            manifest.select(s, "main")  # an unsigned sizing file is refused
        freeze_sizing(s, 3)
        with self.assertRaises(Refused):
            manifest.select(s, "main")  # 3 left, but 3 plus a reserve of 1 are needed: the reserve must fill
        (s.dir / "sizing.json").unlink()
        freeze_sizing(s, 2)
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
        self.assertIn("stratum", manifest.load_manifest(s, "calibration")["replaced"][t])
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

    def test_root_inside_repo_home_or_study_refused(self):
        for bad in (HERE / "ws", self.home / "ws"):
            with self.assertRaises(Refused):
                workspace.workspace_root({"caps": {"workspace_root": str(bad)}})
        with self.assertRaises(Refused):
            workspace.workspace_root({"caps": {"workspace_root": str(self.d / "study" / "ws")}}, self.d / "study")

    def test_root_through_a_symlink_is_resolved(self):
        """macOS /var is a link to /private/var; the root must be the real path so confinement rules match."""
        (self.d / "real").mkdir()
        os.symlink(self.d / "real", self.d / "link")
        root = workspace.workspace_root({"caps": {"workspace_root": str(self.d / "link" / "ws")}})
        self.assertEqual(root, (self.d / "real" / "ws").resolve())

    def test_base_tree_matches_and_git_ignores_hooks(self):
        root = workspace.workspace_root({"caps": {"workspace_root": str(self.d / "ws")}})
        repo = workspace.export_base(self.task, root, self.d / "cache")
        hook = repo / ".git" / "hooks" / "pre-commit"
        hook.parent.mkdir(parents=True, exist_ok=True)
        hook.write_text("#!/bin/sh\ntouch HOOK_RAN\nexit 1\n")
        hook.chmod(0o755)
        (repo / "x.txt").write_text("x")
        workspace._gitb(["add", "-A"], repo)
        workspace._gitb(["commit", "-q", "-m", "x"], repo)
        self.assertFalse((repo / "HOOK_RAN").exists())

    def test_checker_tree_read_only_with_patch_staged(self):
        root = workspace.workspace_root({"caps": {"workspace_root": str(self.d / "ws")}})
        patch = (HERE / "fixtures" / "t1" / "stub-fix.patch").read_bytes()
        repo, scratch = workspace.checker_tree(self.task, patch, root, self.d / "cache")
        self.assertIn("raise ValueError", subprocess.run(["git", "diff", "HEAD"], cwd=repo, capture_output=True,
                                                         text=True).stdout)
        if os.geteuid() != 0:  # root ignores file modes
            with self.assertRaises(OSError):
                (repo / "new.txt").write_text("x")
        (scratch / "ok.txt").write_text("x")

    def capture(self, edit):
        root = workspace.workspace_root({"caps": {"workspace_root": str(self.d / "ws")}})
        repo = workspace.export_base(self.task, root, self.d / "cache")
        edit(repo)
        return patches.capture(repo, self.task, root, self.d / "cache", FIXTURE["test_path_rule"]), repo, root

    def test_capture_statuses(self):
        self.assertEqual(self.capture(lambda r: None)[0]["status"], "empty")

        def fix(r):
            (r / "lists.py").write_text("def last_n(items, n):\n    return items[-n:] if n else []\n")
            (r / "__pycache__").mkdir()
            (r / "__pycache__" / "x.pyc").write_bytes(b"\0")
            (r / "data.bin").write_bytes(bytes(range(256)))
            os.symlink("lists.py", r / "alias.py")
        cap, repo, root = self.capture(fix)
        self.assertEqual(cap["status"], "ok")
        self.assertIsInstance(cap["patch"], bytes)
        self.assertNotIn(b"__pycache__", cap["patch"])
        self.assertIn(b"GIT binary patch", cap["patch"])
        self.assertIn(b"new file mode 120000", cap["patch"])  # a link is captured as a link
        ok, got = patches.reapply_ok(self.task, cap["patch"], cap["tree_oid"], root, self.d / "cache")
        self.assertTrue(ok)
        self.assertEqual(got, cap["tree_oid"])
        for edit in (lambda r: (r / "test_new.py").write_text("x"),
                     lambda r: (r / "test_existing.py").unlink(),
                     lambda r: (r / "test_existing.py").rename(r / "moved.py"),
                     lambda r: (r / "lists.py").rename(r / "test_lists.py"),
                     lambda r: ((r / "tests").mkdir(), (r / "tests" / "x.py").write_text("x"))):
            c = self.capture(edit)[0]
            self.assertEqual(c["status"], "patch_invalid", c["changes"])

    def test_capture_never_reads_the_authors_git_dir(self):
        def poison(r):
            (r / "lists.py").write_text("def last_n(items, n):\n    return []\n")
            (r / ".git" / "config").write_text("[core]\n\tfsmonitor = touch FSMON_RAN\n")
        cap, repo, root = self.capture(poison)
        self.assertEqual(cap["status"], "ok")
        self.assertFalse((repo / "FSMON_RAN").exists())


# ---------------------------------------------------------------------- ledger


class LedgerRules(Tmp):
    def ok(self, lg, call, phase="calibration", vendor="v", role="author", rec=None):
        lid = lg.launch(call, phase, vendor, role, 0)
        lg.done(lid, rec or {"status": "ok", "usage": {"known": False}})
        return lid

    def test_call_cap_and_calibration_allocation(self):
        s = self.study(**{"caps.calibration_max_calls": 2, "caps.max_calls": 3})
        lg = Ledger(s)
        for i in range(2):
            self.ok(lg, f"c{i}")
        with self.assertRaises(Refused) as e:
            lg.launch("c2", "calibration", "v", "author", 0)
        self.assertIn("calibration", e.exception.rule)
        lg.launch("m0", "main", "v", "author", 0)
        with self.assertRaises(Refused) as e:
            lg.launch("m1", "main", "v", "author", 0)
        self.assertIn("call cap", e.exception.rule)

    def test_every_attempt_has_its_own_id_and_interrupted_ones_count(self):
        s = self.study(**{"caps.max_calls": 2, "caps.calibration_max_calls": 2})
        lg = Ledger(s)
        a = lg.launch("c0", "calibration", "v", "author", 0)
        b = lg.launch("c0", "calibration", "v", "author", 1)  # same call, next attempt
        self.assertNotEqual(a, b)
        self.assertTrue(lg.reconcile(a))
        self.assertFalse(lg.reconcile(a))  # closed once
        self.assertEqual(lg.state()["dones"][a]["status"], "infra_error")
        self.assertEqual(lg.summary()["launched"], 2)
        with self.assertRaises(Refused):
            lg.launch("c1", "calibration", "v", "author", 0)

    def test_run_lock_is_exclusive(self):
        s = self.study()
        with Ledger(s).run_lock():
            with self.assertRaises(Refused):
                with Ledger(s).run_lock():
                    pass

    def test_token_gate_uses_frozen_phase0_p95(self):
        s = self.study(**{"caps.max_tokens": 1000})
        lg = Ledger(s)
        self.ok(lg, "c0", role="checker", rec={"status": "ok", "usage": {"known": True, "total": 400}})
        self.ok(lg, "c1", role="checker", rec={"status": "ok", "usage": {"known": True, "total": 100}})
        lg.launch("m0", "main", "v", "checker", 0)  # no frozen sizing yet: gated on calls and time only
        self.assertEqual(lg.calibration_p95(), {"v/checker": 400})
        freeze_sizing(s, 1, token_p95=lg.calibration_p95())
        with self.assertRaises(Refused) as e:  # used 500 + reserve 2 x 400 > 1000
            lg.launch("m1", "main", "v", "checker", 0)
        self.assertIn("token", e.exception.rule)
        lg.launch("m2", "main", "other", "checker", 0)  # unknown p95: gated on calls and time only

    def test_probes_are_left_out_of_the_p95(self):
        s = self.study()
        lg = Ledger(s)
        self.ok(lg, "probe--x", role="checker", rec={"status": "ok", "usage": {"known": True, "total": 9000}})
        self.ok(lg, "c0", role="checker", rec={"status": "ok", "usage": {"known": True, "total": 10}})
        self.assertEqual(lg.calibration_p95(), {"v/checker": 10})

    def test_quota_pause_order_and_grace(self):
        s = self.study()
        lg = Ledger(s)
        with mock.patch("crbench.ledger.now", return_value="2026-11-24T10:00:00Z"):
            self.ok(lg, "c0", rec={"status": "quota_paused", "usage": {"known": False}, "reset_hours": 2})
            with self.assertRaises(Refused) as e:
                lg.launch("c1", "calibration", "v", "author", 0)
            self.assertIn("quota", e.exception.rule)
            lg.launch("c1", "calibration", "w", "author", 0)  # only that vendor pauses
        with mock.patch("crbench.ledger.now", return_value="2026-11-24T12:30:00Z"):  # the CLI's own reset time
            c2 = lg.launch("c2", "calibration", "v", "author", 0)
        self.assertIsNone(lg.state()["halted"])
        with mock.patch("crbench.ledger.now", return_value="2026-11-25T13:00:00Z"):  # 25 h past the first reset
            lg.done(c2, {"status": "quota_paused", "usage": {"known": False}})
        self.assertIsNotNone(lg.state()["halted"])

    def test_a_later_success_clears_a_pause(self):
        s = self.study()
        lg = Ledger(s)
        with mock.patch("crbench.ledger.now", return_value="2026-11-24T10:00:00Z"):
            self.ok(lg, "c0", rec={"status": "quota_paused", "usage": {"known": False}, "reset_hours": 1})
        with mock.patch("crbench.ledger.now", return_value="2026-11-24T11:30:00Z"):
            self.ok(lg, "c1")
        with mock.patch("crbench.ledger.now", return_value="2026-11-26T10:00:00Z"):
            lid = lg.launch("c2", "calibration", "v", "author", 0)
            lg.done(lid, {"status": "quota_paused", "usage": {"known": False}})  # a new pause, not past grace
        self.assertIsNone(lg.state()["halted"])

    def test_three_infra_errors_halt(self):
        s = self.study()
        lg = Ledger(s)
        for i in range(3):
            self.ok(lg, f"c{i}", rec={"status": "infra_error", "why": "boom", "usage": {"known": False}})
        with self.assertRaises(Refused) as e:
            lg.launch("c9", "calibration", "v", "author", 0)
        self.assertIn("halt", e.exception.rule)

    def test_sign_in_error_halts(self):
        s = self.study()
        lg = Ledger(s)
        self.ok(lg, "c0", rec={"status": "infra_error", "auth": True, "why": "Not logged in", "usage": {"known": False}})
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
        with mock.patch.dict(os.environ, {"ANTHROPIC_API_KEY": "y", "HOME": str(self.home), "PATH": "/bin"}, clear=True):
            hits = preflight.scan_billing(agent)
        self.assertEqual(len(hits), 3, hits)
        self.assertFalse(any("sk-x" in h for h in hits))  # values are never recorded

    def test_a_shallow_home_is_still_denied(self):
        s = self.study()
        with mock.patch("pathlib.Path.home", return_value=Path("/root")):
            d = preflight.denied_paths(s, workspace.workspace_root(s.protocol()["frozen"]["config"], s.dir))
        self.assertIn(confine.canonical("/root"), d)  # a Linux root user's HOME has only two parts
        self.assertNotIn("/", d)

    def test_auth_status_route(self):
        fake = self.d / "fakecli"
        fake.write_text("#!/bin/sh\necho 'Logged in using ChatGPT'\n")
        fake.chmod(0o755)
        root = workspace.workspace_root({"caps": {"workspace_root": str(self.d / "ws")}})
        spec = {"argv": ["login", "status"], "require": "chatgpt", "refuse": "api key"}
        self.assertTrue(preflight.auth_status({"kind": "codex", "bin": str(fake), "auth_status": spec}, root)["ok"])
        fake.write_text("#!/bin/sh\necho 'Logged in using an API key'\n")
        self.assertFalse(preflight.auth_status({"kind": "codex", "bin": str(fake), "auth_status": spec}, root)["ok"])

    def test_probes_need_a_matching_preflight(self):
        s = self.study()
        manifest.select(s, "calibration")
        with self.assertRaises(Refused):
            preflight.run_probes(s)
        self.assertTrue(preflight.preflight(s, "calibration")["passed"])
        rec = read_json(s.phase_dir("calibration") / "preflight.json")
        rec["stamp"]["harness_sha256"] = "0" * 64
        write_json(s.phase_dir("calibration") / "preflight.json", rec)
        with self.assertRaises(Refused):
            preflight.run_probes(s)

    def test_sealed_probe_passes_and_leaky_or_lazy_fails(self):
        s = self.study()
        manifest.select(s, "calibration")
        preflight.preflight(s, "calibration")
        r = preflight.run_probes(s)
        self.assertTrue(r["passed"], {k: [c for c, ok in v["checks"].items() if not ok] for k, v in r["results"].items()})
        if confine.mechanism():
            self.assertTrue(all(v["harness_probes"] == confine.mechanism() for v in r["results"].values()))
            self.assertTrue(any(k.startswith("negative: cannot read real HOME") for v in r["results"].values()
                                for k in v["checks"]))
        leaky = lambda agent, *a, **k: ag.run_call({**agent, "leaky": True}, *a, **k)  # noqa: E731
        r = preflight.run_probes(s, run_call=leaky)
        self.assertFalse(r["passed"])
        failed = {k for v in r["results"].values() for k, ok in v["checks"].items() if not ok}
        for k in ("agent: did not read run directory", "agent: did not read sibling workspace",
                  "agent: did not read real HOME", "agent: did not read other vendor's sign-in"):
            self.assertIn(k, failed)
        lazy = lambda agent, *a, **k: ag.run_call({**agent, "lazy": True}, *a, **k)  # noqa: E731
        r = preflight.run_probes(s, run_call=lazy)
        self.assertFalse(r["passed"])  # a probe that never tried proves nothing
        failed = {k for v in r["results"].values() for k, ok in v["checks"].items() if not ok}
        self.assertIn("agent: tried to read real HOME", failed)
        self.assertIn("agent: tried shell network", failed)
        self.assertFalse([p for p in self.home.iterdir() if p.name.startswith(".cr-bench-probe")])  # canary cleaned up

    def test_run_refuses_without_gates(self):
        s = self.study()
        manifest.select(s, "calibration")
        with self.assertRaises(Refused):
            run.Runner(s, "calibration").run(yes=True)


# ---------------------------------------------------------------------- confinement


@unittest.skipUnless(confine.mechanism(), "no Seatbelt or bwrap on this host")
class Confinement(Tmp):
    def sh(self, cmd, **kw):
        argv, rec = confine.wrap(["/bin/sh", "-c", cmd], **kw)
        return subprocess.run(argv, capture_output=True, text=True, timeout=30)

    def test_deny_then_allow_back(self):
        outer = self.d / "outer"
        own, sib = outer / "own", outer / "sib"
        own.mkdir(parents=True)
        sib.mkdir()
        (own / "f").write_text("OWN")
        (sib / "f").write_text("SIB")
        kw = {"deny_read": [outer], "allow_read": [own], "writable": [own]}
        self.assertIn("OWN", self.sh(f"cat '{own}/f'", **kw).stdout)
        r = self.sh(f"cat '{sib}/f'", **kw)
        self.assertNotIn("SIB", r.stdout)
        self.assertEqual(self.sh(f"echo x > '{sib}/new'", **kw).returncode != 0, True)
        self.assertFalse((sib / "new").exists())

    def test_read_only_tree(self):
        tree = self.d / "tree"
        tree.mkdir()
        (tree / "a").write_text("A")
        scratch = self.d / "scratch"
        scratch.mkdir()
        kw = {"deny_read": [], "allow_read": [tree], "writable": [scratch], "read_only": [tree]}
        self.assertIn("A", self.sh(f"cat '{tree}/a'", **kw).stdout)
        self.assertNotEqual(self.sh(f"echo x > '{tree}/b'", **kw).returncode, 0)
        self.assertEqual(self.sh(f"echo x > '{scratch}/b'", **kw).returncode, 0)

    def test_no_network(self):
        r = self.sh("python3 -c \"import socket; socket.create_connection(('1.1.1.1', 53), 3)\"",
                    deny_read=[], allow_read=[], writable=[], network=False)
        self.assertNotEqual(r.returncode, 0)


# ---------------------------------------------------------------------- grading


class Grading(Tmp):
    task = {"instance_id": "x", "FAIL_TO_PASS": ["f"], "PASS_TO_PASS": ["p"]}

    def test_judge(self):
        self.assertEqual(grading.judge(self.task, {"f": "passed", "p": "passed"})["resolved"], True)
        g = grading.judge(self.task, {"f": "failed", "p": "passed"})
        self.assertEqual((g["a1_pass"], g["resolved"]), (True, False))
        self.assertEqual(grading.judge(self.task, {"f": "passed"})["status"], "infra_error")  # did not run
        self.assertEqual(grading.judge(self.task, None)["status"], "infra_error")  # no report
        self.assertFalse(grading.judge(self.task, {"f": "passed", "p": "skipped"})["a1_pass"])  # skip is not a pass
        with self.assertRaises(Refused):
            grading.judge({"instance_id": "y", "FAIL_TO_PASS": ["f"], "PASS_TO_PASS": []}, {})

    def test_swebench_report_parsing(self):
        p = self.d / "report.json"
        p.write_text(json.dumps({"x": {"patch_successfully_applied": True, "resolved": False, "tests_status": {
            "FAIL_TO_PASS": {"success": ["f"], "failure": []}, "PASS_TO_PASS": {"success": [], "failure": ["p"]}}}}))
        r = grading.parse_swebench_report(p, "x")
        self.assertEqual((r["applied"], r["resolved"]), (True, False))
        self.assertIsNone(grading.parse_swebench_report(self.d / "missing.json", "x"))
        p.write_text("{}")
        self.assertIsNone(grading.parse_swebench_report(p, "x"))
        self.assertEqual(len(grading.report_paths(self.d, "r", "m", "x")), 2)
        p.write_text(json.dumps({"x": {"patch_successfully_applied": "true", "resolved": 0, "tests_status": {}}}))
        self.assertIsNone(grading.parse_swebench_report(p, "x"))  # verdict fields must be literal booleans

    def test_collection_errors_are_failures(self):
        log = self.d / "test_output.txt"
        log.write_text("==== ERRORS ====\nERROR collecting tests/test_x.py\nImportError while importing test module\n")
        self.assertTrue(grading.collection_failed(log))
        log.write_text("1 passed in 0.1s\n")
        self.assertFalse(grading.collection_failed(log))

    def test_known_bad_target_must_be_a_plain_file_inside(self):
        repo = self.d / "repo"
        (repo / "pkg").mkdir(parents=True)
        (repo / "pkg" / "a.py").write_text("x")
        os.symlink("/etc", repo / "lnk")
        self.assertEqual(grading.safe_target(repo, "pkg/a.py"), repo / "pkg" / "a.py")
        for bad in ("../x", "/etc/passwd", "lnk/hosts", "pkg/../pkg/a.py"):
            with self.assertRaises(Refused):
                grading.safe_target(repo, bad)

    def test_labels_are_safe_directory_names(self):
        self.assertEqual(grading.label_dir("gold-0-django__django-1|../../x"), "gold-0-django__django-1_.._.._x")

    def test_submission_statuses_pass_through(self):
        for st in ("empty", "patch_invalid", "author_timeout", "infra_error"):
            self.assertEqual(grading.grade_submission({"status": st}, None)["status"], st)
        self.assertEqual(grading.grade_submission({"status": "ok"}, None)["status"], "infra_error")

    def test_controls_pass_on_fixtures(self):
        s = self.study()
        manifest.select(s, "calibration")
        c = bench_cli.controls(s, "calibration")
        self.assertTrue(c["passed"], c)
        m = manifest.load_manifest(s, "calibration")
        self.assertEqual(c["stamp"]["manifest_sha256"], m["manifest_sha256"])
        kinds = [r["kind"] for r in c["results"].values()]
        self.assertEqual(kinds.count("known_bad"), len(m["tasks"]))  # every task, not a sample
        self.assertEqual(kinds.count("gold"), 2 * len(m["tasks"]))  # repeated, for flakiness
        self.assertIn("missing_report", c["results"])
        self.assertTrue((s.phase_dir("calibration") / "controls.md").exists())

    def test_a_broken_patch_is_patch_invalid(self):
        s = self.study()
        m = manifest.select(s, "calibration")
        cfg = s.protocol()["frozen"]["config"]
        tid = m["tasks"][0]
        root = workspace.workspace_root(cfg, s.dir)
        g = grading.grade(cfg, [("x", tid, b"diff --git a/nope.py b/nope.py\n--- a/nope.py\n+++ b/nope.py\n@@ -1 +1 @@\n-a\n+b\n")],
                          m["rows"], root, s.dir / "cache", s.dir / "eval", preflight.denied_paths(s, root))
        self.assertEqual(g["x"]["status"], "patch_invalid")


# ---------------------------------------------------------------------- the whole pipeline


class EndToEnd(Tmp):
    def test_calibration_pipeline(self):
        s = self.study(**{"selection.calibration_n": 8, "caps.calibration_max_calls": 100})  # every fixture shape
        self.ready(s)
        planned = run.Runner(s, "calibration").run()
        self.assertEqual(planned["status"], "planned")
        self.assertTrue(read_jsonl(s.ledger_path)[-1]["call"].startswith("probe"))  # nothing ran but probes
        r = run.Runner(s, "calibration").run(yes=True)
        self.assertEqual(r["status"], "complete", r)
        launched = r["ledger"]["launched"]
        self.assertEqual(run.Runner(s, "calibration").run(yes=True)["ledger"]["launched"], launched)  # idempotent
        stab = read_json(s.phase_dir("calibration") / "stability.json")
        self.assertEqual((stab["n_checked"], len(stab["sample"])), (16, 12))
        sub = read_json(s.phase_dir("calibration") / "calls" / "fixture__t1--stub-a--author" / "submission.json")
        self.assertEqual(sub["status"], "ok")
        self.assertTrue(sub["tree_oid"])
        with self.assertRaises(Refused):
            adj.evaluate(s, "calibration")  # not before the lock
        adj.lock(s, "calibration")
        self.assertFalse(list(s.phase_dir("calibration").glob(".lock-*")))  # staging is gone
        lock = adj.verify_lock(s, "calibration")
        q = read_json(s.phase_dir("calibration") / "adjudication" / "queue.json")
        self.assertEqual(lock["queue"]["items"], len(q["items"]))
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
        self.assertIsNotNone(res["equal_author_weight"]["bad"]["pooled"]["ci95"])
        self.assertEqual(d["stub-a"]["bad"]["discordant"], {"cross_only": 2, "same_only": 0})
        self.assertEqual(res["adjudication"]["counts"]["cross-only/bad"]["supported"], 2)
        self.assertEqual(res["stability"]["stub-a"]["flips"]["k"], 0)
        self.assertEqual(res["workflow"]["stub-a"]["A1"]["accepted"], 8)
        self.assertEqual(res["workflow"]["stub-a"]["checker_tokens"]["same"]["checks"], 8 + 6)  # first checks + repeats
        self.assertEqual(res["spend"]["actual_usd"], 0)
        self.assertFalse(res["spend"]["partial"])
        rep = (s.phase_dir("calibration") / "report.md").read_text()
        for need in ("no effectiveness claim", "A4 (human sign-off) is omitted", "A1, hidden tests only",
                     "| Item | Task |", "## Environment"):
            self.assertIn(need, rep)

    def test_a_check_edited_after_the_lock_is_caught(self):
        s = self.study()
        self.ready(s)
        run.Runner(s, "calibration").run(yes=True)
        adj.lock(s, "calibration")
        adj.adjudicate(s, "calibration", None, None, None, skip="calibration only")
        rp = next((s.phase_dir("calibration") / "calls").glob("*--same--r0-a0")) / "result.json"
        r = read_json(rp)
        r["text"] = r["text"] + " "
        write_json(rp, r)
        with self.assertRaises(Refused):
            adj.evaluate(s, "calibration")

    def test_a_patch_edited_after_the_lock_is_caught(self):
        s = self.study()
        self.ready(s)
        run.Runner(s, "calibration").run(yes=True)
        adj.lock(s, "calibration")
        with self.assertRaises(Refused):
            adj.lock(s, "calibration")  # once
        adj.adjudicate(s, "calibration", None, None, None, skip="calibration only")
        sub = next(p for p in (s.phase_dir("calibration") / "calls").glob("*--author/submission.json")
                   if read_json(p)["status"] == "ok")
        pd = sub.parent / "patch.diff"
        pd.write_bytes(pd.read_bytes() + b"\n")
        with self.assertRaises(Refused):
            adj.evaluate(s, "calibration")

    def test_report_cells_cannot_break_the_table(self):
        self.assertEqual(score.cell("a|b\n\n| c `x`"), "a/b / c 'x'")

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

    def test_exhausted_retries_stop_the_run_incomplete(self):
        s = self.study()
        self.ready(s)

        def broken(agent, role, *a, **k):
            return {"status": "infra_error", "why": "boom", "usage": {"known": False}, "seconds": 0}
        r = run.Runner(s, "calibration", run_call=broken).run(yes=True)
        self.assertFalse(r["status"] == "complete")
        with self.assertRaises(SystemExit) as e, redirect_stdout(io.StringIO()):
            bench_cli.main(["run", "--study", str(s.dir), "--phase", "calibration", "--yes"])
        self.assertNotEqual(e.exception.code, 0)
        self.assertFalse(list((s.phase_dir("calibration") / "calls").glob("*--author/submission.json")))

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
        last = [q for e in lg.events() if (q := pause_of(e))][-1]
        with mock.patch("crbench.ledger.now", return_value=last["expected_reset"]):
            with self.assertRaises(KeyboardInterrupt):
                run.Runner(s, "calibration", run_call=flaky).run(yes=True)
            r = run.Runner(s, "calibration", run_call=flaky).run(yes=True)
        self.assertEqual(r["status"], "complete", r)
        interrupted = [read_json(p) for p in (s.phase_dir("calibration") / "calls").glob("*/result.json")
                       if read_json(p).get("why") == "interrupted call"]
        self.assertEqual(len(interrupted), 1)
        self.assertEqual(Ledger(s).summary()["in_flight"], 0)

    def test_checker_changing_source_halts(self):
        s = self.study()
        self.ready(s)

        def vandal(agent, role, prompt, ws, *a, **k):
            if role == "checker":
                w = ws["workspace"]
                for p in [w, *w.rglob("*")]:
                    p.chmod(p.stat().st_mode | 0o200)
                (w / "lists.py").write_text("vandalized\n")
            return ag.run_call(agent, role, prompt, ws, *a, **k)
        r = run.Runner(s, "calibration", run_call=vandal).run(yes=True)
        self.assertTrue(r["status"].startswith("stopped"), r)
        self.assertIsNotNone(Ledger(s).state()["halted"])

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

    def test_cli_or_harness_change_stops(self):
        s = self.study()
        self.ready(s)
        changed = {"path": "stub", "sha256": "f" * 64, "version": "2.0"}
        with mock.patch("crbench.preflight.cli_identity", return_value=changed), self.assertRaises(Refused):
            run.Runner(s, "calibration").run(yes=True)
        with mock.patch("crbench.run.stamp", return_value={"study_sha256": "x", "harness_sha256": "y"}), \
                self.assertRaises(Refused):
            run.Runner(s, "calibration").run(yes=True)

    def full_calibration(self, s):
        self.ready(s)
        run.Runner(s, "calibration").run(yes=True)
        adj.lock(s, "calibration")
        adj.adjudicate(s, "calibration", None, None, None, skip="calibration")
        adj.evaluate(s, "calibration")
        score.score(s, "calibration")

    def main_phase(self, s):
        self.full_calibration(s)
        freeze_sizing(s, 4, token_p95=Ledger(s).calibration_p95())
        manifest.select(s, "main")
        self.ready(s, "main")
        self.assertEqual(run.Runner(s, "main").run(yes=True)["status"], "complete")
        adj.lock(s, "main")
        adj.adjudicate(s, "main", None, None, None, skip="test")
        adj.evaluate(s, "main")
        score.score(s, "main")

    def test_sizing_is_frozen_and_signed(self):
        s = self.study()
        self.full_calibration(s)
        sz = power.size(s, sims=10)
        self.assertIn(sz["designation"], ("stop", "feasibility pilot", "publication run"))
        self.assertEqual(sz["sha256"], digest({k: v for k, v in sz.items() if k != "sha256"}))
        self.assertIn("token_p95", sz)
        with self.assertRaises(Refused):
            power.size(s, sims=10)  # frozen once
        p = s.dir / "sizing.json"
        t = read_json(p)
        t["n_phase1"] = t["n_phase1"] + 1
        write_json(p, t)
        with self.assertRaises(Refused):
            load_sizing(s)  # an edited sizing.json is refused everywhere it is read

    def test_power_simulation_behaves(self):
        m = {"delta_catch": 0.15, "delta_fr": 0.05, "power": 0.8}
        small = power.simulate(20, [0.4, 0.4], [0.4, 0.4], 0.3, 0.2, 0.05, 0.15, 0.05, 100, 1)
        big = power.simulate(600, [0.4, 0.4], [0.4, 0.4], 0.3, 0.2, 0.05, 0.15, 0.05, 100, 1)
        self.assertLess(small, big)
        self.assertLess(power.mc_lower(0.8, 100), 0.8)
        self.assertLess(power.mc_lower(1.0, 100), 1.0)  # Wilson: a perfect run still has Monte Carlo error
        self.assertEqual(power.repeats(10), 10)
        self.assertEqual(power.repeats(400), 40)
        n, _ = power.required_n([0.4, 0.4], [0.4, 0.4], [(0.3, 0.2)], 0.05, {**m, "delta_catch": 0.0001}, sims=20)
        self.assertIsNone(n)  # an unreachable gain is reported as such, after N_CAP itself is tried

    def test_release(self):
        s = self.study()
        self.main_phase(s)
        call = next((s.phase_dir("main") / "calls").glob("*-a0"))
        (call / "note.txt").write_text(f"worked in {self.home}/project")
        with self.assertRaises(Refused):
            release.release(s)  # redistribution not confirmed
        m = release.release(s, confirm_redistribution=True)
        share_md = (s.dir / "release" / "share.md").read_text()
        for need in ("FEASIBILITY PILOT", "directly, not through Control Rod's daemon", "(A4) was omitted",
                     "not adjudicated", "Open source, free", "Release manifest digest", "Transcript asset digest"):
            self.assertIn(need, share_md)
        self.assertIn("main/results.json", m["records"]["files"])
        rel = s.dir / "release" / "records"
        self.assertEqual((rel / "ledger.jsonl").read_bytes(), s.ledger_path.read_bytes())  # byte for byte
        self.assertTrue(any(m["asset"]["redactions"].values()))
        import tarfile
        with tarfile.open(s.dir / "release" / "transcripts.tar.gz") as t:
            note = next(x for x in t.getmembers() if x.name.endswith("note.txt"))
            self.assertNotIn(str(self.home), t.extractfile(note).read().decode())
        with self.assertRaises(Refused):
            release.release(s, confirm_redistribution=True)  # once

    def test_release_refuses_private_data(self):
        s = self.study()
        self.main_phase(s)
        call = next((s.phase_dir("main") / "calls").glob("*-a0"))
        (call / "stdout.txt").write_text("token sk-ant-" + "a" * 30)
        with self.assertRaises(Refused) as e:
            release.release(s, confirm_redistribution=True)
        self.assertIn("privacy", e.exception.rule)
        self.assertFalse((s.dir / "release").exists())
        self.assertFalse(list(s.dir.glob(".release-*")))
        (call / "stdout.txt").unlink()
        with open(s.phase_dir("main") / "report.md", "a") as f:
            f.write(f"\n{self.home}\n")  # a record is never edited, so a host path in one stops the release
        with self.assertRaises(Refused):
            release.release(s, confirm_redistribution=True)
        (s.phase_dir("main") / "report.md").unlink()
        os.symlink("/etc/hostname", s.phase_dir("main") / "report.md")
        with self.assertRaises(Refused):
            release.release(s, confirm_redistribution=True)

    def test_release_names_and_redactions(self):
        with self.assertRaises(Refused):
            release._member("main/calls/../x", {})
        with self.assertRaises(Refused):
            release._member("main/calls/a b", {})
        release._member("main/calls/django__django-1--stub-a--author/patch.diff", {})
        cfg = {"caps": {"workspace_root": str(self.d / "never-made")}}
        st = Study(self.d / "st")
        subs = release.redactions(cfg, st)
        self.assertFalse((self.d / "never-made").exists())  # computing redactions makes no directory
        out, n = release.scrub(str(self.d / "never-made" / "x").encode(), subs)
        self.assertEqual((out, n), (b"<workspaces>/x", 1))

    def test_open_source_maintainer_emails_are_not_flagged(self):
        ids = release.host_identifiers()
        self.assertEqual(release.scan(b"Author: Jane Dev <jane@example.org>", ids), [])
        self.assertEqual(release.scan(b"AKIA" + b"A" * 16, ids), ["API key or token"])


class Cli(Tmp):
    def test_cli_dry_path(self):
        with redirect_stdout(io.StringIO()) as o:
            bench_cli.main(["init", "--study", str(self.d / "c"), "--config", str(self.config())])
            bench_cli.main(["select", "--study", str(self.d / "c"), "--phase", "calibration"])
            bench_cli.main(["status", "--study", str(self.d / "c")])
        self.assertIn("launched", o.getvalue())


if __name__ == "__main__":
    unittest.main()
