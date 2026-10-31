| ID | Status | Evidence and assessment |
|---|---|---|
| CAS-01 | Fixed | [PackagePage.tsx:125](apps/web/src/pages/PackagePage.tsx:125) captures the draft and tag; refresh preserves editing text. [criteria.test.tsx:43](apps/web/src/pages/criteria.test.tsx:43) covers preservation and explicit conflict recovery. |
| CAS-02 | Not fixed | [PackagePage.tsx:143](apps/web/src/pages/PackagePage.tsx:143) awaits invalidation, which suppresses refetch errors by default. A successful PUT followed by a failed GET still closes the editor without obtaining the fresh tag. [criteria.test.tsx:24](apps/web/src/pages/criteria.test.tsx:24) mounts no package query, so it cannot verify refresh completion. |
| CAS-03 | Fixed | [draft-cas.test.ts:58](services/api/test/draft-cas.test.ts:58) holds the row lock, confirms both requests are waiting, then asserts one success, one stale refusal and exactly one edit event. |
| CAS-04 | Fixed | [draft-cas.test.ts:78](services/api/test/draft-cas.test.ts:78) unconditionally submits an invalid record against the dedicated draft and checks rejection, unchanged content and unchanged tag. |
| New major or critical defects | None identified | Static inspection only. No files modified or tests run. |

BLOCK