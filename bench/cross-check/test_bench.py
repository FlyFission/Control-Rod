"""Offline tests for the benchmark harness: every rule in DESIGN.md v3.3 that code enforces, run on
fixture tasks with stub agents. No network, no model calls, no Docker.

    python3 -m unittest bench/cross-check/test_bench.py
"""

from __future__ import annotations

import importlib.util
import io
import json
import os
import re
import subprocess
import sys
import shutil
import tempfile
import threading
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
REAL_HOME = os.environ.get("HOME", "")  # the docker client finds its context (e.g. Colima) from it
sys.path.insert(0, str(HERE))

from crbench import adjudicate as adj  # noqa: E402
from crbench import agents as ag  # noqa: E402
from crbench import confine, container, cprobe, egress, grading, manifest, patches, power, preflight, release, run, score, stats, workspace  # noqa: E402
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
            self.assertIn(confine.canonical("/etc/secret"), deny)
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

    def test_rows_without_regression_tests_are_ineligible(self):
        s = self.study()
        rows, _ = manifest.load_snapshot(s.protocol()["frozen"]["config"])
        bare = dict(rows[0], instance_id="fixture__bare-1", PASS_TO_PASS="[]")
        none = dict(rows[0], instance_id="fixture__none-1", FAIL_TO_PASS=[], PASS_TO_PASS=[])
        allrows = rows + [bare, none]
        manifest.validate_rows(allrows, None)  # empty lists load; only a non-list is a broken snapshot
        self.assertEqual(manifest.ineligible(allrows), {
            "fixture__bare-1": "no PASS_TO_PASS tests: A1 undefined",
            "fixture__none-1": "no FAIL_TO_PASS and no PASS_TO_PASS tests: A1 undefined"})
        pool = {r["instance_id"] for r in manifest.pool_for(s, "calibration", allrows)}
        self.assertFalse(pool & {"fixture__bare-1", "fixture__none-1"})
        self.assertEqual(pool, {r["instance_id"] for r in rows})
        with self.assertRaises(Refused):
            manifest.validate_rows([dict(rows[0], PASS_TO_PASS={"a": 1})], None)

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

    def test_harness_git_never_starts_background_maintenance(self):
        root = workspace.workspace_root({"caps": {"workspace_root": str(self.d / "ws")}})
        repo = workspace.export_base(self.task, root, self.d / "cache")
        for k, v in (("gc.auto", "0"), ("gc.autodetach", "false"), ("maintenance.auto", "false")):
            self.assertEqual(workspace._git(["config", "--get", k], repo).strip(), v)

    def test_remove_tolerates_an_entry_that_vanishes_mid_walk(self):
        d = self.d / "gone"
        (d / "pack").mkdir(parents=True)
        (d / "pack" / "tmp").write_text("x")
        real = os.unlink
        def flaky(p, *a, **k):  # a concurrent process removed it first
            if str(p).endswith("tmp"):
                real(p, *a, **k)
                raise FileNotFoundError(2, "No such file or directory", str(p))
            return real(p, *a, **k)
        with mock.patch("os.unlink", side_effect=flaky):
            workspace.remove(d)
        self.assertFalse(d.exists())

    def test_capture_drops_sandbox_mount_point_stubs(self):
        def stubs(r):  # what a killed Claude Code sandbox can leave in its working directory
            (r / ".bashrc").write_text("")
            (r / ".claude" / "commands").mkdir(parents=True)
            (r / ".mcp.json").write_text("{}")  # not empty: the author's own file, kept
        cap = self.capture(stubs)[0]
        self.assertEqual(cap["sandbox_stubs_dropped"], [".bashrc", ".claude"])
        self.assertEqual([c["paths"] for c in cap["changes"]], [[".mcp.json"]])
        self.assertEqual(self.capture(lambda r: (r / ".profile").write_text(""))[0]["status"], "empty")

    def test_container_checker_tree_keeps_directory_modes(self):
        root = workspace.workspace_root({"caps": {"workspace_root": str(self.d / "ws")}})
        repo, _ = workspace.checker_tree(self.task, b"", root, self.d / "cache", files_only=True)
        for d in (repo, repo / ".git", repo / ".git" / "info"):  # Claude Code's sandbox needs EROFS, not EACCES
            self.assertTrue(d.stat().st_mode & 0o200, d)
        self.assertFalse((repo / "lists.py").stat().st_mode & 0o222)

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
        root = workspace.workspace_root({"caps": {"workspace_root": str(self.d / "ws")}})
        spec = {"argv": ["login", "status"], "require": "chatgpt", "refuse": "api key"}
        a = {"kind": "codex", "auth_status": spec}
        cx = {"cfg": {}, "label": "x", "image": "sha256:x", "out_dir": self.d / "pf"}
        self.assertFalse(preflight.auth_status(a, root)["ok"])  # it runs only inside the pinned image
        for text, ok in (("Logged in using ChatGPT", True), ("Logged in using an API key", False)):
            with mock.patch.object(preflight.cprobe, "in_container",
                                   return_value={"code": 0, "stdout": text, "stderr": "", "egress": []}) as m:
                self.assertEqual(preflight.auth_status(a, root, cx)["ok"], ok)
            self.assertIn("'codex' 'login' 'status'", m.call_args[0][5])

    def test_container_probe_script_never_prints_a_protected_file(self):
        negs = {"positive": "PROBE_OK.txt", "sibling workspace": "/v/x/secret.txt", "other": "/v/y/auth.json"}
        for own in (False, True):  # with and without the sign-in step (Codex leaves it to admission)
            paths = {**negs, **({"own sign-in directory": "/work/private/sentinel"} if own else {})}
            for role in ("author", "checker"):
                script, done = preflight.probe_script(role, paths, "https://c.example.com/", "/work/scratch",
                                                      {"~/.ssh": "/h/.ssh"}, boxed=True)
                self.assertNotIn("secret.txt", script)
                self.assertNotIn("auth.json", script)
                self.assertNotIn("/h/.ssh", script)
                self.assertEqual(script.count("cat "), 1)  # only its own PROBE_OK.txt
                self.assertEqual("PRIVATE=" in script, own)
                skipped, _ = preflight.probe_script(role, paths, "https://c.example.com/", "/work/scratch", {},
                                                    boxed=True, skip=("source write",))
                self.assertNotIn("PROBE_WRITE", skipped)
                self.assertEqual("SCRATCH=" in skipped, role == "checker")
                for line in (done, "SOURCE=denied", "SOURCE=written", "SCRATCH=ok", "PRIVATE=denied",
                             "PRIVATE=readable", "COUNT=1", "TOKEN=absent"):
                    self.assertNotIn(line, script)  # a model that reads the script first cannot quote a result
                self.assertNotRegex(script, r"\b[A-Z_]+=(present|absent)\b")

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
        (self.home / ".ssh").mkdir()
        (self.home / ".ssh" / "agent").write_text("")  # a real entry with an ordinary name
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
                  "agent: did not read real HOME", "agent: did not read other vendor's sign-in",
                  "agent: did not list ~/.ssh"):
            self.assertIn(k, failed)
        lazy = lambda agent, *a, **k: ag.run_call({**agent, "lazy": True}, *a, **k)  # noqa: E731
        r = preflight.run_probes(s, run_call=lazy)
        self.assertFalse(r["passed"])  # a probe that never tried proves nothing
        failed = {k for v in r["results"].values() for k, ok in v["checks"].items() if not ok}
        self.assertIn("agent: ran the probe script", failed)
        self.assertIn("agent: probe script finished", failed)
        self.assertFalse([p for p in self.home.iterdir() if p.name.startswith(".cr-bench-probe")])  # canary cleaned up
        self.assertEqual(sorted(p.name for p in (self.home / ".ssh").iterdir()), ["agent"])  # planted entries too

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


