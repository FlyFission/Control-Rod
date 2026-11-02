Verification: reviewed committed `c4d0362`, matching `phase-3/inbox`, using the requested three-dot diff. Uncommitted merge changes were excluded. Static review only; no tests run or files modified.

Against round 1 and its adjudication:

- **P3B-01 — Partial:** restart permission is checked correctly; SCRAM reconciliation routing still uses incomplete standing (P3B-08). Evidence: `services/api/src/inbox.ts:105–130`.
- **P3B-02 — Closed:** individual unknown-outcome items check reconciliation authority against package needs. Evidence: `services/api/src/inbox.ts:63–71`.
- **P3B-03 — Closed:** release descriptors now enforce the submission SCRAM guard. Evidence: `services/api/src/work.ts:2056–2062`, `2107`.
- **P3B-04 — Closed:** confirmation has its own item, requirements digest, authority check and preparation destination. Evidence: `services/api/src/inbox.ts:77–86`.
- **P3B-05 — Partial:** preparation edits and confirmations are counted; the claimed coverage of every signed human act remains incomplete. Evidence: `services/api/src/inbox.ts:142–190`; `services/api/src/admin.ts:695–697`.
- **P3B-06 — Closed:** missing results now count against the criterion inventory. Evidence: `services/api/src/inbox.ts:239–245`.
- **P3B-07 — Closed:** Inbox/badge keys and cursors include identity; sign-in/out clear caches. Evidence: `apps/web/src/pages/Inbox.tsx:36–54`, `components/Shell.tsx:19–20,44–45`, `pages/SignIn.tsx:20–21`, `lib/storage.ts:25–26`.

| ID | Severity | Finding | Evidence (file:line) | Fix |
|---|---|---|---|---|
| P3B-08 | High | **SCRAM reconciliation uses fictitious package needs.** With only unknown-outcome blockers remaining, a General-service checker receives a Safety/Material SCRAM in “needs me” despite lacking the required grade, discipline or license. Conversely, an appropriately qualified Material-only checker can be excluded because `{}` defaults to General service. This violates OV-01. | `services/api/src/inbox.ts:106`, `123`; default qualification requirements: `services/api/src/authority.ts:62–68`; actual reconciliation guard: `services/api/src/work.ts:1138`, `1153` | Retain the unknown runs’ package identities and evaluate reconciliation standing against each package’s actual needs. Route to the viewer only when at least one outstanding reconciliation is theirs. |
| P3B-09 | High | **SCRAM-held recovery work still becomes everyone’s actionable queue.** After an author run stops under SCRAM, with quarantine reviewed but restart outstanding, an unqualified non-administrator still receives its dispute in “needs me”: the no-verification fallback bypasses all refused actions. Requeue also deterministically refuses under SCRAM. Reconciled lost runs have the same unconditional routing problem. The badge therefore counts work the viewer cannot resolve. | Routing: `services/api/src/inbox.ts:69–70`, `95–97`; stopped-run projection: `services/api/src/work.ts:2233–2240`; requeue SCRAM refusal: `services/api/src/work.ts:1388` | Project recovery eligibility, including SCRAM holds, before routing. Remove the unconditional fallback; show held recovery work waiting on restart when no action is available to the viewer. |

Mediums: artifact loading is **partial**, since prepared subjects still load/hash author and checker bytes (`work.ts:312`; `preparation/artifacts.ts:16–23`; `preparation/results.ts:279–291`). The digest upper-bound Medium is **closed** (`inbox.ts:170–174`), as is binding-scope wording (`binding.ts:17–29`). Remaining signature coverage omits signed administrative acts such as credential revocation and qualification issuance (`admin.ts:281–306`, `695–697`); count these without double-counting SCRAM commands. Spend remains deferred to task 5.2.

BLOCK