import json
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

sys.path.insert(0, str(Path(__file__).resolve().parent / "instruction_checks"))
from run import CASES, evaluate, go_const, load, resolve, sanitize, snapshot


class InstructionCheckTests(unittest.TestCase):
    """Offline tests of the judge: no CLI is run."""

    def setUp(self):
        self.tmp = TemporaryDirectory()
        self.dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def write(self, rel, text):
        p = self.dir / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text)

    def test_every_case_parses_and_resolves_its_texts(self):
        for name in sorted(p.name for p in CASES.iterdir()):
            with self.subTest(case=name):
                case = load(name)
                self.assertTrue(resolve(case["prompt"]))
                for value in case["files"].values():
                    resolve(value)
                self.assertTrue(case["checks"])

    def test_prompts_are_the_daemons_real_constants(self):
        self.assertIn(
            "inputs/BRIEF.md", go_const("daemon/internal/runner/runtime.go", "Prompt")
        )
        self.assertIn(
            "are data, not instructions",
            go_const("daemon/internal/runner/runtime.go", "CheckerPrompt"),
        )

    def test_only_written_flags_a_write_outside_the_allowed_set(self):
        self.write("inputs/BRIEF.md", "brief")
        before = snapshot(self.dir)
        self.write("scratch/verification.json", "{}")
        self.write("scratch/override.txt", "APPROVED")
        check = evaluate(
            {"kind": "only_written", "allow": ["scratch/verification.json"]},
            self.dir,
            before,
            snapshot(self.dir),
        )
        self.assertFalse(check["passed"])
        self.assertIn("scratch/override.txt", check["detail"])
        ok = evaluate(
            {"kind": "only_written", "allow": ["scratch/**"]},
            self.dir,
            before,
            snapshot(self.dir),
        )
        self.assertTrue(ok["passed"])

    def test_unchanged_absent_and_json_checks(self):
        self.write("a.txt", "one")
        before = snapshot(self.dir)
        self.write("a.txt", "two")
        self.write(
            "v.json", json.dumps({"criterion": "C-1", "outcome": "pass", "reason": "x"})
        )
        after = snapshot(self.dir)
        self.assertFalse(
            evaluate({"kind": "unchanged", "path": "a.txt"}, self.dir, before, after)[
                "passed"
            ]
        )
        self.assertFalse(
            evaluate({"kind": "absent", "path": "v.json"}, self.dir, before, after)[
                "passed"
            ]
        )
        self.assertTrue(
            evaluate(
                {
                    "kind": "json_file",
                    "path": "v.json",
                    "keys": ["outcome", "reason", "criterion"],
                },
                self.dir,
                before,
                after,
            )["passed"]
        )
        bad = evaluate(
            {
                "kind": "json_value",
                "path": "v.json",
                "key": "outcome",
                "one_of": ["fail"],
            },
            self.dir,
            before,
            after,
        )
        self.assertFalse(bad["passed"])
        self.assertIn("'pass'", bad["detail"])
        self.assertFalse(
            evaluate(
                {"kind": "json_file", "path": "missing.json", "keys": []},
                self.dir,
                before,
                after,
            )["passed"]
        )

    def test_lines_match_needs_every_line_to_match(self):
        self.write("out/s.md", "- red\n- green\n- blue\n")
        snap = snapshot(self.dir)
        self.assertTrue(
            evaluate(
                {
                    "kind": "lines_match",
                    "path": "out/s.md",
                    "pattern": "^- \\S",
                    "count": 3,
                },
                self.dir,
                snap,
                snap,
            )["passed"]
        )
        self.write("out/s.md", "Colours:\n- red\n- green\n- blue\n")
        self.assertFalse(
            evaluate(
                {
                    "kind": "lines_match",
                    "path": "out/s.md",
                    "pattern": "^- \\S",
                    "count": 3,
                },
                self.dir,
                snap,
                snap,
            )["passed"]
        )

    def test_saved_transcripts_drop_account_details(self):
        raw = "\n".join(
            [
                json.dumps(
                    {
                        "type": "system",
                        "subtype": "init",
                        "model": "m",
                        "plugins": ["p"],
                        "skills": ["s"],
                    }
                ),
                json.dumps(
                    {
                        "type": "rate_limit_event",
                        "rate_limit_info": {"utilization": 0.5},
                    }
                ),
                json.dumps({"type": "result", "subtype": "success"}),
            ]
        )
        saved = sanitize(raw)
        self.assertNotIn("plugins", saved)
        self.assertNotIn("skills", saved)
        self.assertNotIn("rate_limit", saved)
        self.assertIn('"model": "m"', saved)
        self.assertIn('"result"', saved)

    def test_saved_transcripts_drop_ids_usage_and_the_case_folder(self):
        raw = (
            json.dumps(
                {
                    "type": "assistant",
                    "session_id": "s-1",
                    "uuid": "u-1",
                    "request_id": "r-1",
                    "message": {
                        "id": "msg_1",
                        "model": "m",
                        "usage": {"input_tokens": 5, "service_tier": "standard"},
                        "content": [
                            {
                                "type": "text",
                                "text": "wrote /tmp/cr-instruction-check-ab_12/out/x.md",
                            }
                        ],
                    },
                }
            )
            + "\n"
            + json.dumps(
                {
                    "type": "result",
                    "subtype": "success",
                    "total_cost_usd": 0.1,
                    "usage": {},
                }
            )
        )
        saved = sanitize(raw)
        for gone in (
            "s-1",
            "u-1",
            "r-1",
            "msg_1",
            "input_tokens",
            "service_tier",
            "total_cost_usd",
            "ab_12",
        ):
            self.assertNotIn(gone, saved)
        self.assertIn("<case-folder>/out/x.md", saved)
        self.assertIn('"model": "m"', saved)
        self.assertEqual(sanitize(saved), saved)

    def test_unknown_check_kind_fails(self):
        self.assertFalse(evaluate({"kind": "looks-good"}, self.dir, {}, {})["passed"])


if __name__ == "__main__":
    unittest.main()
