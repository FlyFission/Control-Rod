import unittest

from check_owner_decisions import AGENT_CHOICE, COLUMNS, check_basis

HEADER = "| " + " | ".join(COLUMNS) + " |\n|" + "---|" * len(COLUMNS) + "\n"


def basis(rows: str, date: str = "2026-11-19", header: str = HEADER) -> str:
    return f"# Basis: x\n\n**Date:** {date}\n\n## Owner decisions (fixed inputs)\n\n{header}{rows}\n## Assumptions\n\nnone\n"


GOOD = '| D1 | Start PL5 | "start PL5 and PL8" | 2026-11-19, Claude Code session | Build a first harness | CI wiring |\n'


class OwnerDecisionTests(unittest.TestCase):
    def test_quoted_words_and_agent_choices_pass(self):
        agent = f"| D2 | Use the daemon flags | {AGENT_CHOICE} | 2026-11-19, this record | As stated | Other runtimes |\n"
        self.assertEqual(check_basis(basis(GOOD + agent), "b"), [])

    def test_paraphrase_missing_date_and_empty_cells_fail(self):
        row = "| D1 | Start PL5 | The owner agreed | Claude Code session |  | |\n"
        problems = "\n".join(check_basis(basis(row), "b"))
        self.assertIn("quoted exactly", problems)
        self.assertIn("Given needs the date", problems)
        self.assertIn("Reading is empty", problems)
        self.assertIn("Out of scope is empty", problems)

    def test_old_header_fails_on_a_new_record(self):
        old = "| # | Decision |\n|---|---|\n"
        self.assertIn(
            "must have the columns",
            check_basis(basis('| D1 | "yes" |\n', header=old), "b")[0],
        )

    def test_older_records_and_records_without_the_section_are_left_alone(self):
        old = "| # | Decision |\n|---|---|\n"
        self.assertEqual(
            check_basis(
                basis("| D1 | paraphrase |\n", date="2026-11-18", header=old), "b"
            ),
            [],
        )
        self.assertEqual(
            check_basis(
                "# Basis\n\n**Date:** 2026-11-20\n\nNo owner decisions here.\n", "b"
            ),
            [],
        )


if __name__ == "__main__":
    unittest.main()
