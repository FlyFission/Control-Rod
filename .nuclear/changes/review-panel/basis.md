# Basis: review panel design spec

**Change slug:** `review-panel`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-06
**Decision this basis supports:** whether the design spec `docs/superpowers/specs/2026-11-06-review-panel-design.md` is accepted as the target for a sliced build of a cross-model review panel inside Control Rod. This change is the spec only; no product code.

## Mission / need

The owner's most frequent workflow is having work produced in one coding tool reviewed by other models through their CLIs (Codex, Grok, Antigravity, Claude Code, Gemini), then reconciling what they say. That is manual today: write a brief, start each CLI with its own headless quirks, collect answers, check each claim against the code, merge. The need is a first-class review panel that returns one reconciled report whose findings are checked against the code before they count.

## Scope

In scope: the design spec, the research behind it ([evidence](evidence/08-cross-model-review.md)), and this change record. Out of scope: any change to the web app, kernel, daemon, sandbox, API, CLI, migrations, policies, workflows or `spec/`. The build is nine stand-alone slices (R1 to R9) that a second developer can pick up.

## Owner decisions (fixed inputs)

| # | Decision |
|---|---|
| P1 | The panel reviews work from any tool first (a branch, a pull request, a folder in any repository); Control Rod cards are one more target. Recorded 2026-11-06. |
| P2 | Build it inside Control Rod, through the daemon, the sandbox and the evidence trail (approach A), not as a standalone CLI or a Claude Code plugin. Recorded 2026-11-06. |

## Observed problem (2026-11-06 manual runs)

Manual cross-model review runs on 2026-11-06 showed the CLI quirks the spec's reviewer profiles must encode: it took three attempts to get Grok and Antigravity to run headless, and one reviewer returned a finding that cited a file that does not exist. The invented-file finding is the reason for the mandatory deterministic Stage 1 gate. The run artifacts are in the board-redesign record's review folder (`.nuclear/changes/board-redesign/evidence/review/`) on branch `board-redesign-spec`, PR #60. They are not copied into this packet and are not re-verified here; this record cites them as the origin of the problem, not as proof of the design.

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| Daemon print-mode runs (ADR 0020) and the OS sandbox (ADR 0021) can host a read-only reviewer seat without a kernel change. | Spec sections 6.2 and 7. | A slice finds it needs a kernel, policy, red-team or workflow change; it stops and raises an owner decision. |
| No reviewer seat is qualified yet. Existing evidence covers the author launch only, on WSL2 only (Claude Code 2.1.318, Codex 0.166.0); the full ADR 0021 suite and the red team fixtures await the owner's signature. Each reviewer invocation is gated by its own qualification (CLI version, platform, read-only grant). | Spec section 6.2 and `.nuclear/changes/workbench-ontology/evidence/phase6/`. | A seat is enabled without qualification of its exact invocation, or the evidence is found to cover more or less than stated. |
| A deterministic anchor check (path, lines, quote) removes findings that cite nonexistent code. | One observed case on 2026-11-06; research D5. | A fabricated finding passes Stage 1 in a fixture or in use. |
| Different-vendor seats give more independent review than same-vendor seats. | Research file; shared training and blind spots remain possible. | Evidence that vendors fail the same way on this work. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The design spec is complete, its research evidence is retained in this packet, and the owner has reviewed it. No product code is part of this change; the review panel is designed, not implemented, and no behavior claim is made here beyond what the spec states.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