def client_hello(name: str) -> bytes:
    """A real TLS ClientHello for `name`, from the ssl module, with no network."""
    import ssl
    ctx = ssl.create_default_context()
    inc, outg = ssl.MemoryBIO(), ssl.MemoryBIO()
    obj = ctx.wrap_bio(inc, outg, server_hostname=name)
    try:
        obj.do_handshake()
    except ssl.SSLWantReadError:
        pass
    return outg.read()


class Egress(unittest.TestCase):
    def test_connect_parsing(self):
        self.assertEqual(egress.parse_connect(b"CONNECT api.anthropic.com:443 HTTP/1.1\r\nHost: x\r\n\r\n"),
                         ("api.anthropic.com", 443))
        self.assertEqual(egress.parse_connect(b"CONNECT [::1]:443 HTTP/1.1\r\n\r\n"), ("::1", 443))
        for bad in (b"GET http://x/ HTTP/1.1\r\n\r\n", b"CONNECT x HTTP/1.1\r\n\r\n", b"\xff\xfe", b""):
            self.assertIsNone(egress.parse_connect(bad))

    def test_sni_from_a_real_client_hello(self):
        self.assertEqual(egress.sni_of(client_hello("chatgpt.com")), "chatgpt.com")
        self.assertIsNone(egress.sni_of(b"GET / HTTP/1.1\r\n"))
        self.assertIsNone(egress.sni_of(b"\x16\x03\x01\x00\x05\x01\x00"))

    def test_addresses_refused(self):
        for a in ("127.0.0.1", "10.1.2.3", "172.17.0.1", "192.168.5.2", "169.254.169.254", "100.64.0.1", "::1",
                  "fe80::1", "fc00::1", "::ffff:10.0.0.1", "0.0.0.0", "224.0.0.1"):
            self.assertIsNotNone(egress.address_refused(a), a)
        self.assertIsNone(egress.address_refused("104.18.32.47"))
        import ipaddress
        self.assertIsNotNone(egress.address_refused("104.18.32.47", [ipaddress.ip_network("104.18.0.0/16")]))

    def test_decisions(self):
        px = egress.Proxy(["chatgpt.com"], "L", io.StringIO(), resolver=lambda h, p: ["104.18.32.47"])
        self.assertEqual(px.decide("chatgpt.com", 443), (["104.18.32.47"], ""))
        self.assertEqual(px.decide("chatgpt.com", 80)[1], "port")
        self.assertEqual(px.decide("evil.chatgpt.com", 443)[1], "not on allowlist")
        self.assertEqual(px.decide("1.1.1.1", 443)[1], "ip literal")
        rebind = egress.Proxy(["chatgpt.com"], "L", io.StringIO(), resolver=lambda h, p: ["104.18.32.47", "10.0.0.5"])
        self.assertIn("refused address", rebind.decide("chatgpt.com", 443)[1])  # DNS rebinding to a private address

    def _session(self, connect: bytes, first: bytes, allow=("chatgpt.com",)):
        import socket
        log = io.StringIO()
        up_a, up_b = socket.socketpair()
        px = egress.Proxy(list(allow), "L1", log, resolver=lambda h, p: ["104.18.32.47"], dial=lambda a, p: up_a)
        c, srv = socket.socketpair()
        t = threading.Thread(target=px.handle, args=(srv,))
        t.start()
        c.sendall(connect)
        reply = c.recv(200)
        got = b""
        if reply.startswith(b"HTTP/1.1 200"):
            c.sendall(first)
            up_b.settimeout(2)
            try:
                got = up_b.recv(65536)
            except OSError:
                got = b""
        c.close()
        up_b.close()
        up_a.close()
        t.join(5)
        return reply, got, [json.loads(x) for x in log.getvalue().splitlines()]

    def test_matching_server_name_is_relayed_and_logged_without_payload(self):
        hello = client_hello("chatgpt.com")
        reply, got, log = self._session(b"CONNECT chatgpt.com:443 HTTP/1.1\r\n\r\n", hello)
        self.assertTrue(reply.startswith(b"HTTP/1.1 200"))
        self.assertEqual(got, hello)
        self.assertEqual([(e["decision"], e["reason"]) for e in log], [("allowed", "opened"), ("allowed", "closed")])
        self.assertEqual(set(log[-1]), {"at", "launch", "host", "port", "decision", "reason", "up", "down"})

    def test_fronted_server_name_never_reaches_upstream(self):
        reply, got, log = self._session(b"CONNECT chatgpt.com:443 HTTP/1.1\r\n\r\n", client_hello("evil.example"))
        self.assertEqual(got, b"")
        self.assertIn("server name differs", log[-1]["reason"])
        reply, got, log = self._session(b"CONNECT chatgpt.com:443 HTTP/1.1\r\n\r\n", b"plain bytes")
        self.assertEqual((got, log[-1]["reason"]), (b"", "no TLS ClientHello"))

    def test_fragmented_or_malformed_hellos_are_refused(self):
        h = client_hello("api.anthropic.com")
        rec_len = int.from_bytes(h[3:5], "big")
        body = h[5:5 + rec_len]
        # the same hello split across two TLS records: the first record holds a partial handshake
        cut = 60
        frag = h[:3] + cut.to_bytes(2, "big") + body[:cut] + h[:3] + (len(body) - cut).to_bytes(2, "big") + body[cut:]
        self.assertIsNone(egress.sni_of(frag))
        self.assertIsNone(egress.sni_of(h[:-10]))  # truncated record
        self.assertIsNone(egress.sni_of(h[:5] + body[:-1]))
        # a name longer than its bytes: a declared length past the end is refused, never clipped
        i = body.find(b"api.anthropic.com")
        nl = int.from_bytes(body[i - 2:i], "big")
        bad = body[:i - 2] + (nl + 9).to_bytes(2, "big") + body[i:]
        self.assertIsNone(egress.sni_of(h[:5] + bad))
        self.assertEqual(egress.sni_of(h), "api.anthropic.com")

    def test_peers_outside_the_call_network_and_caps(self):
        import ipaddress
        import socket
        log = io.StringIO()
        px = egress.Proxy(["chatgpt.com"], "L", log, peers=[ipaddress.ip_network("10.99.0.0/24")])
        a, b = socket.socketpair()  # a Unix socket peer is outside any network: refused
        px.handle(b)
        a.close()
        self.assertEqual(json.loads(log.getvalue().splitlines()[-1])["reason"], "peer outside the call network")
        log2 = io.StringIO()
        px2 = egress.Proxy(["chatgpt.com"], "L", log2, max_conns=1, max_log_lines=2)
        self.assertTrue(px2.slots.acquire(blocking=False))
        c, d = socket.socketpair()
        px2.handle(d)
        c.close()
        self.assertEqual(json.loads(log2.getvalue().splitlines()[-1])["reason"], "connection cap")
        for _ in range(5):
            px2.record(host="x" * 400 + "\n", decision="denied")
        rows = [json.loads(x) for x in log2.getvalue().splitlines()]
        self.assertEqual(rows[-1]["decision"], "log_cap")
        self.assertEqual(len(rows), 3)
        self.assertLessEqual(len(rows[1]["host"]), 253)

    def test_a_full_log_stops_traffic_and_marks_the_call_incomplete(self):
        import socket
        log = io.StringIO()
        px = egress.Proxy(["chatgpt.com"], "L", log, max_log_lines=1)
        px.record(host=None, decision="start")
        a, b = socket.socketpair()
        px.handle(b)  # past the cap: refused, whatever it asks for
        a.close()
        rows = [json.loads(x) for x in log.getvalue().splitlines()]
        self.assertEqual(rows[-1]["decision"], "log_cap")
        d = self.d if hasattr(self, "d") else Path(tempfile.mkdtemp())
        (d / "egress").mkdir(exist_ok=True)
        (d / "egress" / "egress.jsonl").write_text(log.getvalue())
        self.assertFalse(container.egress_audit(d)["complete"])
        (d / "egress" / "egress.jsonl").write_text(json.dumps({"decision": "start"}) + "\nnot json\n")
        self.assertEqual(container.egress_audit(d)["why"], "1 unreadable lines")
        (d / "egress" / "egress.jsonl").write_text(json.dumps({"decision": "start"}) + "\n")
        self.assertTrue(container.egress_audit(d)["complete"])

    def test_every_byte_is_charged_before_it_is_sent(self):
        px = egress.Proxy(["chatgpt.com"], "L", io.StringIO(), max_bytes=100)
        self.assertTrue(px.charge(60))
        self.assertFalse(px.charge(41))  # the hello and any buffered bytes count too
        self.assertTrue(px.charge(40))
        self.assertFalse(px.charge(1))

    def test_off_list_and_non_connect_are_refused(self):
        reply, _, log = self._session(b"CONNECT example.com:443 HTTP/1.1\r\n\r\n", b"")
        self.assertTrue(reply.startswith(b"HTTP/1.1 403"))
        self.assertEqual(log[-1]["reason"], "not on allowlist")
        reply, _, log = self._session(b"GET http://chatgpt.com/ HTTP/1.1\r\n\r\n", b"")
        self.assertTrue(reply.startswith(b"HTTP/1.1 405"))


