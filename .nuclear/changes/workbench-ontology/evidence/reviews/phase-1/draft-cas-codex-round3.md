| Item | Result | Evidence |
|---|---|---|
| CAS-02 | Fixed | [client.ts:43](apps/web/src/api/client.ts:43) delegates to `send`, which returns the response ETag at line 61. [PackagePage.tsx:144](apps/web/src/pages/PackagePage.tsx:144) caches the saved package and tag before closing the editor. [criteria.test.tsx:64](apps/web/src/pages/criteria.test.tsx:64) mounts a package query, makes subsequent GETs fail, and asserts the second PUT uses the saved tag. |
| New major or critical defects | None identified | Static inspection only. No files modified or tests run. |

MERGE