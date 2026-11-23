"""End-to-end dry run of the benchmark on the fixture tasks with stub agents. No network, no paid calls.

    python3 -m unittest bench/cross-check/test_bench.py
"""

import importlib.util
import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("bench", HERE / "bench.py")
bench = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bench)


class Stats(unittest.TestCase):
    def test_wilson_known_value(self):
        # 0 of 10: the upper bound of the 95% Wilson interval is 0.2775 (to 4 places).
        self.assertEqual(bench.wilson(0, 10), [0.0, 0.2775])
        self.assertIsNone(bench.wilson(0, 0))

    def test_mcnemar(self):
        self.assertEqual(bench.mcnemar_exact(1, 1), 1.0)
        self.assertEqual(bench.mcnemar_exact(6, 0), 0.0312)
        self.assertIsNone(bench.mcnemar_exact(0, 0))

    def test_verdict_parsing(self):
        self.assertEqual(bench.parse_verdict('x <verdict>{"verdict": "fail", "defects": ["a"]}</verdict>')["verdict"], "fail")
        self.assertEqual(bench.parse_verdict("no block")["verdict"], "inconclusive")
        self.assertEqual(bench.parse_verdict('<verdict>{"verdict": "maybe"}</verdict>')["verdict"], "inconclusive")
        self.assertEqual(bench.parse_verdict("<verdict>{not json}</verdict>")["verdict"], "inconclusive")


class Selection(unittest.TestCase):
    rows = [{"instance_id": f"r{i % 3}__t{i}", "repo": f"r{i % 3}", "difficulty": "<15 min fix" if i % 2 else "hard",
             "problem_statement": ""} for i in range(30)]

    def test_same_seed_same_tasks(self):
        sel = {"seed": 7, "n": 4, "difficulty": ["<15 min fix"], "max_per_repo": 2}
        a = bench.select_tasks(self.rows, sel, set())
        self.assertEqual(a, bench.select_tasks(list(reversed(self.rows)), sel, set()))
        self.assertEqual(len(a), 4)
        self.assertTrue(all(r["difficulty"] == "<15 min fix" for r in a))
        self.assertLessEqual(max(sum(r["repo"] == x for r in a) for x in ("r0", "r1", "r2")), 2)

    def test_excluded_never_selected(self):
        sel = {"seed": 7, "n": 30}
        out = bench.select_tasks(self.rows, sel, {"r0__t0", "r1__t1"})
        self.assertNotIn("r0__t0", [r["instance_id"] for r in out])
        self.assertEqual(len(out), 28)


class FixtureRun(unittest.TestCase):
    def test_end_to_end(self):
        with tempfile.TemporaryDirectory() as d, redirect_stdout(io.StringIO()):
            run = Path(d) / "fx"
            bench.main(["select", "--config", str(HERE / "configs" / "fixture.json"), "--out", str(run)])
            bench.main(["run", "--run", str(run)])
            bench.main(["evaluate", "--run", str(run)])
            with mock.patch("builtins.input", side_effect=["y", "", "n", "", "y", ""]):
                bench.main(["review", "--run", str(run)])
            bench.main(["score", "--run", str(run)])
            res = json.loads((run / "results.json").read_text())
            arms = res["arms"]
            # Fixtures: t1 and t3 resolve, t2 and t4 do not; every patch keeps the existing tests green.
            self.assertEqual(arms["A1"]["accepted"], 8)
            self.assertEqual(arms["A1"]["escaped_defects"], 4)
            # The TODO rule fails t2 and t3 for both checkers; only the strict stub fails t4.
            self.assertEqual(arms["A2"]["defects_caught"], 3)
            self.assertEqual(arms["A3"]["defects_caught"], 3)
            self.assertEqual(arms["A2"]["false_rejections"], 2)
            p = res["paired_on_test_escapes"]
            self.assertEqual((p["caught_only_by_cross"], p["caught_only_by_same"]), (1, 1))
            self.assertEqual(res["a4_pending_review"], 0)
            self.assertEqual(arms["A4"]["accepted"], 2)
            # A checker never saw the author's transcript: its prompt holds the issue and the diff only.
            prompt = (run / "calls" / "fixture__t1" / "stub-a" / "check-stub-b" / "prompt.md").read_text()
            self.assertIn("<diff>", prompt)
            self.assertNotIn("Applied the fix", prompt)
            self.assertIn("a dry run, not a result", (run / "share.md").read_text())

    def test_paid_run_needs_yes(self):
        with tempfile.TemporaryDirectory() as d:
            run = Path(d) / "p"
            cfg = json.loads((HERE / "configs" / "fixture.json").read_text())
            cfg["authors"] = ["claude", "codex"]
            (Path(d) / "c.json").write_text(json.dumps(cfg))
            out = io.StringIO()
            with redirect_stdout(out), mock.patch.object(bench, "call_agent") as call:
                bench.main(["select", "--config", str(Path(d) / "c.json"), "--out", str(run)])
                bench.main(["run", "--run", str(run)])
            call.assert_not_called()
            self.assertIn("--yes", out.getvalue())
            self.assertFalse((run / "calls").exists())


if __name__ == "__main__":
    unittest.main()
