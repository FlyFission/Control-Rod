# Cycle 1 Design Spec: PR Hardening & Clean Landing (`#69`, `#82`, `#83`) and Re-Anchoring `#84–#86`

- **Date:** 2026-11-16
- **Owner:** Ben Huffer
- **Status:** Draft for owner review (pre-implementation)
- **Scope:** Cycle 1 of the post-triage build plan (`#69` → `#82` → `#83` onto `main`, keeping `#84–#86` staged for Cycle 2)

---

## 1. Context & Goal

PRs `#69`, `#82`, `#83`, `#84`, `#85`, and `#86` are green in CI, but automated reviews (Codex and Copilot) plus an independent adversarial audit identified open boundary, correctness, contract-sync, and honest-UI issues in `#69`, `#82`, and `#83`. Meanwhile, `#84–#86` carry unplumbed multi-CLI, egress, outfall, and kernel changes that belong in Cycle 2 once `main` is solid.

**Cycle 1 goal:** Fix every open P1/P2, security, and honesty issue in `#69`, `#82`, and `#83`, ensure each PR meets repository governance (`AGENTS.md`, `docs/collaboration.md`, `CONTRIBUTING.md`), merge them in order to `main`, and re-anchor `#84 → #85 → #86` onto updated `main` without force-pushing.

**Explicitly out of scope for Cycle 1 (deferred to Cycle 2):**
- Parsing `[author:...]`, `[checker:...]`, or `[workspace:...]` into `work.ts` `Run` execution or mounting worktrees into `daemon/internal/runner/workspace.go`.
- Wiring Wave 2 adapters (`grok`, `opencode`, `agy`, `ollama`), `Explore` fan-out, `Compare` notes, or `/outfall/*` GitHub PR creation.
- Editing `.github/workflows/ci.yml` (remains unsigned until an owner explicitly signs the timeout diff).

---

## 2. Execution Order & Branch Topology

1. **`#69` (`claude/funny-fermi-hls5sp` → `main`):** Fix parser/evidence review findings on `#69`'s branch, verify CI (`ng.py validate --strict-custody` + unit tests), reply to and resolve all open review threads, and squash-merge `#69` to `main`.
2. **`#82` (`feat/workspace-ui-redesign` → `main`):** Merge `main` (post-`#69`) into `feat/workspace-ui-redesign`, apply all Section 4 fixes, commit with `Signed-off-by:` DCO trailers, verify local + CI tests green, resolve all review threads, and **merge-commit** `#82` to `main` (preserving commit ancestry for `#83` and `#84–#86`).
3. **`#83` (`feat/wave1-hardened-worktrees` → `main`):** Merge updated `#82` upward into `feat/wave1-hardened-worktrees`, retarget `#83`'s base branch from `feat/workspace-ui-redesign` to `main` once `#82` lands, apply all Section 5 fixes with DCO trailers, verify CI green, resolve all review threads, and **merge-commit** `#83` to `main`.
4. **Re-anchor `#84 → #85 → #86`:** Once `#83` lands on `main`, retarget `#84` to `main` and merge `main` upward through `#84 → #85 → #86`:
   - Expected merge conflicts in `services/api/src/repos.ts` (`#85` adds `/repos/freeze`; `#86` `c19b994` patched earlier symlink checks) and `apps/web/src/api/client.ts` (`#86` adds `checkpointRepo`/`freezeRepo`): resolve by keeping `#83`'s hardened `repos.ts` + `#85`'s `/repos/freeze` + TypeSpec-generated `client.ts` types.
   - Regenerate `docs/commands/inventory.md` on `#86` (via `tools/generate_command_inventory.py`) so `outfall.*` commands added in `9035421` pass `--check`.

---

## 3. `#69` Fixes (`claude/funny-fermi-hls5sp`)

### 3.1 `tools/check_workflow_timeouts.py` & `tools/test_check_workflow_timeouts.py`
- **Consistent per-job indentation:** Replace the hardcoded 4-space `JOB_KEY` regex with dynamic per-job indentation tracking:
  - Record `job_indent` from a job's first child key (`indent > 2`).
  - Flag any non-comment line inside a job whose indent satisfies `2 < indent < job_indent` as an unsupported/inconsistent indentation finding.
  - Stop scanning lines as job-level keys while inside `steps:` or multiline block scalars (`|` / `>`), resuming only when indentation returns to `<= job_indent`.
