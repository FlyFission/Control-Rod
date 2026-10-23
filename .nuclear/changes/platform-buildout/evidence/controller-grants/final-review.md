# Controller grants: final code review and disposition

Fresh independent agent reviewed frozen `ded5686e12a066cd5308cdd95f526aa52e701851..9c8ea084dfd5177411bee8b8846d25f789ddcddd` read-only, without delegated reviewers or checkout changes. Verdict: **With fixes for inactive branch publication**; two Important, one Minor, no Critical. This does not approve main integration, deployment or preparer activation. Root accepts those grades. The reviewer reran 28 existing targeted tests across five files and reproduced all three findings outside the checkout; it did not independently rerun the complete suite/build/restore/Go evidence. Costs below are consequences if a ruling is wrong, not measured monetary/token costs.

## Strengths reported

Auth before JSON parsing; narrow secrets/closed messages/duplicate rejection; locked existing origin pins and live scope/assignment fences; actual immutable proposal custody and one proposal slot; bounded current-fence retries with every-response commit guards; actual PG timeout/audit-lock/fatal disposal tests; explicit legacy role/body/launcher refusal.

## Findings and one implementer fix pass

1. **Important: missing original attachment silently omitted at issuance.** Frozen `grant-state.ts:303,329` checks surviving rows against basis but not basis against rows. Reproducer pinned original.txt, deleted its row, and issuance retained only snapshot/capture. Fix requires exact original attachment reference-set completeness before the existing per-row digest/revision checks. Root regression `refuses issuance when a pinned original attachment is missing` failed behaviorally before the fix and now passes, asserting no partial grant is committed.
2. **Important: expiry retirement falsely denies retained custody and offers unsupported recovery.** Frozen `work.ts:741` says nothing was recorded and owner can requeue; `RunLog.tsx:46` offers that action for all roles. Reproducer finalized a proposal, naturally expired the lease, swept it lost, and observed that message alongside one retained proposal. Root regression deterministically sets the actual DB lease into the past, then checks retirement preserves proposal/receipt bytes, names possible retained custody and refuses preparer requeue. Both role-specific rendered UI regressions failed before the guard and now pass. Unsupported roles receive accurate guidance; only explicit legacy roles offer requeue. No retained custody is deleted.
3. **Minor, deferred: new permit metadata can exceed a coherently shortened current lease.** Frozen `grants.ts:205` persists/returns the original grant deadline. Reviewer reproduced 60-second original versus 15-second shortened lease. Actual finalization and deferred guard enforce the shorter real lease, so no authorization bypass was shown; no public preparer lease-shortening path exists. Future integration must use min(original grant expiry, current lease) for each use and test that metadata. Kept as a tracked integration prerequisite; no runtime activation is allowed on this evidence.

`review-api-red/green.log` and `review-web-red/green.log` retain behavioral RED/GREEN; `reviewer-reproductions.ts.txt` retains the outside-checkout reproductions, including the deferred Minor. Full post-fix suite and publication evidence are in the ledger. There is no second review or second fix pass; fixes are implementer-selected local tests, not independent witnessing.

## Declined to judge and root rulings

- Approved coordinator/disclosure classification: absent; keep held. Cost if wrong: unauthorized disclosure despite valid narrow grants.
- Native filesystem/credentials/process/model-egress: unintegrated; keep held. Cost if wrong: process or data escape.
- Go distributed Authority adapter: disconnected; preserve synchronous contract until a separately specified bridge. Cost if wrong: stale authorization or lock starvation.
- External repository/document/dependency freshness and technical-preparer issuance: excluded initial projection; grants make no external-content claim. Cost if wrong: incomplete or stale domain inputs.
- Proposal semantic safety/future rendering: bytes are untrusted and never applied/rendered here. Cost if wrong: unsafe downstream interpretation or injection.
- Owner history/retrieval UI: future work; existing lost-run text/requeue were judged and fixed. Cost if wrong: unusable custody/recovery despite preserved bytes; retrieval remains an activation prerequisite.
- Global quotas/retention: finite per-grant limits exist; deployment-wide operations remain gated. Cost if wrong: unbounded trusted issuance/storage accumulation.
- Actual owner/passkey pilot, production restore, remote CI, main integration and deployment: not proved by local fixtures. Root separately verifies branch CI/publication; the other gates remain open. Cost if wrong: unsupported readiness/recovery claims.

The separate design adversary and final code reviewer varied context and role; tools, host and retained evidence remain coupled. Reviewer findings are advisory, root's dispositions are explicit, and no external engineering/security certification is claimed.