class Containers(Tmp):
    CFG = {"container": {"image": "cr-bench-agent:1"}}

    def ws(self):
        repo, scratch, priv = self.d / "r", self.d / "s", self.d / "p"
        for x in (repo, scratch, priv):
            x.mkdir()
        return {"workspace": repo, "scratch": scratch, "private": priv}

    def test_hardening_is_complete(self):
        f = " ".join(container.hardening(container.settings(self.CFG)))
        for flag in ("--cap-drop ALL", "no-new-privileges", "--read-only", "--init", "apparmor=cr-bench-bwrap",
                     "seccomp=", "--pids-limit", "--memory", "--cpus", "--tmpfs /tmp:"):
            self.assertIn(flag, f)
        self.assertNotIn("privileged", f)
        self.assertNotIn("unconfined", f)  # only for the CLI that needs it
        self.assertIn("systempaths=unconfined", " ".join(container.hardening(container.settings(self.CFG),
                                                                              systempaths=True)))

    def test_agent_argv_mounts_only_its_own_dirs_with_opaque_names(self):
        ws = self.ws()
        s = container.settings(self.CFG)
        a = container.agent_argv(s, "sha256:img", "abc123", "lbl", "checker", ws, self.d / "env", ["codex"], "crb-abc123-net")
        j = " ".join(a)
        self.assertIn(f"src={ws['workspace']},dst=/work/repo,readonly", j)
        self.assertIn(f"src={ws['scratch']},dst=/work/scratch", j)
        self.assertIn(f"src={ws['private']},dst=/work/private", j)
        self.assertEqual(j.count("--mount"), 3)
        self.assertIn("--hostname sandbox", j)
        self.assertIn("--dns 127.0.0.1", j)
        self.assertNotIn("-e ", j)  # environment only through the owner-only env file
        author = " ".join(container.agent_argv(s, "sha256:img", "abc123", "lbl", "author", {**ws, "scratch": None},
                                               self.d / "env", ["claude"], "n"))
        self.assertNotIn("readonly", author)
        with self.assertRaises(Refused):
            container.mount(Path("/tmp/a,dst=/etc"), "/work/repo", ro=True)

    def test_proxy_argv_and_names(self):
        n = container.names("abc")
        self.assertEqual(set(n.values()), {"crb-abc", "crb-abc-px", "crb-abc-net"})
        a = " ".join(container.proxy_argv(container.settings(self.CFG), "img", "abc", "lbl", self.d,
                                          ["chatgpt.com"], ["172.17.0.0/16"], "10.9.0.0/24"))
        self.assertIn("egress.py 3128 abc /log/egress.jsonl chatgpt.com --listen-net 10.9.0.0/24 "
                      "--deny-net 172.17.0.0/16", a)
        self.assertTrue(a.startswith("create ") and "--network crb-abc-net" in a)
        self.assertIn("--cap-drop ALL", a)
        for loosened in ("systempaths", "seccomp=", "cr-bench-bwrap"):  # the proxy keeps Docker's defaults
            self.assertNotIn(loosened, a)
        self.assertIn("apparmor=docker-default", a)

    def test_env_file_holds_no_host_environment(self):
        priv = self.d / "priv"
        priv.mkdir()
        with mock.patch.dict(os.environ, {"OPENAI_API_KEY": "sk-x", "SECRET_HOST_VAR": "1"}):
            env = ag.container_env({"kind": "stub", "isolation": {"env": {"A": "1"}}}, priv)
        self.assertEqual(env["PATH"], ag.IMAGE_PATH)
        self.assertEqual(env["TMPDIR"], "/tmp")
        self.assertTrue(env["HOME"].startswith("/work/private/"))
        self.assertNotIn("SECRET_HOST_VAR", env)
        self.assertNotIn("OPENAI_API_KEY", env)
        p = container.write_env_file(priv / ".env", env)
        self.assertEqual(p.stat().st_mode & 0o077, 0)
        with self.assertRaises(Refused):
            container.write_env_file(priv / ".e2", {"X": "a\nB=c"})

    def test_in_container_cli_args_use_fixed_paths_and_deny_the_sign_in_dir(self):
        agents = read_json(HERE / "agents.json")
        c = " ".join(ag.container_args(ag.effective(agents["codex"], "codex"), "checker", True))
        self.assertIn('"/work/private"="deny"', c)
        self.assertIn('"/work/repo"="read"', c)
        self.assertIn("-C /work/repo", c)
        self.assertIn("permissions.control-rod.network.enabled=false", c)
        cl = ag.container_args(ag.effective(agents["claude"], "claude"), "author", False)
        st = json.loads(cl[cl.index("--settings") + 1])
        self.assertEqual(st["sandbox"]["filesystem"]["denyRead"], ["/work/private"])
        self.assertEqual(st["sandbox"]["network"]["allowedDomains"], [])
        self.assertTrue(st["sandbox"]["failIfUnavailable"])

    def test_claude_token_goes_to_a_credentials_file_never_the_environment(self):
        agents = read_json(HERE / "agents.json")
        tokf = self.d / "tok"
        tokf.write_text("sk-ant-oat01-abc\n")
        os.chmod(tokf, 0o600)
        a = ag.effective(agents["claude"], "claude")
        a["login_store"] = {**a["login_store"], "source": str(tokf)}
        priv = self.d / "priv"
        priv.mkdir()
        env = ag.container_env(a, priv)
        self.assertNotIn("sk-ant-oat01-abc", json.dumps(env))
        self.assertEqual(env["CLAUDE_CONFIG_DIR"], "/work/private/claude")
        cred = json.loads((priv / "claude" / ".credentials.json").read_text())
        self.assertEqual(cred["claudeAiOauth"]["accessToken"], "sk-ant-oat01-abc")
        self.assertEqual((priv / "claude" / ".credentials.json").stat().st_mode & 0o077, 0)
        tokf.write_text("sk-ant-api03-paid\n")
        with self.assertRaises(SystemExit):
            ag.container_env(a, self.d)
        self.assertTrue(preflight.scan_billing(a))
        with self.assertRaises(Refused):  # a credential in the environment is refused outright
            ag.container_env({"kind": "stub", "isolation": {"env": {"CLAUDE_CODE_OAUTH_TOKEN": "x"}}}, priv)

    def test_sentinel_login_has_the_real_layout_and_no_secret(self):
        agents = read_json(HERE / "agents.json")
        for name in ("claude", "codex"):
            priv = self.d / f"p-{name}"
            priv.mkdir()
            env = ag.container_env(ag.effective(agents[name], name), priv, sentinel="SENTINEL-1")
            blob = b"".join(f.read_bytes() for f in priv.rglob("*") if f.is_file())
            self.assertIn(b"SENTINEL-1", blob)
            self.assertNotIn("SENTINEL-1", json.dumps(env))

    def test_refreshed_codex_sign_in_is_written_back_only_to_its_own_store(self):
        agents = read_json(HERE / "agents.json")
        store = self.d / "codex-store"
        store.mkdir()
        (store / "auth.json").write_text(json.dumps({"tokens": {"access_token": "a", "refresh_token": "r1"}}))
        a = ag.effective(agents["codex"], "codex")
        a["login_store"] = {**a["login_store"], "source": str(store)}
        priv = self.d / "priv"
        priv.mkdir()
        ag.login_store(a, priv)
        self.assertEqual(ag.write_back_login(a, priv), "unchanged")  # unchanged
        (priv / "login" / "auth.json").write_text("{half")
        self.assertEqual(ag.write_back_login(a, priv), "refused")  # never a broken file
        (priv / "login" / "auth.json").write_text(json.dumps({"tokens": {"access_token": "a", "refresh_token": "r2"}}))
        self.assertEqual(ag.write_back_login(a, priv), "updated")
        self.assertIn("r2", (store / "auth.json").read_text())
        self.assertEqual((store / "auth.json").stat().st_mode & 0o077, 0)
        self.assertEqual(ag.write_back_login({**a, "login_store": {**a["login_store"], "write_back": False}}, priv), "n/a")

    def test_write_back_guards(self):
        agents = read_json(HERE / "agents.json")
        store = self.d / "codex-store"
        store.mkdir()
        good = {"tokens": {"access_token": "a", "refresh_token": "r1"}}
        (store / "auth.json").write_text(json.dumps(good))
        a = ag.effective(agents["codex"], "codex")
        a["login_store"] = {**a["login_store"], "source": str(store)}

        def checkout():
            priv = Path(tempfile.mkdtemp(dir=self.d))
            ag.login_store(a, priv)
            return priv
        priv = checkout()  # a refresh that turned into an API key is never written back
        (priv / "login" / "auth.json").write_text(json.dumps({**good, "OPENAI_API_KEY": "sk-x"}))
        self.assertEqual(ag.write_back_login(a, priv), "refused")
        priv = checkout()  # the store moved on during the call: no rollback
        (priv / "login" / "auth.json").write_text(json.dumps({"tokens": {"access_token": "a", "refresh_token": "r2"}}))
        (store / "auth.json").write_text(json.dumps({"tokens": {"access_token": "b", "refresh_token": "r9"}}))
        self.assertEqual(ag.write_back_login(a, priv), "conflict")
        self.assertIn("r9", (store / "auth.json").read_text())
        priv = checkout()  # a container that swaps the login directory for a link reaches nothing
        other = self.d / "elsewhere"
        other.mkdir()
        (other / "auth.json").write_text(json.dumps({"tokens": {"access_token": "x", "refresh_token": "stolen"}}))
        shutil.rmtree(priv / "login")
        (priv / "login").symlink_to(other)
        self.assertEqual(ag.write_back_login(a, priv), "refused")
        self.assertNotIn("stolen", (store / "auth.json").read_text())
        home_codex = self.home / ".codex"  # the owner's everyday store is never a write-back target
        home_codex.mkdir()
        self.assertFalse(ag._store_ok_for_write_back(home_codex))
        self.assertTrue(ag._store_ok_for_write_back(store))

    def test_local_file_may_move_the_sign_in_only(self):
        agents = read_json(HERE / "agents.json")
        lp = self.d / "agents.local.json"  # never the repository's own file
        with mock.patch.object(ag, "HERE", self.d):
            write_json(lp, {"codex": {"login_store": {"source": "/x"}}})
            e = ag.effective(agents["codex"], "codex")
            self.assertEqual((e["login_store"]["source"], e["login_store"]["mode"]), ("/x", "files"))
            for bad in ({"bin": "/evil"}, {"login_store": {"mode": "none"}}, {"read_allow": ["/"]}):
                write_json(lp, {"codex": bad})
                with self.assertRaises(SystemExit):
                    ag.effective(agents["codex"], "codex")

    def test_admission_fails_closed(self):
        agent = ag.effective(read_json(HERE / "agents.json")["codex"], "codex")

        def run_with(edit=lambda out: out, rows=None, code=0, proxy_ip="10.9.0.2", lid="L1"):
            seen = {}

            def fake(cfg, label, ag_, image, root, script, out_dir, **kw):
                w = {"private": self.d / "pv", "workspace": self.d / "ws"}
                for d in w.values():
                    shutil.rmtree(d, ignore_errors=True)
                    d.mkdir()
                env = ag.container_env(ag_, w["private"], sentinel=kw["sentinel"])
                kw["prepare"](w, env)
                text = script(proxy_ip)
                seen["text"] = text
                done = re.search(r"echo (DONE-[0-9a-f]+)", text).group(1)
                n = text.count("OUTER_SECRET")
                out = "".join(f"OUTER_SECRET{i}=read\nSECRET{i}=denied:EACCES\n" for i in range(n))
                out += ("OUTER_PXTCP=open\nCTRL=200x\nPOS=read\nENV=clean\nNET=000x\nPXTCP=blocked:EPERM\n"
                        "RAWTCP=blocked:EPERM\nWRITE=no\nPTY=ok\n" + done + "\n")
                eg = rows if rows is not None else [
                    {"launch": lid, "decision": "start"},
                    {"launch": lid, "host": "chatgpt.com", "decision": "allowed", "reason": "opened"},
                    {"launch": lid, "host": None, "decision": "denied", "reason": "empty connection"},
                    {"launch": lid, "host": "chatgpt.com", "decision": "allowed", "reason": "closed"}]
                return {"code": code, "stdout": edit(out), "stderr": "", "egress": eg, "lid": lid}
            with mock.patch.object(cprobe, "in_container", side_effect=fake):
                r = cprobe.admission({}, "l", agent, "img", self.d, self.d / "o", role="checker")
            return r, seen.get("text", "")
        r, text = run_with()
        self.assertTrue(r["ok"], r)
        self.assertIn("http://10.9.0.2:3128", text)  # the proxy reaches the script as a literal
        self.assertNotIn("$CR_PX", text)
        self.assertIn("/work/private/login/auth.json", text)  # the real sign-in path, holding a sentinel
        self.assertFalse(run_with(lambda o: "")[0]["ok"])  # nothing printed is never a denial
        self.assertFalse(run_with(lambda o: re.sub(r"DONE-\w+\n", "", o))[0]["ok"])  # cut short
        self.assertFalse(run_with(rows=[])[0]["ok"])  # no proxy log
        stale = [{"launch": "OLD", "decision": "start"}]
        self.assertFalse(run_with(rows=stale)[0]["ok"])  # another launch's log never counts
        self.assertFalse(run_with(lambda o: o.replace("CTRL=200x", "CTRL=000x"))[0]["ok"])
        self.assertFalse(run_with(lambda o: o.replace("OUTER_PXTCP=open", "OUTER_PXTCP=blocked:ECONNREFUSED"))[0]["ok"])
        self.assertFalse(run_with(lambda o: o.replace("PXTCP=blocked:EPERM", "PXTCP=badinput"))[0]["ok"])
        # a refused connection or a timeout is not a sandbox denial
        self.assertFalse(run_with(lambda o: o.replace("\nPXTCP=blocked:EPERM", "\nPXTCP=blocked:ECONNREFUSED"))[0]["ok"])
        self.assertFalse(run_with(lambda o: o.replace("\nPXTCP=blocked:EPERM", "\nPXTCP=blocked:timeout"))[0]["ok"])
        self.assertFalse(run_with(lambda o: o.replace("SECRET0=denied:EACCES", "SECRET0=denied:EIO"))[0]["ok"])
        self.assertFalse(run_with(lambda o: o.replace("OUTER_SECRET0=read", "OUTER_SECRET0=denied"))[0]["ok"])
        extra = [{"launch": "L1", "decision": "start"},
                 {"launch": "L1", "host": "chatgpt.com", "decision": "allowed", "reason": "opened"},
                 {"launch": "L1", "host": None, "decision": "denied", "reason": "empty connection"},
                 {"launch": "L1", "host": None, "decision": "denied", "reason": "not a CONNECT request"}]
        self.assertFalse(run_with(rows=extra)[0]["ok"])  # any other connection from inside fails it
        self.assertFalse(run_with(code=1)[0]["ok"])
        self.assertFalse(run_with(proxy_ip=None)[0]["ok"])  # no address: the probe cannot run
        self.assertFalse(run_with(proxy_ip="127.0.0.1")[0]["ok"])

    def test_image_must_report_exactly_the_pinned_versions(self):
        def fake_for(codex_line):
            def fake(args, **kw):
                if args[:3] == ["image", "inspect", "--format"] and "{{.Id}}" in args[3]:
                    return subprocess.CompletedProcess(args, 0, b"sha256:abc\n", b"")
                if args[0] == "image":
                    return subprocess.CompletedProcess(args, 0, f"arm64 linux {container.inputs_key()}".encode(), b"")
                bins = "".join(f"{b} /usr/bin/{b} {'0' * 64}\n" for b in ("claude", "codex", "srt", "bwrap", "python3", "git"))
                return subprocess.CompletedProcess(args, 0, f"{bins}CLAUDE_VERSION=2.1.331 (Claude Code)\n{codex_line}\n".encode(), b"")
            return fake
        with mock.patch.object(container, "dk", side_effect=fake_for("CODEX_VERSION=codex-cli 0.171.0")):
            self.assertEqual(container.image_record("x")["versions"], ["2.1.331 (Claude Code)", "codex-cli 0.171.0"])
        for bad in ("CODEX_VERSION=WARNING: codex_home under /tmp", "CODEX_VERSION=codex-cli 0.170.0", ""):
            with mock.patch.object(container, "dk", side_effect=fake_for(bad)):
                with self.assertRaises(Refused):
                    container.image_record("x")

    def test_removal_never_reads_an_unanswered_runtime_as_gone(self):
        def fake(args, **kw):
            rc = 1 if args[0] == "ps" else 0
            return subprocess.CompletedProcess(args, rc, b"", b"daemon down")
        with mock.patch.object(container, "dk", side_effect=fake):
            with self.assertRaises(Refused):
                container.remove("abc")
            with self.assertRaises(Refused):
                container.reconcile("lbl")

    def test_a_half_built_launch_is_torn_down(self):
        calls = []

        def fake(args, **kw):
            calls.append(args[0])
            if args[0] == "create":
                raise Refused("§4 container", "create failed")
            out = b"10.9.0.0/24" if args[:2] == ["network", "inspect"] else b""
            return subprocess.CompletedProcess(args, 0, out, b"")
        with mock.patch.object(container, "dk", side_effect=fake):
            with self.assertRaises(Refused):
                with container.Call(self.CFG, "img", "abc", "lbl", self.d, ["chatgpt.com"], self.d):
                    pass
        self.assertIn("rm", calls)
        self.assertEqual(list(self.d.glob("egress-*")), [])

    def test_egress_hosts_must_be_plain_names(self):
        cfg = read_json(HERE / "configs" / "fixture.json")
        agents = read_json(HERE / "agents.json")
        cfg["authors"] = ["claude", "codex"]
        cfg["container"] = {"image": "cr-bench-agent:1"}
        for bad in (["1.1.1.1"], ["chatgpt.com:443"], ["chat gpt.com"], ["localhost"]):
            agents["codex"]["egress"] = bad
            cp, ap = self.d / "c.json", self.d / "a.json"
            write_json(cp, cfg)
            write_json(ap, agents)
            with self.assertRaises(Refused):
                manifest.init_study(Study(self.d / f"s{len(bad[0])}"), cp, ap)

    def test_real_agents_need_the_container(self):
        with self.assertRaises(Refused):
            ag._real_call({"kind": "codex"}, "author", "", {}, self.d, 1)
        cfg = read_json(HERE / "configs" / "fixture.json")
        agents = read_json(HERE / "agents.json")
        cfg["authors"] = ["claude", "codex"]
        cp, ap = self.d / "c.json", self.d / "a.json"
        write_json(cp, cfg)
        write_json(ap, agents)
        with self.assertRaises(Refused):
            manifest.init_study(Study(self.d / "s1"), cp, ap)  # no container image
        cfg["container"] = {"image": "cr-bench-agent:1"}
        agents["codex"]["egress"] = ["*.openai.com"]
        write_json(cp, cfg)
        write_json(ap, agents)
        with self.assertRaises(Refused):
            manifest.init_study(Study(self.d / "s2"), cp, ap)  # a wildcard allowlist

    def test_seccomp_profile_is_derived_from_the_pinned_source(self):
        sys.path.insert(0, str(HERE / "container"))
        import make_seccomp
        self.assertEqual(make_seccomp.build(), (HERE / "container" / "seccomp-userns.json").read_bytes())
        prof = json.loads((HERE / "container" / "seccomp-userns.json").read_bytes())
        self.assertEqual(prof["defaultAction"], "SCMP_ACT_ERRNO")
        self.assertIn("unshare", prof["syscalls"][-1]["names"])

    @unittest.skipUnless(shutil.which("docker") and subprocess.run(["docker", "info"], capture_output=True).returncode == 0
                         and subprocess.run(["docker", "image", "inspect", "cr-bench-agent:1"], capture_output=True).returncode == 0,
                         "needs a running container runtime and the built cr-bench-agent:1 image")
    def test_live_boundary_in_the_real_image(self):
        # The runtime's VM shares only the workspace root, so the test works under it, with the real
        # HOME so the docker client finds its context.
        cfg = {"container": {"image": "cr-bench-agent:1"}, "caps": {}}
        with mock.patch.dict(os.environ, {"HOME": REAL_HOME}):
            img = container.image_id("cr-bench-agent:1")
            base = workspace.workspace_root(cfg)
            root = workspace.new_dir(base)
            try:
                self._live(cfg, img, root)
            finally:
                workspace.remove(root)

    def _live(self, cfg, img, root):
        agent = {"kind": "codex", "egress": ["chatgpt.com"], "login_store": {"mode": "none"}, "isolation": {}}
        r = cprobe.boundary_probes(cfg, "test", agent, img, root, root / "bp", "checker", [str(Path(self._d)), "/Users"])
        failed = [k for k, v in r["checks"].items() if not v and k != "vendor endpoint reachable"]
        self.assertEqual(failed, [], r)
        self.assertEqual(container.reconcile("test"), [])


