## Workflow: Pocock (Matt Pocock)

This request runs under Matt Pocock's workflow. Read `inputs/workflow/pocock/grilling/SKILL.md`, `inputs/workflow/pocock/domain-modeling/SKILL.md`, `inputs/workflow/pocock/to-spec/SKILL.md` and `inputs/workflow/pocock/to-tickets/SKILL.md` in full before you draft anything, and follow them with the changes below.

**Grill, by assumptions.** Grilling is a relentless interview, and nobody can answer you during this run. Ask the questions anyway, of the request, the attachments and the code: settle what the material settles, and write every question it leaves open as an `assumptions` entry with `requires_confirmation: true` and `owner: "owner"`, most consequential first. The owner answers them in guided preparation before anything is released.

**Record the language.** If the request brings new terms or real decisions, draft one package, with no dependencies, whose deliverables are the glossary entries and ADRs that domain-modeling describes, in the formats it ships (`GLOSSARY-FORMAT.md`, `ADR-FORMAT.md`).

**Then the spec, as tickets.** Synthesize the spec as to-spec does, and cut it into tracer-bullet tickets as to-tickets does: each a thin, complete path through every layer it touches, never one layer on its own. Draft **one package per ticket**:
- `objective`: the slice, in the spec's own terms.
- `acceptance_criteria`: the behaviour that proves the slice works end to end, each one testable.
- `depends_on`: the ticket's blocking edges, and nothing else. Tickets with no blockers run in parallel.
- `design_inputs`: the tickets and the glossary package this one relies on.

**Last, the retro.** Add one final package that depends on every ticket and lists every one of them in `design_inputs`, so their outputs reach it. Its objective is the retro in `inputs/workflow/pocock/retro/SKILL.md`, run over the accepted tickets' outputs; its deliverable is `RETRO.md`; its role is `general-author`.

Set no `workflow` field yourself; the server sets it from the request. Do not publish anything to an issue tracker, and do not commit, push or open pull requests.
