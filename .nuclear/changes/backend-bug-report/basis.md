# Basis

The supplied Control-Rod back-end report identifies confirmed findings H1–H7, M1–M19 and L1–L7 at main commit `36e481aa`. Its rejected findings and unchecked leads are outside this change. The supplied folder contained the report. The regression files referenced in it were absent.

The fixes cover organization-scoped API access, run and evidence handling, repository operations, and canonical digests. The owner authorized preparing the kernel decision change for review in the Codex conversation.

| Field | Entry |
|---|---|
| Question | “Control-Rod’s AGENTS.md requires a human signature before editing kernel decision functions. May I prepare the blank-provider fix (M3) on `fix/backend-bug-report` for your review, with merge approval still required on the exact diff?” |
| Answer | “Authorize preparing the kernel fix” |
| Where and when | Codex conversation, 2026-11-21 Eastern time |
| Recorded by | Implementing agent |

## Required links

[Basis](basis.md), [plan](plan.md), [risk](risk.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Implement and test the confirmed fixes, disclose platform and upgrade limits, and obtain the required owner decision before merge.

## Source-lineage note

Local engineering evidence under the repository workflow. [Workflow source map](https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md)