class Grading(Tmp):
    task = {"instance_id": "x", "FAIL_TO_PASS": ["f"], "PASS_TO_PASS": ["p"]}

    def _w(self, text):
        p = self.d / "plain.txt"
        p.write_text(text)
        return p

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

    def test_grader_check_needs_every_flag_and_complete_rows(self):
        cfg = {"evaluation": {"python": "3.11", "harness": "swebench==5.0.2"}, "snapshot": {"path": str(self.d / "s.jsonl")}}
        full = " ".join(grading.HARNESS_FLAGS)
        def ran(out):
            return mock.patch.object(grading.subprocess, "run", return_value=mock.Mock(stdout=json.dumps(out), returncode=0))
        with ran({"help": full, "bad_rows": {}}):
            self.assertTrue(grading.grader_check(cfg, ["a"])["ok"])
        with ran({"help": full.replace("--run_id", ""), "bad_rows": {}}):
            self.assertEqual(grading.grader_check(cfg, ["a"])["missing_flags"], ["--run_id"])
        with ran({"help": full, "bad_rows": {"a": "KeyError: 'image'"}}):
            r = grading.grader_check(cfg, ["a"])
            self.assertFalse(r["ok"])
            self.assertIn("image", r["why"])
        with ran("not json"):
            self.assertFalse(grading.grader_check(cfg, ["a"])["ok"])

    def test_collection_errors_are_failures(self):
        log = self.d / "test_output.txt"
        body = "==== ERRORS ====\nERROR collecting tests/test_x.py\nImportError while importing test module\n"
        log.write_text(">>>>> Start Test Output\n" + body + ">>>>> End Test Output\n")
        self.assertTrue(grading.collection_failed(log))
        log.write_text(body)  # no test-output markers: the harness log is incomplete
        self.assertFalse(grading.collection_failed(log))
        for marker in (">>>>> Tests Timed Out", ">>>>> Test timed out"):  # swebench 5, then older spelling
            log.write_text(">>>>> Start Test Output\n" + body + marker + "\n>>>>> End Test Output\n")
            self.assertFalse(grading.collection_failed(log))  # a timeout is never a collection verdict
        self.assertTrue(grading.collection_failed(self._w(body), swebench=False))
        log.write_text("1 passed in 0.1s\n")
        self.assertFalse(grading.collection_failed(log))
        task = {"FAIL_TO_PASS": ["f"], "PASS_TO_PASS": ["p"]}
        g = grading.judge_collection_failure(task, {})
        self.assertEqual((g["status"], g["a1_pass"], g["f2p_failed"], g["p2p_failed"]), ("graded", False, [], []))
        self.assertEqual(grading.judge_collection_failure(task, None)["status"], "infra_error")  # map unavailable
        self.assertEqual(grading.judge_collection_failure(task, {"p": "passed"})["status"], "infra_error")

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
