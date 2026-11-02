Verified committed `phase-3/case` at `d1bc70f` against the requested base. Static review only; no tests run or files modified.

Round 1 verification:

- **P3C-01 — Closed.** Stories poll while active, refetch on status changes and live events, and warn on failed refreshes. Evidence: `CasePage.tsx:215–221,268–269`; `live.ts:36`.
- **P3C-02 — Closed.** Draft wording now says “Signing binds revision…” and remains true for release and rejection. Evidence: `services/api/src/binding.ts:18–24`.
- **P3C-03 — Closed.** Both signing paths require successful action authorization; withdrawn permission removes the pending form, and refresh errors disable signing. Evidence: `DecisionBar.tsx:33–38,99,113–120`.
- **P3C-04 — Closed.** Actual custody and every non-independent coupling axis are displayed; the summary warning remains in compact tiers. Evidence: `CasePage.tsx:363–399,426–430`.
- **Mediums — Closed as originally stated.** Missing permission/tool fields now produce flags (`story.ts:97–102`); Sign shows the full subject digest (`DecisionBar.tsx:79–80`); the browser spec, command and output are committed (`phase3-exit.spec.ts`; `exit-checks.md:21–30`).

| ID | Severity | Finding | Evidence (file:line) | Fix |
|---|---|---|---|---|
| — | — | No new High or Critical defects found in the round 1 changes. | — | — |

Remaining Medium: the exit spec **logs rather than asserts** accessibility violations, keyboard stops, reflow failures and performance measurements. Consequently, “4 passed” alone does not establish those acceptance criteria. Add assertions against the collected results and applicable budgets (`apps/web/e2e/phase3-exit.spec.ts:99,113,131,143`).

Minor residual story honesty issue: after an initially empty response, a failed refresh still displays “No events were recorded” because that branch precedes the refresh warning (`CasePage.tsx:264–268`). Show loading/refresh status independently of the step count. Neither issue establishes a new High defect against the scoped §14 preview requirements.

MERGE