- **Duplicate job headers:** Flag duplicate job names under `jobs:` as an error instead of silently merging with `jobs.setdefault(...)`.
- **Summary output:** Change `f"{len(problems)} job(s) without a bounded timeout"` (line 103) to `f"{len(problems)} workflow timeout finding(s)"`.
- **Regression tests:** Add cases in `tools/test_check_workflow_timeouts.py` covering 3-space-indented jobs with nested 4-space `env:\n    uses: ...`, multiline `run: |` blocks containing `uses:` / `timeout-minutes:`, inconsistent child indentation, and duplicate job headers.

### 3.2 `.nuclear/changes/xerj-patterns-and-timeout-guard/` (Quick Packet)
- Keep this packet strictly as a **Quick** packet (`risk.md` + `proof.md`); **do not** create `basis.md` (which is a Standard-only marker checked by `ng_validate.py`).
- **Proposed workflow diff:** Regenerate `evidence/ci-timeouts.proposed.diff` against current `main`'s `.github/workflows/ci.yml` (`jdx/mise-action` v5.2.7), verify it applies cleanly to a scratch copy, and verify `check_workflow_timeouts.py` passes on that scratch copy. Keep `.github/workflows/ci.yml` unmodified.
- **Measured job-time provenance (`AGENTS.md` Rule 5):** Commit the raw check-runs JSON input (retrieved from GitHub Actions run `42297737091` or a fresh run on `#69`) plus a deterministic calculation script/command so `evidence/job-times.txt` is tool-generated rather than hand-typed, and record input/output SHA-256 digests in `proof.md`.
- **Policy ceiling & test logs:** Document `MAX_TIMEOUT_MINUTES = 60` in `proof.md` as an owner policy ceiling (not a derived number), update `proof.md` test counts after adding the new unit tests, and re-run/save `evidence/ngram-check.txt`.

---

## 4. `#82` Fixes (`feat/workspace-ui-redesign`)

### 4.1 `services/api/src/repos.ts` & TypeSpec Contract (`spec/api.tsp`)
- **Dot-segment & root rejection:** Add `isSafeRepoIdentifier(repo)` rejecting `.` and `..` in both `owner/name` and local repo folder names.
- **Symlink-safe resolution & dangling-symlink handling:** Implement `realpathOrNearest(targetPath)` using `lstatSync()` in addition to `existsSync()` so a dangling symlink (`existsSync === false`, `lstatSync.isSymbolicLink() === true`) is detected and resolved via `readlinkSync()` (or refused) rather than treated as a plain non-existent path. Use `realpathOrNearest` in `resolveSafeWorkspaceRoot()` and `isContainedIn()`.
- **Sensitive `$HOME` exclusions:** In `resolveSafeWorkspaceRoot()`, reject `$HOME` itself and sensitive dot-directories (`~/.ssh`, `~/.aws`, `~/.gnupg`, `~/.controlrod`, `~/.config`) in addition to anything outside `$HOME`.
- **Containment & target checks in `/repos/materialize`:** Verify `isContainedIn(workspaceRoot, baseCloneDir)` and `isContainedIn(workspaceRoot, targetDir)`, and use `lstatSync` (via a `pathExistsAny(p)` helper) so pre-existing dangling symlinks at `targetDir` are caught as `409 workspace-exists`.
- **Base clone identity verification (`ensureBaseClone`):** Before reusing an existing `baseCloneDir`:
  - Verify `join(baseCloneDir, ".git")` exists (preventing `git` from walking up to an ancestor repo) and pass `GIT_CEILING_DIRECTORIES`.
  - For GitHub `owner/name`, inspect `git remote get-url origin` and verify it matches `owner/name` case-insensitively across `https://github.com/owner/name(.git)(/)`, `https://<user>@github.com/owner/name(.git)(/)`, `git@github.com:owner/name(.git)`, and `ssh://git@github.com/owner/name(.git)` (stripping optional `.git` from the requested `repo` too). On mismatch, refuse with `409 workspace-exists`.
