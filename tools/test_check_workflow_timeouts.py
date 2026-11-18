import unittest

from check_workflow_timeouts import timeout_findings

CLEAN = """name: ci
on:
  push:
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 20  # measured: two minutes
    steps:
      - run: echo hi
  reuse:
    uses: ./.github/workflows/other.yml
"""


class WorkflowTimeoutTests(unittest.TestCase):
    def test_accepts_bounded_and_reusable_jobs(self):
        self.assertEqual(timeout_findings(CLEAN), [])

    def test_refuses_each_defect(self):
        cases = {
            "no timeout-minutes": "    runs-on: x\n",
            "outside 1..60": "    runs-on: x\n    timeout-minutes: 360\n",
            "outside 1..60 (zero)": "    runs-on: x\n    timeout-minutes: 0\n",
            "plain integer": "    runs-on: x\n    timeout-minutes: ${{ vars.T }}\n",
            "plain integer (bool)": "    runs-on: x\n    timeout-minutes: true\n",
            "neither runs-on nor uses": "    steps: []\n",
        }
        for fragment, body in cases.items():
            with self.subTest(fragment=fragment):
                findings = timeout_findings("jobs:\n  j:\n" + body)
                self.assertEqual(len(findings), 1)
                self.assertIn(fragment.split(" (")[0], findings[0])

    def test_fails_loudly_when_it_sees_no_jobs(self):
        for text in ["", "name: ci\n", "jobs:\n", "jobs:\nname: x\n"]:
            with self.subTest(text=text):
                self.assertEqual(len(timeout_findings(text)), 1)

    def test_every_job_is_reported_not_just_the_first(self):
        text = "jobs:\n  a:\n    runs-on: x\n  b:\n    runs-on: x\n    timeout-minutes: 5\n  c:\n    runs-on: x\n"
        self.assertEqual([f.split(":")[0] for f in timeout_findings(text)], ["a", "c"])

    def test_keys_of_nested_blocks_do_not_count_as_job_keys(self):
        # `timeout-minutes` under a step (6+ spaces) must not satisfy the job-level rule.
        text = "jobs:\n  a:\n    runs-on: x\n    steps:\n      - name: s\n        timeout-minutes: 5\n"
        self.assertEqual(len(timeout_findings(text)), 1)

    def test_unreadable_job_declarations_are_reported_not_skipped(self):
        # Each form hides an uncapped job `b` behind a capped job `a`; passing would be a false pass.
        hidden = {
            "quoted": '  "b":\n    runs-on: x\n',
            "anchored": "  b: &base\n    runs-on: x\n",
            "inline": "  b: {runs-on: x}\n",
        }
        for name, block in hidden.items():
            with self.subTest(name=name):
                text = "jobs:\n  a:\n    runs-on: x\n    timeout-minutes: 5\n" + block
                findings = timeout_findings(text)
                self.assertEqual(len(findings), 1)
                self.assertIn("unsupported job declaration", findings[0])

    def test_a_second_jobs_block_is_reported(self):
        text = "jobs:\n  a:\n    runs-on: x\n    timeout-minutes: 5\njobs:\n  b:\n    runs-on: x\n"
        self.assertTrue(any("more than one" in f for f in timeout_findings(text)))

    def test_three_space_job_keys_cannot_spoof_uses_from_nested_env(self):
        text = (
            "jobs:\n"
            "  build:\n"
            "   runs-on: ubuntu-latest\n"
            "   env:\n"
            "    uses: ./.github/workflows/other.yml\n"
        )
        findings = timeout_findings(text)
        self.assertTrue(any("no timeout-minutes" in f for f in findings))

    def test_rejects_inconsistent_job_child_indentation(self):
        text = (
            "jobs:\n"
            "  build:\n"
            "      runs-on: ubuntu-latest\n"
            "    timeout-minutes: 10\n"
        )
        findings = timeout_findings(text)
        self.assertTrue(any("inconsistent" in f for f in findings))

    def test_rejects_three_space_job_header(self):
        text = "jobs:\n  a:\n    runs-on: x\n    timeout-minutes: 5\n   evil:\n     runs-on: x\n"
        findings = timeout_findings(text)
        self.assertTrue(any("unsupported job" in f for f in findings))

    def test_skips_steps_and_block_scalars_with_fake_keys(self):
        text = (
            "jobs:\n"
            "  build:\n"
            "    runs-on: ubuntu-latest\n"
            "    env:\n"
            "      SCRIPT: |-\n"
            "        uses: fake/reusable\n"
            "    name: |+\n"
            "      timeout-minutes: 5\n"
            "    steps:\n"
            "      - uses: actions/checkout@v4\n"
            "        timeout-minutes: 5\n"
        )
        findings = timeout_findings(text)
        self.assertTrue(any("no timeout-minutes" in f for f in findings))

    def test_rejects_duplicate_job_names(self):
        text = (
            "jobs:\n"
            "  build:\n"
            "    runs-on: x\n"
            "    timeout-minutes: 5\n"
            "  build:\n"
            "    runs-on: x\n"
        )
        findings = timeout_findings(text)
        self.assertTrue(any("duplicate job" in f for f in findings))

    def test_rejects_job_with_both_runs_on_and_uses(self):
        text = "jobs:\n  build:\n    runs-on: x\n    uses: ./.github/workflows/other.yml\n"
        findings = timeout_findings(text)
        self.assertTrue(any("both runs-on and uses" in f for f in findings))

    def test_rejects_tabs_and_multi_document_yaml(self):
        for text in [
            "jobs:\n\tbuild:\n    runs-on: x\n",
            "---\njobs:\n  a:\n    runs-on: x\n    timeout-minutes: 5\n---\njobs:\n",
        ]:
            with self.subTest(text=text):
                self.assertTrue(len(timeout_findings(text)) >= 1)

    def test_skips_multiline_quoted_scalars_and_explicit_indent_block_scalars(self):
        text = (
            "jobs:\n"
            "  build:\n"
            "    runs-on: ubuntu-latest\n"
            '    name: "line1\n'
            "    timeout-minutes: 5\n"
            '    uses: fake/reusable"\n'
            "    env: |2\n"
            "      timeout-minutes: 5\n"
        )
        findings = timeout_findings(text)
        self.assertTrue(any("no timeout-minutes" in f for f in findings))

    def test_quoted_scalar_with_trailing_comment_or_hash_inside_quotes(self):
        text = (
            "jobs:\n"
            "  build:\n"
            '    name: "hello # not a comment" # trailing comment\n'
            "    runs-on: ubuntu-latest\n"
            "    timeout-minutes: 15\n"
        )
        self.assertEqual(timeout_findings(text), [])

    def test_accepts_sequence_at_job_indent_under_needs_and_steps(self):
        text = (
            "jobs:\n"
            "  build:\n"
            "    needs:\n"
            "    - lint\n"
            "    runs-on: ubuntu-latest\n"
            "    timeout-minutes: 15\n"
            "    steps:\n"
            "    - uses: actions/checkout@v4\n"
            "      timeout-minutes: 5\n"
        )
        self.assertEqual(timeout_findings(text), [])


if __name__ == "__main__":
    unittest.main()
