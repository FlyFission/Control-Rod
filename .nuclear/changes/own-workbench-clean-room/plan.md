# Plan: own workbench, clean-room Kandev patterns

**Purpose:** Keep the change bounded to documentation and make its checks easy to repeat.

**Change slug:** `own-workbench-clean-room`
**Owner:** Ben Huffer
**Date:** 2026-10-22

---

## Change context

- **Slug:** `own-workbench-clean-room`
- **Related records:** `risk.md`, `basis.md`
- **Owner:** Ben Huffer
- **Date:** 2026-10-22
- **Branch:** `docs/kandev-patterns`, cut from `mvp/site-concept` at `87d0f79`, in a separate worktree so the main checkout is untouched

## Charter and anchor check

| Check | Result |
|---|---|
| Objective still matches `risk.md#mission-anchor` | yes |
| Any work outside the non-goals? | no; documentation and this packet only |
| Scope change during the work | the fifth note file (observed behaviour) had not arrived; the pattern file marks it pending |

## Build sequence

1. Read the readers' brief, then note files A to D in full.
2. Create the worktree and branch; create this packet with the tool in Standard mode.
3. Read AGENTS.md, the ADR template, ADRs 0002, 0011, 0012 and 0018, and the CADCraft packet for style.
4. Check every note claim about our code at file and line on `87d0f79` (API, daemon, spec, kernel), and read OpenAI's non-interactive docs for Codex defaults.
5. Write `docs/patterns/kandev.md`: 73 merged patterns by area, pitfalls, UX ideas, pending observed-behaviour section, claims table and build plan.
6. Write ADR 0019 and `docs/patterns/README.md`; add one line to `docs/README.md`.
7. Scan for code blocks, em dashes and contrast constructions; confirm changed paths; validate this packet; commit locally.

## Two-speed work plan

| Track | Work | Status |
|---|---|---|
| Fast | README, docs index line, packet | pass |
| Careful | Code claim checks; clean-room wording; ADR license wording | pass for claims; wording check passed after fixes |

## HPI task preview

| Task | Trap | Countermeasure |
|---|---|---|
| Merging notes | Carrying a reader's sentence that echoes Kandev's docs | Rewrite every entry in the builder's words; independent wording check |
| Code claims | Trusting a note's description of our code | Read each cited line; mark confirmed, partly true or wrong |
| ADR | Writing a legal conclusion | State our reading and require a lawyer |
| Style | Em dashes and "X, not Y" | Scan and rewrite |

## Agent briefing

The AI agent works only in the worktree on `docs/kandev-patterns`, reads the note files and Control Rod's code, writes docs and this packet, and commits locally. It may not open Kandev's docs or source, push, edit trust surfaces, or touch the main checkout.

## Affected files and assets

| Area | Paths |
|---|---|
| Decision | `docs/adr/0019-own-workbench-clean-room.md` |
| Patterns | `docs/patterns/kandev.md`, `docs/patterns/README.md` |
| Index | `docs/README.md` |
| Records | `.nuclear/changes/own-workbench-clean-room/` |

## Non-goals

- No code, spec, policy, workflow or red-team change; each Now item gets its own change record.
- No legal opinion.
- No raw notes or screenshots committed.

## Dependency / model / tool decisions

| Decision | Choice | Record |
|---|---|---|
| Use of Kandev | Ideas only, through clean-room notes; Ben may run it unmodified for his own coding | ADR 0019 |
| Licenses | Apache-2.0 core, private packs | ADR 0002 |

## Review checkpoints

| Checkpoint | Required before moving on | Status |
|---|---|---|
| Code claims | Every claim cited and marked | pass |
| No code or copied text | No code blocks; builder attestation | pass |
| Style | No em dashes; contrast constructions rewritten | pass |
| Trust surfaces | Only docs and packet paths changed | pass |
| Packet validates | `ng.py validate --strict-custody` passes | pass |
| Independent wording check | Someone who did not write the file compares it with Kandev's docs | pass after fixes (E-006) |
| Owner review | Ben approves | planned |

## Rollback approach

Revert the commit on the branch, or the merge commit on `main`. No data, services or external state exist.

## Proof commands

```bash
git diff --name-only mvp/site-concept...docs/kandev-patterns
grep -c '```' docs/patterns/kandev.md docs/adr/0019-own-workbench-clean-room.md
LC_ALL=C grep -nP '\xE2\x80[\x93\x94]' docs/patterns/*.md docs/adr/0019-own-workbench-clean-room.md
python3 -I /root/refs/nuclear-grade-context-engineering/tools/ng.py validate --strict-custody .nuclear/changes/own-workbench-clean-room
```

## Required links

- `risk.md`, `basis.md`, `trace.md`, `verification.md`, `ship.md`
- `docs/adr/0019-own-workbench-clean-room.md`, `docs/patterns/kandev.md`

## Exit criteria

- A reviewer can repeat every result from the proof commands and the cited lines.
- Every claim has a status label.
- The wording check ran (E-006); its findings are fixed and rechecked.

## Source-lineage note

Plan structure follows nuclear-grade context engineering; public source map at https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. No compliance claim is made.
