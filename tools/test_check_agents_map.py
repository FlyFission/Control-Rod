import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from check_agents_map import budget_problems, measure, missing_references, references


class AgentsMapTests(unittest.TestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / "docs" / "adr").mkdir(parents=True)
        (self.root / "docs" / "README.md").write_text("# Docs\n")
        (self.root / "CLAUDE.md").write_text("@AGENTS.md\n")

    def tearDown(self):
        self.tmp.cleanup()

    def write_agents(self, text):
        (self.root / "AGENTS.md").write_text(text)

    def test_existing_references_pass(self):
        self.write_agents(
            "Decisions: `docs/adr/`. See [docs](docs/README.md#start). Record: `.nuclear/changes/<slug>/`.\n"
        )
        self.assertEqual(missing_references(self.root), [])

    def test_broken_link_backtick_path_and_import_fail(self):
        self.write_agents("See [gone](docs/gone.md) and `docs/sqa/`.\n")
        (self.root / "CLAUDE.md").write_text("@OTHER.md\n")
        problems = "\n".join(missing_references(self.root))
        for ref in ("docs/gone.md", "docs/sqa/", "OTHER.md"):
            with self.subTest(ref=ref):
                self.assertIn(f"`{ref}`", problems)

    def test_references_outside_the_repository_fail(self):
        outside = Path(self.tmp.name).parent / "outside-agents-map.md"
        outside.write_text("x\n")
        try:
            self.write_agents(f"See [up](../{outside.name}) and [abs]({outside}).\n")
            problems = "\n".join(missing_references(self.root))
            self.assertEqual(problems.count("outside the repository"), 2)
        finally:
            outside.unlink()

    def test_urls_placeholders_and_plain_code_are_not_paths(self):
        refs = references(
            "[x](https://example.com/a) `ng.py`? no: `uv run` `src/*.ts` `<slug>/x` `rule-4`\n"
        )
        self.assertEqual(refs, [])

    def test_budget_refuses_growth_and_allows_shrinking(self):
        self.write_agents("short map\n")
        budget = self.root / "budget.json"
        budget.write_text(json.dumps(measure(self.root / "AGENTS.md")))
        self.assertEqual(budget_problems(self.root, budget), [])
        self.write_agents("short\n")
        self.assertEqual(budget_problems(self.root, budget), [])
        self.write_agents("short map, now with feature detail that belongs elsewhere\n")
        self.assertIn("over the recorded budget", budget_problems(self.root, budget)[0])

    def test_missing_budget_file_fails(self):
        self.write_agents("map\n")
        self.assertIn("missing", budget_problems(self.root, self.root / "none.json")[0])


if __name__ == "__main__":
    unittest.main()
