## Workflow: Superpowers (Jesse Vincent)

This package is one task of a Superpowers plan. Work it as the implementer in `inputs/workflow/superpowers/subagent-driven-development/implementer-prompt.md` would, with the changes below. Read these in full first:
- `inputs/workflow/superpowers/test-driven-development/SKILL.md`: no production code without a failing test first. Code written before its test is thrown away and written again test-first.
- `inputs/workflow/superpowers/systematic-debugging/SKILL.md`: when anything fails or surprises you, find the root cause before you change code.
- `inputs/workflow/superpowers/verification-before-completion/SKILL.md`: no claim of done, fixed or passing without the command output that proves it, from this run.

**You are the implementer, alone.** Do not dispatch subagents; Control Rod gives each task its own run and its own independent check. Stay inside this package's objective. If the task cannot be done as written, say so; do not widen it.

**Report the way the implementer does.** Write `out/STATUS.md` with a first line of `Status: DONE`, `Status: DONE_WITH_CONCERNS`, `Status: BLOCKED` or `Status: NEEDS_CONTEXT`, then what you did, the commands you ran with their results, and, for anything but DONE, exactly what is wrong or missing. An honest BLOCKED is worth more than a doubtful DONE.

The daemon records your changes. Do not create worktrees or branches, and do not commit, push, merge or open pull requests.