- **TypeSpec contract (`spec/api.tsp`):** Add `GET /repos` and `POST /repos/materialize` models and operations to `spec/api.tsp`, regenerate `spec/generated/` + `apps/web/src/api/types.ts`, and consume generated types in `apps/web/src/api/client.ts` (note: `spec/` changes require owner review per `.github/CODEOWNERS:6`).

### 4.2 Honest `NewWorkModal.tsx`, `runtimes.ts`, `workDefaults.ts`, and `newwork.test.tsx`
- **Runnable-only CLIs:** Add `runnable: boolean` to `CliEcosystem` in `apps/web/src/lib/runtimes.ts`, set `true` only for `claude` and `codex`, render the 8 unbacked CLIs as disabled options labeled `"Not yet runnable"`, and update `loadWorkDefaults()` in `workDefaults.ts` so stale `localStorage` entries for non-runnable CLIs fall back to runnable defaults.
- **Honest scope disclosure:** Add a concise inline note in `NewWorkModal.tsx` stating that workspace preparation creates the local git worktree now, while binding runtime/worktree selections directly into daemon runs lands in Cycle 2.
- **Custody wording:** Update `NewWorkModal.tsx` (`"O6 Custody OK:"` → `"Distinct ecosystems (baselines checked at run time):"`) and `isIndependentCustody` comments so distinct CLI ecosystem is not overstated as complete O6 custody.
- **Error surfacing & stale path invalidation:** Display `reposQuery.data?.github_error` inline when `gh` fails; invalidate `preparedPath` via `useEffect` whenever `effectiveBranch`, `activeWorkspaceRoot`, `repo`, `repoStrategy`, or `mode` changes (covering `objective` edits in Simple mode).
- **Remove dead clarification claim:** Delete unused `buildClarifyingQuestions` from `workDefaults.ts` and remove `"or 4-choice clarifications"` from `NewWorkModal.tsx` subtitle/JSDoc.
- **Tests:** Update `apps/web/src/components/newwork.test.tsx` to assert disabled non-runnable CLIs, updated O6 wording, `github_error` surfacing, and `preparedPath` invalidation when `objective` changes in Simple mode.

### 4.3 Board P2 Fixes
- **`apps/web/src/features/board/QuickAdd.tsx`:**
  - Validate every line in `many` against `CAPTURE_LIMIT` before mutating on both `Enter` (`onKeyDown`) and form `onSubmit`.
  - On partial batch failure during multi-line submit, track index `i` of the first failure, slice `remaining = titles.slice(i)`, update `many` and `text` together (reverting to `setMany(null); setText(remaining[0]!)` when `remaining.length === 1`), and invalidate `["captures"]` in `onError` whenever `i > 0`.
- **`apps/web/src/features/board/BoardReviewDrawer.tsx`:** Pass `key={packageId}` to `<DecisionBar view={view} />` so decision state resets when switching reviewed cards.
- **`apps/web/src/features/board/BoardView.tsx`:** Restrict J/K navigation query selector to `button.bd-title` so non-button `CaptureCard` headings are skipped.
- **`apps/web/src/features/board/useBoardData.ts`:** Change `loading` to `packages.isPending || capturesQ.isPending` so an empty board does not flash before captures resolve.
- **Tests:** Add unit tests covering `QuickAdd` paste length refusal + partial-failure retry/invalidation and `BoardReviewDrawer` package-switch state reset.

### 4.4 Change Records & Custody (`#82`)
- Fix `.nuclear/changes/board-m4/ship.md:5` (remove stale reference to merging `claude/clever-pasteur-cqsq13`).
- Add a valid `.nuclear/changes/workspace-ui-redesign/` change record covering `#82`'s workspace UI, `repos.ts`, and board fixes, verified with `ng.py validate --strict-custody`.

---

## 5. `#83` Fixes (`feat/wave1-hardened-worktrees`)

