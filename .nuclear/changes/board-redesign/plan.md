# Plan: board redesign design spec

1. Gather research and an evidence-graded decision ledger ([evidence](evidence/00-decision-ledger.md)).
2. Build mockups in three looks and iterate to a v4 that reflects the reviews.
3. Run three adversarial reviews from one brief and filter them into a synthesis.
4. Write the design spec and this change record. Owner reviews the spec. Done: the owner approved the spec on 2026-11-06 ("approved, write the implementation plan") and chose subagent-driven execution ("subagent-driven, go ahead"); see E-05 in [verification](verification.md).
5. Implement one slice per pull request, each with its own change record:

| Slice | Delivers | Depends on |
|---|---|---|
| M1 Board home | `/` is the board; six columns with Person verifies; card face with kind, grade, next line from the actions endpoint; meaning colors and symbols; looks A, B, C as token themes; axe clean in all three | none |
| M2 Lenses | Kind filter, Needs you, Mine, color by, group by, density, URL state, saved views, default-view guard | M1 |
| M3 Move to and actions | Card action button and Move to menu from ActionDescriptor; refusal shown in place; keyboard path | M1 |
| M4 Quick add | Inline add, chained Enter, paste many, capture card face, inline lane classification | M1 |
| M5 Card view: Activity | Run feed with attestation per claim, honest usage, Stop with recorded outcome, note-to-next-run box | M1, M3 |
| M6 Code review | Diff of retained outputs, line comments batched into Return, since-last-review, sign panel wording | M5 |
| M7 Document review | Markdown with source-position comments; PDF viewer with page-keyed side comments; Download original; Verify and Accept panels | M5, M6 |
| M8 Visual pass | Impeccable refinement pass and critique across M1 to M7 | M1 to M7 |

6. Spikes gating parts of M6 and M7, each a throwaway branch with a written result: diff viewer (@pierre/diffs versus react-diff-view, and whether a comment survives a follow-up revision); PDF page-keyed comments with pdf.js; DOCX to PDF server conversion fidelity on a real SOW and a real calculation.
7. Owner validation after M7: the owner and one engineer each take one real code task and one real engineering-document task through the app; adjust before M8.

Only steps 1 to 4 are in this change. Implementation (steps 5 to 7) is authorized per slice by the owner's instruction, and each slice carries its own change record; this record authorizes no implementation.

The task-level implementation plan is `docs/superpowers/plans/2026-11-06-board-redesign.md` (15 tasks across slices M1 to M8, three spikes, owner validation).

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The design spec is complete, its evidence is retained in this packet, and the owner has reviewed it. No product code is part of this change; the board redesign is designed, not implemented, and no screen claim is made here beyond what the spec states.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
