# Trace: Reading comfort in the web app

**Purpose:** Tie each claim to its basis, control, evidence and merge stance.

**Change slug:** `reading-comfort`
**Owner:** Ben Huffer
**Date:** 2026-11-05

---

| ID | Claim | Basis link | Control / design feature | Evidence | Ship posture | Status |
|---|---|---|---|---|---|---|
| C-001 | Outside scene art, readable text is never set below 14px except through a `--fs-*` token, and the smallest token is 11px. | `basis.md` row 1 | Type tokens; `type-scale.test.ts` | E-001, E-004 | Merge | pass |
| C-002 | Every plain text colour in the three stylesheets is at WCAG AA or better; `--text`, `--text-2` and `--muted` are AAA on every page ground. | `basis.md` row 5 | `contrast.ts`; `contrast.test.ts` | E-002 | Merge | pass |
| C-003 | Logs and previews use `--lh-mono`; agent prose and page intros use `--measure`; code blocks and tables are not narrowed. | `basis.md` rows 2, 4 | `styles.css` | E-004, E-006 | Merge | pass |
| C-004 | A reader can pause a running log, sees how many lines arrived meanwhile, and resumes to the latest; a finished run offers no pause. | `basis.md` row 7 | `RunCard` | E-003 | Merge | pass |
| C-005 | Larger text does not break reflow or accessibility checks on any place. | `basis.md` row 1 | Browser suite | E-005 | Merge | pass |
| C-006 | No trust surface is edited; no dependency, font file or network host is added. | `plan.md` | Diff scope | E-007 | Merge | pass |
| N-001 | **Not claimed:** any effect on eye strain, fatigue or comfort outcomes. | `basis.md` Not claimed | none | none | n/a | n/a |
