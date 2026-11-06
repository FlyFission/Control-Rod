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


if __name__ == "__main__":
    unittest.main()
