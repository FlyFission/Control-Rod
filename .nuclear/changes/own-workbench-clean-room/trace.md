# Trace: own workbench, clean-room Kandev patterns

**Purpose:** Tie each claim to its basis, control, evidence and merge stance.

**Change slug:** `own-workbench-clean-room`
**Owner:** Ben Huffer
**Date:** 2026-10-22

---

## Change context

- **Slug:** `own-workbench-clean-room`
- **Related records:** `basis.md`, `verification.md`
- **Owner:** Ben Huffer
- **Date:** 2026-10-22
- **Requirements cross-reference:** ADR 0019 conditions 1 to 7; `docs/patterns/kandev.md` section 11

## Trace summary

| ID | Claim | Basis link | Control / design feature | Verification evidence | Ship posture | Status |
|---|---|---|---|---|---|---|
| C-001 | ADR 0019 records the decision, six options with consequences, the clean-room procedure, Ben's personal use, and that license conclusions need a lawyer. | `basis.md#protected-outcomes` | ADR sections | E-001 | Merge | pass |
| C-002 | The pattern file and ADR carry ideas in our own words only. | `basis.md#protected-outcomes` | Clean-room roles; provenance header | E-002 (scan, attestation); E-006 (independent check); E-007 (rerun after E) | E-006 passed after fixes; E-007 clean | pass |
| C-003 | Every note claim about our code is checked, cited and marked. | `basis.md#derived-requirements-or-claims` | Claims table K01 to K29 | E-003, E-008 | Merge | pass |
| C-004 | Now holds confirmed gaps only, each with files and a trust-surface flag. | `basis.md#derived-requirements-or-claims` | Now table N1 to N9 | E-004, E-008 | Merge | pass |
| C-005 | No trust surface is edited. | AGENTS rule 2 | Docs-only change | E-005 | Merge | pass |
| C-006 | No em dashes and no "X, not Y" constructions. | `basis.md#protected-outcomes` | Style rewrite | E-005, E-007 | Merge | pass |
| C-007 | Note E is folded into section 10 and the build plan, with reasons for each priority change. | `basis.md#derived-requirements-or-claims` | Section 10; K25 to K29; N9; N2 addition | E-008 | Merge | pass |

## Evidence chain

```text
Risk: AGPL wording or a false code claim could reach the repository and steer the first build.
  -> Basis: ideas only; decision stated with a lawyer's review required; every code claim cited; Now from confirmed gaps; no trust surface touched.
  -> Control: reader and builder roles; provenance header; claims table at file and line; docs-only diff.
  -> Verification: scans and validator pass; claims re-readable at commit 87d0f79; independent wording check run, findings fixed, rechecked clean; note E folded in and the check rerun clean.
  -> Ship: merge after the wording check and Ben's review.
```

## Open trace gaps

| Gap | Why it matters | Disposition |
|---|---|---|
| Independent wording check not yet run | Only a check by someone who can read Kandev's docs can show no wording was carried over. | Done (E-006); findings fixed and rechecked. |
| License facts not re-checked by the builder | The ADR's context rests on the readers' report. | Lawyer's review (ADR 0019 condition 6). |
| Codex behaviour read from docs; no run on Ben's Mac yet | N1 assumes the documented defaults. | First real Codex run on the Mac, under N1's own change record. |
| Observed-behaviour notes (E) not yet available | Documented behaviour can differ from what Kandev does. | Closed: E arrived and is folded into section 10 (E-008); wording rerun clean (E-007). |

## Required links

- `basis.md`, `verification.md`, `ship.md`
- `docs/adr/0019-own-workbench-clean-room.md`, `docs/patterns/kandev.md`

## Exit criteria

- Every claim has a status.
- Gaps are not used as merge evidence until they pass.

## Source-lineage note

Trace structure follows nuclear-grade context engineering; public source map at https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. No compliance claim is made.
