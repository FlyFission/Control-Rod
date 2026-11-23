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

## Fix round

Review findings were fixed in a later commit on this branch. These runs are from the author agent on macOS with PostgreSQL 17; they are not in the retained logs or the [SHA-256 manifest](evidence.sha256), which cover the earlier author run. Counts are from the terminal output, not typed estimates.

| Command | Result |
| --- | --- |
| `cd daemon && go test ./...` | One failure, the known `TestInstalledCodexLeavesOnlyQualifiedFeatures`. In `go test ./... -v`: 220 top-level tests passed, 14 skipped, 1 failed. Loopback and the process probe worked in this run, so the earlier blocked daemon rows (`TestDaemonRunsInBoundCheckout`, the wire boundary test) now run and pass. |
| `cd daemon && go vet ./...`; `GOOS=windows go vet ./internal/runner` | Passed, no output. |
| `cd services/api && CONTROLROD_TEST_PG_DIR=/opt/homebrew/opt/postgresql@17/bin npx vitest run test/runs.test.ts` | 37 passed of 37, including the bound dispatch test that earlier stopped in setup. |
| `... npx vitest run test/repos-materialize.test.ts -t "checkout binding"` | 9 passed (2 existing, 7 new), 26 skipped. |
| `CONTROLROD_TEST_PG_DIR=/opt/homebrew/opt/postgresql@17/bin pnpm --filter ./services/api test` | 70 files, 844 tests passed. |
| `pnpm -r run typecheck` | Passed for the four projects with a typecheck script. |

New tests, one per fix. Failure without the fix was confirmed by reverting it for `TestCheckoutCaptureRefusesLinkedRunDirectory`, `TestUncontainedRunKeepsCheckoutCustody` and the `runs.test.ts` changes; the others test behaviour that did not exist before the fix: `TestCheckoutCaptureRefusesLinkedRunDirectory`, `TestUncontainedRunKeepsCheckoutCustody`, `TestCheckoutLockLivesOutsideTheCheckout`, `TestCheckoutHostContainment`, `TestDaemonRefusesCheckoutOverProtectedFolders`, `TestCheckoutRefusesGitAdministrationInsideTheCheckout`, `TestCheckoutBeforeStartRefusesHeadDrift`, `TestCheckoutRunDirectoryIsRemovedWithCustody`, `TestClaimAdvertisesCheckoutSupportOnlyWhereCustodyWorks`; in `runs.test.ts` the hold-reason assertion and the two trace-checkout tests; in `repos-materialize.test.ts` the `checkout binding refusals` group. The non-Unix test `TestNoCheckoutSupportWithoutCustody` only compiles here.

Not exercised: the real Claude and Codex sandboxes with a checkout, a signed-in provider run, and the external strict custody validator. The sandbox write scope for a checkout run is unchanged: the working directory, which contains the run's inputs and out directories.

### Second fix round

After a blind check of the first fix commit: staging and capture now go through `os.Root` handles, the checkout's branch and HEAD are re-read after the run, and the trace gains an additive `checkout_final` field (`spec/records.tsp`; `pnpm spec` regenerated the schemas and `schema.d.ts`). `spec-generation.log` and `evidence.sha256` were then regenerated against the final contract: no script in the repository produces them, so the command on the log's first line was rerun (with the changed-file list taken against the branch base `d0a4cc6`, because the changes are committed), its output was stripped of terminal formatting with the workspace path replaced by `<workspace>`, and `shasum -a 256 *.log` rebuilt the manifest. Only `spec-generation.log`'s digest changed.

| Command | Result |
| --- | --- |
| `pnpm spec` | Completed; 55 runner schemas embedded (one new, `CheckoutObserved`). |
| `cd daemon && go test ./...` | Only the known `TestInstalledCodexLeavesOnlyQualifiedFeatures` failed. With `-v`: 225 top-level tests passed, 14 skipped, 1 failed. |
| `cd daemon && go vet ./...`; `GOOS=windows go vet ./internal/runner` | Passed. |
| `CONTROLROD_TEST_PG_DIR=/opt/homebrew/opt/postgresql@17/bin pnpm --filter ./services/api test` | 70 files, 844 tests passed. |
| `pnpm -r run typecheck` | Passed. |

The staging test cannot race a swap; it pre-places links where staging would write and asserts nothing lands outside. The capture test swaps the output path after the handle is opened and asserts the original files are read. `os.Root` itself is the control against a swap between a component check and the open.

### Third fix round

The checkout is opened once and compared with the validated path by device and inode; reservation, staging, capture and cleanup use that handle. The post-run audit confirms Git identity before it records branch and HEAD. Results: `go test ./...` in `daemon/` had only the known failure (227 top-level tests passed, 14 skipped, 1 failed); `go vet ./...` and `GOOS=windows go vet ./internal/runner` passed; `pnpm --filter ./services/api test` passed 70 files and 844 tests; `pnpm -r run typecheck` passed. Reverting the identity comparison makes `TestCheckoutAncestorSwappedAfterValidationIsRefused` fail.

### Fourth fix round

The run directory is opened at reservation and must be the directory created; staging and capture use that handle. `beforeStartCheck` also requires the checkout path to still name the held directory. The API requires a bound worktree's common Git directory to equal the named base clone's, and refuses a succeeded bound run with no trace. Results: `go test ./...` in `daemon/` had only the known failure (229 top-level tests passed, 14 skipped, 1 failed); `go vet ./...` and `GOOS=windows go vet ./internal/runner` passed; `pnpm --filter ./services/api test` passed 70 files and 846 tests; `pnpm -r run typecheck` passed. `spec/` is unchanged this round, so `spec-generation.log` still matches. With the reservation identity check disabled, `TestCheckoutRunDirectorySwappedForLinkIsRefused` fails (using a relative link; `os.Root` itself refuses an absolute one).

### Fifth fix round

Cleanup compares the held run handle with the entry at the run directory's name and removes only the same directory (`TestCheckoutCleanupLeavesAReplacedRunDirectoryAlone`). The API refuses a succeeded bound run whose trace has no `checkout_final` or whose `checkout_final.branch` differs from the frozen branch (`runs.test.ts`). Results: `go test ./...` in `daemon/` had only the known failure (230 top-level tests passed, 14 skipped, 1 failed); API suite 846 of 847 passed on the full run, the one failure being the known SEC-07 load flake, which passed when rerun alone; typecheck passed.

## Required links

[Basis](basis.md), [plan](plan.md), [risk](risk.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Retain relevant test commands, results and digests; disclose failures and platform limitations. Record the independent verdict separately.

## Source-lineage note

Local engineering evidence under the repository workflow. [Workflow source map](https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md)
