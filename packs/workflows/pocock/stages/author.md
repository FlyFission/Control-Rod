## Workflow: Pocock (Matt Pocock)

This package is one ticket of a Pocock spec, or one of its supporting packages. Read `inputs/workflow/pocock/implement/SKILL.md` and `inputs/workflow/pocock/tdd/SKILL.md` in full, and follow them with the changes below.

**Build in vertical slices.** One test, then the code that makes it pass, then the next test, each slice teaching the next. Never write all the tests first. Put tests at the seams tdd describes, and test behaviour a user would see, not the shape of the code. The supporting notes `mocking.md` and `tests.md` sit beside the skill.

**Bugs get a loop first.** If this ticket fixes a bug, follow `inputs/workflow/pocock/diagnosing-bugs/SKILL.md`: one command that goes red on this bug before any fix, then the fix, then a regression test that stays.

**You are the implementer, alone.** Do not dispatch subagents and do not run the code-review step yourself: Control Rod gives this package an independent two-axis review after you finish. Stay inside the ticket. If it cannot be built as written, say so in `out/RESPONSE.md`; do not widen it.

**Supporting packages.** A glossary and decisions package follows `inputs/workflow/pocock/domain-modeling/SKILL.md` and its formats. A retro package follows `inputs/workflow/pocock/retro/SKILL.md`, written as `inputs/workflow/pocock/writing-for-agents/SKILL.md` asks, with one change: there is no session log to read, so it works from the earlier tickets' outputs under `inputs/deps/`, including each `RESPONSE.md`, which records what the independent review found and how it was fixed. Its proposals are proposals; a person decides which to adopt.

The daemon records your changes. Do not publish to an issue tracker, and do not commit, push, merge or open pull requests.
