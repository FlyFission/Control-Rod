Reviewed committed `phase-3/inbox` at `7fb89df` using the requested three-dot diff. Static review only; no files modified or tests run.

Against `inbox-codex-round4.md:7–9` and the closure claims in `inbox-adjudication.md:47–49`:

- **P3B-11 — Closed:** `holdRun` compares both reason and cause; resolved package holds clear before subsequent checks; independence replaces older holds (`services/api/src/work.ts:246–261,814–857`).
- **P3B-12 — Partial:** preparation recovery checks reviewer qualifications, but omits the hardware-key requirement for returning Safety/Material work (`services/api/src/inbox.ts:73–76`; `services/api/src/work.ts:2122–2123`). See P3B-14.
- **P3B-13 — Closed:** independence routing checks both qualifications and current hardware-key eligibility (`services/api/src/inbox.ts:65–71`), matching override enforcement (`services/api/src/work.ts:1494–1495`).

| ID | Severity | Finding | Evidence (file:line) | Fix |
|---|---|---|---|---|
| P3B-14 | High | **Preparation recovery counts viewers who cannot sign its resolution.** A qualified Safety/Material reviewer holding only a software passkey passes `signingGaps` and receives the preparation hold in `items`. Returning it deterministically fails the hardware-key floor. This violates OV-01. | `services/api/src/inbox.ts:73–76,119–121`; `services/api/src/work.ts:2082–2084,2122–2123`; `services/api/src/authority.ts:131–136` | Derive preparation recovery eligibility from the actual return descriptor, including hardware-key standing; otherwise route to an eligible reviewer. |
| P3B-15 | High | **Held intake agents disappear from Inbox entirely.** A classified capture queues an intake run before any package exists. If its runtime pin mismatches, claim records an administrator-resolvable hold. Inbox enumerates only `office()` package items, so the administrator never receives that hold, even though they can resolve it. This violates OV-01. | Capture/intake creation: `services/api/src/work.ts:104–115`; pin hold: `services/api/src/work.ts:883–886`; package-only enumeration: `services/api/src/work.ts:2199–2202`; Inbox source: `services/api/src/inbox.ts:94` | Include held capture/intake runs in attention enumeration, route by actual resolution authority, and provide a destination for the capture or pin command. |

Medium: the digest counts only the viewer’s disputes but can state “No disputes are open” while others remain open (`services/api/src/inbox.ts:275–278`); qualify that wording or count all open disputes. Prepared-artifact hashing remains the accepted Medium; spend remains deferred to task 5.2.

BLOCK