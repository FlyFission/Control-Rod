import contextlib
import io
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import check_workflow_timeouts
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

    def test_nested_multiline_quoted_scalar_cannot_spoof_uses(self):
        untimed = (
            "jobs:\n"
            "  build:\n"
            "    runs-on: ubuntu-latest\n"
            "    env:\n"
            '      MSG: "hello\n'
            '    uses: fake/reusable"\n'
        )
        findings = timeout_findings(untimed)
        self.assertEqual(len(findings), 1)
        self.assertIn("no timeout-minutes", findings[0])

        timed = untimed + "    timeout-minutes: 10\n"
        self.assertEqual(timeout_findings(timed), [])

    def test_nested_sequence_multiline_quoted_scalar_cannot_spoof_uses(self):
        untimed_step = (
            "jobs:\n"
            "  build:\n"
            "    runs-on: ubuntu-latest\n"
            "    steps:\n"
            '      - run: "hello\n'
            '    uses: fake/reusable"\n'
        )
        findings = timeout_findings(untimed_step)
        self.assertEqual(len(findings), 1)
        self.assertIn("no timeout-minutes", findings[0])

        untimed_needs = (
            "jobs:\n"
            "  build:\n"
            "    runs-on: ubuntu-latest\n"
            "    needs:\n"
            '    - "hello\n'
            '    uses: fake/reusable"\n'
        )
        findings = timeout_findings(untimed_needs)
        self.assertEqual(len(findings), 1)
        self.assertIn("no timeout-minutes", findings[0])

    def test_multiline_closing_quote_trailing_text_and_comment(self):
        bad = (
            "jobs:\n"
            "  build:\n"
            "    runs-on: ubuntu-latest\n"
            '    name: "line1\n'
            '    line2" extra-token\n'
            "    timeout-minutes: 10\n"
        )
        findings = timeout_findings(bad)
        self.assertEqual(len(findings), 1)
        self.assertIn("trailing text after closing quote", findings[0])

        good = (
            "jobs:\n"
            "  build:\n"
            "    runs-on: ubuntu-latest\n"
            '    name: "line1\n'
            '    line2" # trailing comment\n'
            "    timeout-minutes: 10\n"
        )
        self.assertEqual(timeout_findings(good), [])

    def test_needs_sequence_accepted_and_stray_sequence_after_scalar_rejected(self):
        good = (
            "jobs:\n"
            "  build:\n"
            "    needs:\n"
            "    - build\n"
            "    runs-on: ubuntu-latest\n"
            "    timeout-minutes: 10\n"
        )
        self.assertEqual(timeout_findings(good), [])

        bad = (
            "jobs:\n"
            "  build:\n"
            "    runs-on: x\n"
            "    - item\n"
            "    timeout-minutes: 10\n"
        )
        findings = timeout_findings(bad)
        self.assertEqual(len(findings), 1)
        self.assertIn("unsupported job key", findings[0])

    def test_step_block_scalar_does_not_swallow_sibling_env_key(self):
        text = (
            "jobs:\n"
            "  build:\n"
            "    runs-on: ubuntu-latest\n"
            "    steps:\n"
            "      - run: |\n"
            "        echo hi\n"
            "        env:\n"
            '          FOO: "hello\n'
            "    timeout-minutes: 10\n"
            '      world"\n'
        )
        findings = timeout_findings(text)
        self.assertEqual(len(findings), 1)
        self.assertIn("no timeout-minutes", findings[0])

        bare_seq = (
            "jobs:\n"
            "  build:\n"
            "    runs-on: ubuntu-latest\n"
            "    steps:\n"
            "      - |\n"
            "        echo hi\n"
            "      - env:\n"
            '          FOO: "hello\n'
            "    timeout-minutes: 10\n"
            '      world"\n'
        )
        findings = timeout_findings(bare_seq)
        self.assertEqual(len(findings), 1)
        self.assertIn("no timeout-minutes", findings[0])

    def test_quoted_and_colon_or_dotted_nested_keys_track_multiline_quotes(self):
        for nested_line in [
            '      "FOO": "line1\n',
            '      foo:bar: "line1\n',
            '      foo.bar: "line1\n',
        ]:
            with self.subTest(nested_line=nested_line):
                text = (
                    "jobs:\n"
                    "  build:\n"
                    "    runs-on: ubuntu-latest\n"
                    "    env:\n"
                    + nested_line
                    + "    timeout-minutes: 10\n"
                    + '      line2"\n'
                )
                findings = timeout_findings(text)
                self.assertEqual(len(findings), 1)
                self.assertIn("no timeout-minutes", findings[0])

    def test_flow_collections_single_line_passes_and_multiline_fails_closed(self):
        good = (
            "jobs:\n"
            "  build:\n"
            "    needs: [lint, test]\n"
            '    strategy: { matrix: { os: ["ubuntu-latest"] } }\n'
            "    runs-on: ubuntu-latest\n"
            "    timeout-minutes: 10\n"
        )
        self.assertEqual(timeout_findings(good), [])

        bad_job = (
            "jobs:\n"
            "  build:\n"
            "    runs-on: ubuntu-latest\n"
            '    needs: [ "a", "b\n'
            "    timeout-minutes: 10\n"
            '      c" ]\n'
        )
        findings = timeout_findings(bad_job)
        self.assertTrue(any("flow collection" in f for f in findings))

        bad_nested = (
            "jobs:\n"
            "  build:\n"
            "    runs-on: ubuntu-latest\n"
            "    env:\n"
            '      ITEMS: [ "a", "b\n'
            "    timeout-minutes: 10\n"
            '      c" ]\n'
        )
        findings = timeout_findings(bad_nested)
        self.assertTrue(any("flow collection" in f for f in findings))

    def test_rejects_empty_null_or_non_scalar_uses(self):
        for uses_line in [
            "    uses:\n",
            '    uses: ""\n',
            "    uses: ''\n",
            "    uses: null\n",
            "    uses: ~\n",
            "    uses: |\n      ./.github/workflows/other.yml\n",
            "    uses: []\n",
        ]:
            with self.subTest(uses_line=uses_line):
                text = "jobs:\n  reuse:\n" + uses_line
                findings = timeout_findings(text)
                self.assertEqual(len(findings), 1)
                self.assertIn("uses must be a non-empty workflow path", findings[0])

    def test_rejects_doc_end_and_post_jobs_multi_document_markers(self):
        for text in [
            "jobs:\n  a:\n    runs-on: x\n    timeout-minutes: 5\n...\n",
            "jobs:\n  a:\n    runs-on: x\n    timeout-minutes: 5\nconcurrency: main\n---\nname: second\n",
            "jobs:\n  a:\n    runs-on: x\n    timeout-minutes: 5\nconcurrency: main\n...\n",
        ]:
            with self.subTest(text=text):
                findings = timeout_findings(text)
                self.assertTrue(any("multi-document" in f for f in findings))

    def test_explicit_indent_block_scalar_genuinely_skips_unclosed_quote_and_deep_tab(self):
        text = (
            "jobs:\n"
            "  build:\n"
            "    runs-on: ubuntu-latest\n"
            "    env: |2\n"
            '      FOO: "unclosed\n'
            "      \tindented-with-tab\n"
            "    timeout-minutes: 10\n"
        )
        self.assertEqual(timeout_findings(text), [])

    def test_single_line_closing_quote_trailing_text_fails_and_comment_passes(self):
        bad_cases = [
            (
                "job scalar trailing text",
                "jobs:\n  build:\n    runs-on: ubuntu-latest\n"
                '    name: "a" extra\n    timeout-minutes: 10\n',
            ),
            (
                "job scalar hash without whitespace",
                "jobs:\n  build:\n    runs-on: ubuntu-latest\n"
                '    name: "a"#notcomment\n    timeout-minutes: 10\n',
            ),
            (
                "uses trailing text",
                'jobs:\n  reuse:\n    uses: "./w.yml" extra\n',
            ),
            (
                "nested sequence trailing text",
                "jobs:\n  build:\n    runs-on: ubuntu-latest\n"
                '    steps:\n      - "a" extra\n    timeout-minutes: 10\n',
            ),
        ]
        for label, text in bad_cases:
            with self.subTest(label=label):
                findings = timeout_findings(text)
                self.assertEqual(len(findings), 1)
                self.assertIn("trailing text after closing quote", findings[0])

        good = (
            "jobs:\n"
            "  build:\n"
            "    runs-on: ubuntu-latest\n"
            '    name: "a" # ok\n'
            "    timeout-minutes: 10\n"
        )
        self.assertEqual(timeout_findings(good), [])

    def test_malformed_and_trailing_flow_collections_fail_closed(self):
        cases = {
            "malformed flow collection": (
                "jobs:\n  build:\n    runs-on: ubuntu-latest\n"
                "    needs: [a}\n    timeout-minutes: 10\n"
            ),
            "trailing text after flow collection": (
                "jobs:\n  build:\n    runs-on: ubuntu-latest\n"
                "    needs: [a] extra\n    timeout-minutes: 10\n"
            ),
        }
        for expected, text in cases.items():
            with self.subTest(expected=expected):
                findings = timeout_findings(text)
                self.assertEqual(len(findings), 1)
                self.assertIn(expected, findings[0])

    def test_main_reports_finding_count_when_workflow_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_root = Path(tmp)
            wf_dir = tmp_root / ".github" / "workflows"
            wf_dir.mkdir(parents=True)
            bad_wf = wf_dir / "bad.yml"
            bad_wf.write_text("jobs:\n  build:\n    runs-on: ubuntu-latest\n", encoding="utf-8")

            stdout = io.StringIO()
            with (
                mock.patch.object(check_workflow_timeouts, "ROOT", tmp_root),
                mock.patch.object(check_workflow_timeouts, "workflow_files", return_value=[bad_wf]),
                contextlib.redirect_stdout(stdout),
            ):
                rc = check_workflow_timeouts.main()

            self.assertEqual(rc, 1)
            output = stdout.getvalue()
            self.assertIn(".github/workflows/bad.yml: build: no timeout-minutes", output)
            self.assertIn("1 workflow timeout finding(s)", output)

    def test_rejects_yaml_anchors_aliases_and_tags_in_scalars(self):
        anchored_env = (
            "jobs:\n"
            "  build:\n"
            "    runs-on: ubuntu-latest\n"
            "    env:\n"
            '      MSG: &message "first line\n'
            "    timeout-minutes: 10\n"
            '      last line"\n'
        )
        findings = timeout_findings(anchored_env)
        self.assertTrue(findings)
        self.assertTrue(any("unsupported YAML anchor, alias, or tag" in f for f in findings))

        bad_cases = [
            (
                "job-level tag",
                "jobs:\n  build:\n    runs-on: ubuntu-latest\n"
                '    name: !tag "first line\n    timeout-minutes: 10\n      last line"\n',
            ),
            (
                "nested tag",
                "jobs:\n  build:\n    runs-on: ubuntu-latest\n    env:\n"
                '      MSG: !tag "first line\n    timeout-minutes: 10\n      last line"\n',
            ),
            (
                "job-level alias",
                "jobs:\n  build:\n    runs-on: *runner\n    timeout-minutes: 10\n",
            ),
            (
                "nested alias",
                "jobs:\n  build:\n    runs-on: ubuntu-latest\n    env:\n"
                "      MSG: *alias\n    timeout-minutes: 10\n",
            ),
            (
                "nested sequence anchor",
                "jobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n"
                '      - &step "x\n    timeout-minutes: 10\n      y"\n',
            ),
            (
                "nested sequence tag",
                "jobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n"
                '      - !tag "x\n    timeout-minutes: 10\n      y"\n',
            ),
            (
                "nested sequence alias",
                "jobs:\n  build:\n    runs-on: ubuntu-latest\n    needs:\n"
                "      - *dep\n    timeout-minutes: 10\n",
            ),
        ]
        for label, text in bad_cases:
            with self.subTest(label=label):
                findings = timeout_findings(text)
                self.assertTrue(
                    any("unsupported YAML anchor, alias, or tag" in f for f in findings),
                    findings,
                )

    def test_allows_ampersand_and_bang_inside_quotes_steps_and_block_scalars(self):
        text = (
            "jobs:\n"
            "  build:\n"
            '    name: "a & b"\n'
            "    runs-on: ubuntu-latest\n"
            "    timeout-minutes: 10\n"
            "    env:\n"
            "      SCRIPT: |\n"
            "        &not-an-anchor\n"
            "        *not-an-alias\n"
            "        !not-a-tag\n"
            "    steps:\n"
            '      - run: "echo hi!"\n'
            "      - run: echo a && echo b\n"
            "      - run: |\n"
            "          &also-ok\n"
            "          !also-ok\n"
        )
        self.assertEqual(timeout_findings(text), [])

    def test_rejects_yaml_explicit_mapping_syntax(self):
        # Reproducer from Codex finding: explicit mapping under `env:` hides an unclosed quote.
        explicit_env = (
            "jobs:\n"
            "  build:\n"
            "    runs-on: ubuntu-latest\n"
            "    env:\n"
            "      ? MSG\n"
            '      : "first line\n'
            "    timeout-minutes: 10\n"
            '      last line"\n'
        )
        findings = timeout_findings(explicit_env)
        self.assertTrue(findings)
        self.assertTrue(
            any("unsupported YAML explicit mapping syntax" in f for f in findings),
            findings,
        )

        bad_cases = [
            (
                "nested key indicator",
                "jobs:\n  build:\n    runs-on: ubuntu-latest\n    env:\n"
                "      ? k\n    timeout-minutes: 10\n",
            ),
            (
                "nested value indicator",
                "jobs:\n  build:\n    runs-on: ubuntu-latest\n    env:\n"
                "      : v\n    timeout-minutes: 10\n",
            ),
            (
                "nested bare key indicator",
                "jobs:\n  build:\n    runs-on: ubuntu-latest\n    env:\n"
                "      ?\n    timeout-minutes: 10\n",
            ),
            (
                "nested bare value indicator",
                "jobs:\n  build:\n    runs-on: ubuntu-latest\n    env:\n"
                "      :\n    timeout-minutes: 10\n",
            ),
            (
                "nested tab key indicator",
                "jobs:\n  build:\n    runs-on: ubuntu-latest\n    env:\n"
                "      ?\tk\n    timeout-minutes: 10\n",
            ),
            (
                "nested tab value indicator",
                "jobs:\n  build:\n    runs-on: ubuntu-latest\n    env:\n"
                "      :\tv\n    timeout-minutes: 10\n",
            ),
            (
                "nested sequence key indicator",
                "jobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n"
                "      - ? k\n    timeout-minutes: 10\n",
            ),
            (
                "nested sequence value indicator",
                "jobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n"
                "      - : v\n    timeout-minutes: 10\n",
            ),
            (
                "job sequence key indicator",
                "jobs:\n  build:\n    runs-on: ubuntu-latest\n    needs:\n"
                "    - ? k\n    timeout-minutes: 10\n",
            ),
        ]
        for label, text in bad_cases:
            with self.subTest(label=label):
                findings = timeout_findings(text)
                self.assertTrue(
                    any("unsupported YAML explicit mapping syntax" in f for f in findings),
                    findings,
                )

    def test_allows_question_and_colon_in_normal_values_and_scripts(self):
        text = (
            "jobs:\n"
            "  build:\n"
            '    name: "? : ok"\n'
            "    runs-on: ubuntu-latest\n"
            "    timeout-minutes: 10\n"
            "    env:\n"
            "      LITERAL_Q: ?prefixed\n"
            "      LITERAL_C: :prefixed\n"
            "      SCRIPT: |\n"
            "        ? not-a-mapping\n"
            "        : not-a-mapping\n"
            "    steps:\n"
            '      - run: "echo ? : ok"\n'
            "      - run: echo ? : ok\n"
            "      - run: |\n"
            "          ? shell-check\n"
            "          : shell-noop\n"
        )
        self.assertEqual(timeout_findings(text), [])

    def test_colon_prefixed_nested_keys_track_multiline_quotes(self):
        cases = [
            (
                "env colon-prefixed key hiding timeout-minutes",
                "jobs:\n  build:\n    runs-on: ubuntu-latest\n    env:\n"
                '      :value: "first line\n    timeout-minutes: 10\n      last line"\n',
            ),
            (
                "env colon-prefixed key hiding uses",
                "jobs:\n  build:\n    runs-on: ubuntu-latest\n    env:\n"
                '      :value: "first line\n    uses: org/repo/.github/workflows/ci.yml@main\n      last line"\n',
            ),
            (
                "env double-colon key hiding timeout-minutes",
                "jobs:\n  build:\n    runs-on: ubuntu-latest\n    env:\n"
                '      :: "first line\n    timeout-minutes: 10\n      last line"\n',
            ),
            (
                "sequence item colon-prefixed key hiding timeout-minutes",
                "jobs:\n  build:\n    runs-on: ubuntu-latest\n    needs:\n"
                '    - :value: "first line\n    timeout-minutes: 10\n      last line"\n',
            ),
        ]
        for label, text in cases:
            with self.subTest(label=label):
                findings = timeout_findings(text)
                self.assertEqual(len(findings), 1, findings)
                self.assertIn("no timeout-minutes", findings[0])

    def test_tab_separators_in_nested_keys_and_sequences_track_multiline_quotes(self):
        cases = [
            (
                "quoted env key with tab after colon",
                "jobs:\n  build:\n    runs-on: ubuntu-latest\n    env:\n"
                '      "MSG":\t"first line\n    timeout-minutes: 10\n      last line"\n',
            ),
            (
                "quoted env key with tabs around colon",
                "jobs:\n  build:\n    runs-on: ubuntu-latest\n    env:\n"
                '      "MSG"\t:\t"first line\n    timeout-minutes: 10\n      last line"\n',
            ),
            (
                "steps sequence dash-tab quoted scalar",
                "jobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n"
                '      -\t"first line\n    timeout-minutes: 10\n      last line"\n',
            ),
            (
                "steps sequence dash-space-tab quoted scalar",
                "jobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n"
                '      - \t"first line\n    timeout-minutes: 10\n      last line"\n',
            ),
            (
                "steps sequence dash-tab mapping with tab after colon",
                "jobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n"
                '      -\trun:\t"first line\n    timeout-minutes: 10\n      last line"\n',
            ),
            (
                "steps sequence dash-space-tab quoted key with tab after colon",
                "jobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n"
                '      - \t"MSG":\t"first line\n    timeout-minutes: 10\n      last line"\n',
            ),
            (
                "needs sequence dash-tab quoted scalar",
                "jobs:\n  build:\n    runs-on: ubuntu-latest\n    needs:\n"
                '    -\t"first line\n    timeout-minutes: 10\n      last line"\n',
            ),
            (
                "needs sequence dash-space-tab quoted scalar",
                "jobs:\n  build:\n    runs-on: ubuntu-latest\n    needs:\n"
                '    - \t"first line\n    timeout-minutes: 10\n      last line"\n',
            ),
        ]
        for label, text in cases:
            with self.subTest(label=label):
                findings = timeout_findings(text)
                self.assertEqual(len(findings), 1, findings)
                self.assertIn("no timeout-minutes", findings[0])


if __name__ == "__main__":
    unittest.main()
