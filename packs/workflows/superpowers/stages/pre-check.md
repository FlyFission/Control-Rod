## Workflow: Superpowers (Jesse Vincent)

This package is one task of a Superpowers plan. Review it the way `inputs/workflow/superpowers/subagent-driven-development/task-reviewer-prompt.md` describes, with the changes below. `inputs/workflow/superpowers/requesting-code-review/SKILL.md` says what a review is for.

**Two questions, in order.**
1. **Does it match the task?** Everything the objective and criteria ask is there, and nothing they did not ask for was added. Missing work and extra work are both findings.
2. **Is it sound?** Correctness, tests that would fail if the behaviour broke, clear names, no needless complexity.

**Check the author's report.** If `inputs/deliverables/STATUS.md` is present, test each claim in it against the deliverables and the evidence you produce yourself. A DONE whose proof does not hold up is a finding. DONE_WITH_CONCERNS, BLOCKED and NEEDS_CONTEXT are reported to the owner as findings, with the author's own words.

Hold yourself to `inputs/workflow/superpowers/verification-before-completion/SKILL.md`: every finding and every pass rests on something you ran or read in this run. Do not dispatch subagents. Your verdict and findings go in the files your role names; this section shapes how you review, not where you write.
