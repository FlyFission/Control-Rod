# Verification: worktree daemon binding

Codex ran these as author checks. The independent checker must be from a different vendor family and receives only the diff, retained outputs and acceptance criteria. Author checks do not constitute acceptance.

| Command | Author result |
| --- | --- |
| `pnpm spec` | [Passed](spec-generation.log). A fresh generation reproduced the recorded hashes for the changed contract outputs. |
| `pnpm --filter @control-rod/api typecheck` | [Passed](api-typecheck.log). |
| `pnpm --filter @control-rod/api exec vitest run test/repos-materialize.test.ts -t 'checkout binding'` | [Passed](api-checkout-tests.log). Covers checkout identity and refusal. |
| `pnpm --filter @control-rod/api exec vitest run test/runs.test.ts -t 'bound checkout'` | [Blocked in setup](api-dispatch.log). The host refused a loopback listener; no test assertions ran. |
| `pnpm --filter @control-rod/api test` | [Blocked in setup](api-suite.log). The harness requires a test database URL or working PostgreSQL 17 binaries. |
| `go test ./internal/runner -run '^TestCheckout' -v` (from `daemon/`) | [Passed](checkout-tests.log). The fake author edited the selected checkout without changing the base checkout. Also covers changed or unsafe identity and a busy worktree. |
| `go test ./internal/runner -run '^TestDaemonRunsInBoundCheckout$' -v` (from `daemon/`) | [Blocked](daemon-integration.log). The launch reached the selected checkout; daemon process custody stopped it because this host refused `/bin/ps`. |
| `go test ./...` (from `daemon/`) | [Blocked](daemon-suite.log) in the unchanged wire boundary test when `httptest` tried to bind loopback. |
| `go vet ./...` (from `daemon/`) | Passed, exit status 0, no output. |
| `pnpm --filter @control-rod/web exec vitest run src/components/newwork.test.tsx` | [Passed](web-targeted.log). Covers the structured selection and the no-checkout path. |
| `pnpm --filter @control-rod/web typecheck` | [Passed](web-typecheck.log). |
| `pnpm --filter @control-rod/web test` | [Passed](web-suite.log). |
| `python3 tools/check_owner_decisions.py`; `python3 tools/check_redteam.py` | [Owner decision lint passed](owner-decisions-check.log); [red-team inventory lint passed](redteam-inventory-check.log). No red-team execution is claimed. |

The [SHA-256 manifest](evidence.sha256) covers the retained logs. Workspace and temporary paths are normalized and terminal formatting is stripped before hashing. The external strict custody validator and a signed-in provider run were not exercised in this session.

## Overseer runs

The overseer reported these full-suite results from macOS outside the author sandbox, with PostgreSQL 17, before the fixture fix. The reported results are separate from the retained author logs and the independent checker verdict.

| Suite | Overseer result |
| --- | --- |
| Go daemon | The only failure was the known `TestInstalledCodexLeavesOnlyQualifiedFeatures` failure. |
| API | `test/runs.test.ts` → `launch inputs` → `dispatches a bound checkout only to a capable author daemon` failed in `releasedPackage`: `/captures` returned `400 invalid-workspace-root` where the test expected `201`. The fixture used an OS temp directory outside the current home. The preparation-grants migration test also timed out once during the full suite; the preparation-grants suite passed 19/19 when run alone. |

The fixture now creates its workspace root and checkout under the canonical home directory. The production path check is unchanged. After the fix, API typecheck and `git diff --check` passed. The focused bound-dispatch test stopped in setup with `listen EPERM` on `127.0.0.1`; no assertions ran. The corrected API test and the full API suite still need a rerun outside the author sandbox.

## Required links

[Basis](basis.md), [plan](plan.md), [risk](risk.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Retain relevant test commands, results and digests; disclose failures and platform limitations. Record the independent verdict separately.

## Source-lineage note

Local engineering evidence under the repository workflow. [Workflow source map](https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md)
