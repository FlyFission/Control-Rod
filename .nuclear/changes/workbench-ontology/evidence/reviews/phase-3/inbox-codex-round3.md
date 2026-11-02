Verification: reviewed `phase-3/inbox` at `0d051403` using `git diff origin/buildout/controlled-preparation-20261023...phase-3/inbox`. The worktree’s HEAD is on `phase-3/case`. Static review only; no files modified or tests run.

- **P3B-08 — Closed:** unknown runs retain package IDs, and reconciliation standing uses each package’s needs (`scram.ts:366–372`; `inbox.ts:140–147`).
- **P3B-09 — Closed:** SCRAM-held recovery no longer enters everyone’s queue through the unconditional fallback (`inbox.ts:78–81,105–117`).
- **Signed-administration Medium — Closed:** direct administrative signatures are counted, excluding SCRAM commands already counted separately (`inbox.ts:175–223`; `admin.ts:695–697`).
- **Digest-bound and binding-scope Mediums — Closed:** event reads stop at the reported head; binding text includes preparation and criterion evidence (`inbox.ts:195–200`; `binding.ts:17–29`).
- **Artifact-bytes Medium — Partial, accepted:** legacy subjects avoid byte loading; prepared subjects still hash author outputs and checker evidence (`work.ts:308–319`; `preparation/artifacts.ts:16–23`; `preparation/results.ts:279–302`). Preserving integrity checks justifies retaining this behavior pending optimization; it does **not** establish acceptable Inbox performance.

| ID | Severity | Finding | Evidence (file:line) | Fix |
|---|---|---|---|---|
| P3B-10 | High | **Waiting-agent permissions still route to every viewer.** With SCRAM inactive, every `permission` item enters `mine` without checking who can resolve its cause. A queued checker awaiting an independence override therefore counts against an unqualified Member, although the override requires approver standing. Administrator-only runtime-pin holds have the same problem. This violates OV-01 and inflates the web “needs me” badge. | Unconditional routing: `services/api/src/inbox.ts:62–81`; independence hold: `services/api/src/work.ts:830–840`; override authority: `services/api/src/work.ts:1449,1476`; pin authority: `services/api/src/admin.ts:593–595`; badge: `apps/web/src/components/Shell.tsx:19–21`. | Project the held run’s actual blocking cause and permitted resolution. Check the viewer’s qualification or administrative authority before routing; otherwise place it under waiting on others with the responsible role and reason. |

Mediums: prepared-artifact loading remains an accepted performance risk, as above. Spend is appropriately deferred to task 5.2.

BLOCK