### 5.1 `services/api/src/repos.ts`
- **Hardened `gh()`:** Pass `hostGitEnv({ GIT_TERMINAL_PROMPT: "0" })` on all `gh` calls, and pass `"--", ...HOST_GIT_NETWORK_ARGS` (ported from `daemon/internal/runner/git_host.go`) to `gh repo clone` so `gh`'s child `git clone` enforces `-c core.hooksPath=/dev/null`, `-c core.fsmonitor=false`, `-c protocol.ext.allow=never`, and `-c submodule.recurse=false`.
- **Worktree removal containment & strict `force`:**
  - Move `!isContainedIn(resolvedRoot, resolvedRepo)` directly inside `isDangerousWorktreeRemovalPath()`, using `realpathOrNearest` for equality and containment checks.
  - In `removeWorktreeSafely()`, expand `~/` on both `worktreePath` and `repoPath`, reject symlinked `rawWorktreePath` via `lstatSync`, and pass canonical `resolvedWt` and `resolvedRepo` to `git(["status", ...])` and `git(["worktree", "remove", ...])`.
  - In `POST /repos/remove`, pass `body.force === true` strictly (never `Boolean(body.force)`).
- **`copyIgnoredArtifacts()` symlink, index, and secret hardening (Option A):**
  - Block sensitive secret/credential filenames and extensions in `preserve_patterns` (matching basename case-insensitively: `.env`, `.env.*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `id_rsa*`, `id_ed25519*`, `.npmrc`, `.netrc`, `.pypirc`, `credentials.json`) and update JSDoc + `repos.test.ts` to use a non-secret local config fixture (`local.config.json`).
  - Walk every path segment of `relPath` in **both** `repoDir` and `worktreeDir` using `lstatSync` to reject any symlinked intermediate directory or destination file/broken symlink before `mkdirSync` / `copyFileSync`.
  - Verify the destination path is not tracked in the materialized branch using non-throwing `git(["ls-files", "--", relPath], worktreeDir)` (skip if stdout is non-empty or if `git` errors; never fail open).
- **`createCheckpoint()` filter safety, index preservation, and unique refs:**
  - Copy the real worktree index resolved via `git(["rev-parse", "--git-path", "index"], repoDir)` into `tempIndex` when it exists (preserving force-staged ignored files via `git add -f`), falling back to `git read-tree HEAD` only when no index file exists.
  - Disable clean/smudge/process filters during `git add -A`: query `git config --name-only --get-regexp '^filter\..*\.(clean|smudge|process)$'` in `repoDir`, pass `-c <key>=` for every returned driver key, and set `GIT_ATTR_NOSYSTEM=1` + `-c core.attributesFile=/dev/null`.
  - Append `randomUUID().slice(0, 8)` to `refs/cr-checkpoints/${labelSlug}-${stamp}-${uid}` so concurrent checkpoints cannot collide.

### 5.2 TypeSpec Contracts, `NewWorkModal.tsx`, and Change Record (`#83`)
- Extend `spec/api.tsp` with `POST /repos/checkpoint` and `POST /repos/remove` (plus optional `mode` and `preserve_patterns` on `/repos/materialize`), regenerate `spec/generated/` + `apps/web/src/api/types.ts`, and consume generated types in `apps/web/src/api/client.ts`.
- Pass `mode` from `NewWorkModal.tsx` into `/repos/materialize` so `scaffoldCapitalProjectDirs()` executes in Capital Projects mode.
- Add tests in `services/api/test/repos.test.ts` covering: blocked `.env*`/key patterns + non-secret config copy, symlinked parent/leaf destination rejection, tracked destination file protection, uncontained `repo_path` and `force: "false"` on `/repos/remove`, force-staged file preservation + clean-filter neutralization + unique ref names in `createCheckpoint()`, and Capital Projects directory scaffolding.
- Add a valid `.nuclear/changes/wave1-hardened-worktrees/` change record passing `ng.py validate --strict-custody`.

---

## 6. Verification Gate (Per PR Before Merge)

Each PR (`#69`, `#82`, `#83`) must pass before merge:
1. Local package unit/integration suites (`tools` unittest for `#69`; `apps/web` typecheck + vitest + build, `services/api` `repos.test.ts` + `refusals.test.ts` + contract drift check, and `daemon` `go test ./...` for `#82` and `#83`).
2. All 7 GitHub Actions CI jobs green (including `change-records` with `ng.py validate --strict-custody`).
3. Independent adversarial diff verification by Argon before merging each PR.
4. All open Codex/Copilot review threads replied to and resolved (`docs/collaboration.md`).
