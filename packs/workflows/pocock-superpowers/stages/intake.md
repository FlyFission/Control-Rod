## Workflow: Pocock Superpowers (Matt Pocock and Jesse Vincent)

This request runs under the hybrid: Matt Pocock's ends and Jesse Vincent's middle. Read `inputs/workflow/pocock/grilling/SKILL.md`, `inputs/workflow/pocock/to-tickets/SKILL.md` and `inputs/workflow/superpowers/writing-plans/SKILL.md` in full before you draft anything.

**Grill, by assumptions (Pocock).** Nobody can answer you during this run. Ask the questions of the request, the attachments and the code; settle what the material settles, and write every open question as an `assumptions` entry with `requires_confirmation: true` and `owner: "owner"`, most consequential first. The owner answers them in guided preparation. If the request brings new terms or real decisions, draft one package with no dependencies for the glossary entries and ADRs, as `inputs/workflow/pocock/domain-modeling/SKILL.md` describes.

**Slice like Pocock, plan like Superpowers.** Cut the work into tracer-bullet tickets, each a thin, complete path through every layer it touches, and draft **one package per ticket**. Write each ticket the way writing-plans writes a task, for an engineer who has never seen this codebase:
- `objective`: the slice, naming the files it creates or changes and the names and signatures it settles.
- `acceptance_criteria`: the tests that prove the slice end to end and the exact checks to run.
- `depends_on`: the ticket's blocking edges, and nothing else.
- `design_inputs`: the tickets and glossary package it relies on.

**Last, review and retro.** Add one final package that depends on every ticket and lists every one of them in `design_inputs`, so their outputs reach it. Its objective is two things in one report: the whole-branch review subagent-driven-development runs at the end, and then the retro in `inputs/workflow/pocock/retro/SKILL.md`. Its deliverable is `REVIEW-AND-RETRO.md`; its role is `general-author`.

Set no `workflow` field yourself; the server sets it from the request. Do not publish to an issue tracker, and do not commit, push or open pull requests.
