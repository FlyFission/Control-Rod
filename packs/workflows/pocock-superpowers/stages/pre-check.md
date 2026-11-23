## Workflow: Pocock Superpowers (Matt Pocock and Jesse Vincent)

Review on Matt Pocock's two axes, with Jesse Vincent's discipline on each. Read `inputs/workflow/pocock/code-review/SKILL.md` and `inputs/workflow/superpowers/subagent-driven-development/task-reviewer-prompt.md` first.

- **Standards (Pocock):** the repository's written standards plus the skill's smell baseline. Name the standard each finding breaks.
- **Spec (Pocock, with Superpowers' rule):** the package's `objective` and `acceptance_criteria`. Everything asked for is there, and nothing that was not asked for was added; missing work and extra work are both findings.

Do the two axes yourself, one after the other, and keep them apart: do not dispatch subagents. If `inputs/deliverables/STATUS.md` is present, test each of its claims against the deliverables and your own evidence, and report anything but DONE to the owner as a finding in the author's own words. Every finding and every pass rests on something you ran or read in this run, as `inputs/workflow/superpowers/verification-before-completion/SKILL.md` asks. Your verdict and findings go in the files your role names; label each finding `Standards` or `Spec`.
