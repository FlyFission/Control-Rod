# Trace: Council-first direction

**Change slug:** `council-first-direction`
**Owner:** Ben Huffer
**Date:** 2026-11-23

---

| ID | Claim | Basis link | Control / design feature | Evidence | Ship posture | Status |
|---|---|---|---|---|---|---|
| C-001 | Every number in ADR 0024 and the research README comes from a committed script output. | `risk.md` Success criterion | Outputs committed beside scripts | E-001, E-004 | Merge | pass |
| C-002 | Every committed output reproduces byte for byte from committed inputs, issue snapshots included. | `risk.md` Success criterion | `reproduce.sh` | E-001 | Merge | pass |
| C-003 | The new text passes the public-claims and originality checks. | `risk.md` Success criterion | `tools/check_public_claims.py`, `tools/check_originality.py` | E-002, E-003 | Merge | pass |
| C-004 | No AGENTS.md rule 2 trust surface is edited; the only CODEOWNERS path touched is `docs/adr/`. | `plan.md` Not touched | Diff scope | E-005 | Merge | pass |
| C-006 | ADR 0024 is accepted only by the owner's recorded yes. | `risk.md` Trust surface | `ship.md` Signature table | E-006 | Hold until recorded | pending |
| C-005 | ADR 0024 decisions 1 to 7 match the owner's messages, and the kernel and policy parts of 6 and 7 are left for signed changes. | `basis.md` Mission / need | Owner read | E-004 | Merge | pending owner read |
| N-001 | **Not claimed:** that the personas are real users, or any assurance, certification or compliance. | `risk.md` | none | none | n/a | n/a |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

- Every claim has a status.

## Source-lineage note

Structure follows nuclear-grade context engineering; public source map at https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. No compliance claim is made.
