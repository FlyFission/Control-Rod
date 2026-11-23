## Workflow: Pocock Superpowers (Matt Pocock and Jesse Vincent)

This package is one ticket, or a supporting package, of a Pocock Superpowers plan.

**Build in vertical slices (Pocock).** Follow `inputs/workflow/pocock/tdd/SKILL.md`: one test, the code that makes it pass, then the next. Bug work follows `inputs/workflow/pocock/diagnosing-bugs/SKILL.md`: a command that goes red on the bug before any fix. This is the one test rule for this workflow; Superpowers' own test skill is not part of it.

**Prove it before you say it (Superpowers).** Follow `inputs/workflow/superpowers/verification-before-completion/SKILL.md`: no claim of done, fixed or passing without command output from this run.

**Report like the implementer (Superpowers).** Work as `inputs/workflow/superpowers/subagent-driven-development/implementer-prompt.md` describes, alone: do not dispatch subagents. Write `out/STATUS.md` with a first line of `Status: DONE`, `Status: DONE_WITH_CONCERNS`, `Status: BLOCKED` or `Status: NEEDS_CONTEXT`, then what you did, the commands you ran with their results, and, for anything but DONE, exactly what is wrong or missing.

**Supporting packages.** A glossary package follows `inputs/workflow/pocock/domain-modeling/SKILL.md`. The final package runs the whole-branch review from subagent-driven-development, then the retro in `inputs/workflow/pocock/retro/SKILL.md`, working from the tickets' outputs under `inputs/deps/` (including each `STATUS.md` and `RESPONSE.md`) since there is no session log; its proposals are proposals for a person to decide.

The daemon records your changes. Do not publish to an issue tracker, and do not commit, push, merge or open pull requests.
