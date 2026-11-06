# Trace: review panel design spec

| Requirement | Slice | Tests (planned) | Disposition |
|---|---|---|---|
| G-1 One request from the terminal or the board runs several seats on different runtimes against one frozen snapshot. | R1, R2, R5 | Fixture-CLI run of multiple seats; snapshot digest recorded; `controlrod review` for folder and branch | designed, not implemented |
| G-2 Every seat runs headless, read only, sandboxed, one shot, from a per-CLI reviewer profile. | R1, R7 | One profile row per runtime (test fails if missing); Codex profile has `default_permissions` and no `-s` or `sandbox_mode`; qualification of each reviewer invocation shows credential reads and writes denied; write-canary test; seat outcomes incl. exit 0 with empty output, timeout, malformed | designed, not implemented |
| G-3 Findings return in one strict schema; a deterministic gate checks each against the snapshot before it counts. | R3 | Stage 1 tests: missing path, quote off by a line, lines out of range, diff location outside the change; base line ranges, deleted file, deleted lines, section resolves, missing and ambiguous | designed, not implemented |
| G-4 Duplicates merge with an agreement badge; empty seats never count as agreement. | R4 | Merge tests: same-vendor double counting, empty seats, lone critical, disagreement shows both quotes; quorum and vendor counts reported separately (3 requested, 2 answered from 2 vendors; 2 answered from 1 vendor) | designed, not implemented |
| G-5 A person disposes every finding; the report and dispositions are evidence. | R4, R5 | Accept, Reject with reason, Defer; report digest and dispositions recorded | designed, not implemented |
| G-6 On a card, one seat on a different provider can serve as the pre-check, with no kernel change. | R8 | Designated seat created as a `pre-check` run and completed through `finishPreCheck` (baseline, runtime, independence checks); no kernel diff | designed, not implemented |
| A-1 A panel is never shown as passed, an approval or a person verification. | R4, R5, R8 | Report text test; card text on Safety and Material work | designed, not implemented |
| A-2 No reviewer starts with a permission bypass flag or can write the snapshot. | R1, R7 | Profile test rejects bypass flags; write-canary voids a seat | designed, not implemented |
| A-3 No content reaches a provider before its lane is classified and admits it. | R2 | Lane gate test with a seat whose provider the lane does not admit; content policy tests with a tracked `.env`, a tracked key, an untracked `.env`, a scanner hit, and a non-interactive run without the confirmation digest | designed, not implemented |
| A-4 Agreement is presented as priority, not confidence. | R4 | Report wording test; same-vendor and empty-seat counting | designed, not implemented |
| Non-goals (unattended panels, debate rounds, judge model that rewrites severities, Gemini consumer sign-in) and open decisions in spec section 10 | none | none | open: owner decisions |

Requirement IDs G-1 to G-6 are the spec goals 1 to 6 in order; A-1 to A-4 are its anti-goals in order.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The design spec is complete, its research evidence is retained in this packet, and the owner has reviewed it. No product code is part of this change; the review panel is designed, not implemented, and no behavior claim is made here beyond what the spec states.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
