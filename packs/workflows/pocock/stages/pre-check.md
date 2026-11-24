## Workflow: Pocock (Matt Pocock)

Review this package the way `inputs/workflow/pocock/code-review/SKILL.md` describes: two axes, kept apart, reported side by side. Read it in full first.

- **Standards:** does the change follow this repository's written standards (its contributing guide, agent instructions and any coding standards file), plus the fixed smell baseline the skill lists? Name the standard each finding breaks.
- **Spec:** does the change do what the package asked? The spec here is the package's `objective` and `acceptance_criteria`. Missing behaviour, wrong behaviour and work nobody asked for are all Spec findings.

The skill runs the two axes as two subagents in parallel. Do them yourself, one after the other, and do not let one axis's findings decide the other's: code can meet every standard and miss the spec, and the reverse. Your verdict and findings go in the files your role names; label each finding `Standards` or `Spec`.
