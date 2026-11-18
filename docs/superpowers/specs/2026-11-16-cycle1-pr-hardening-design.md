# Cycle 1 Design Spec: PR Hardening & Clean Landing (`#69`, `#82`, `#83`) and Re-Anchoring `#84–#86`

- **Date:** 2026-11-16 (Revised 2026-11-17 after independent Claude, Codex, and Grok adversarial reviews)
- **Owner:** Ben Huffer
- **Status:** Approved for planning
- **Scope:** Cycle 1 of the post-triage build plan (`#69` → `#82` → `#83` onto `main`, keeping `#84–#86` staged for Cycle 2)

---

## 1. Context & Goal

PRs `#69`, `#82`, `#83`, `#84`, `#85`, and `#86` are green in CI, but automated reviews (Codex and Copilot) plus four independent adversarial reviews (Argon, Claude Code, Codex CLI, and Grok CLI) identified open boundary, correctness, contract-sync, LFS/git-filter, and honest-UI issues in `#69`, `#82`, and `#83`. Meanwhile, `#84–#86` carry unplumbed multi-CLI, egress, outfall, and kernel changes that belong in Cycle 2 once `main` is solid.

**Cycle 1 goal:** Fix every open P1/P2, security, LFS/filter, and honesty issue in `#69`, `#82`, and `#83`, ensure each PR meets repository governance (`AGENTS.md`, `docs/collaboration.md`, `CONTRIBUTING.md`), squash-merge them in order to `main`, and restack `#84 → #85 → #86` onto updated `main`.

**Explicitly out of scope for Cycle 1 (deferred to Cycle 2):**
- Replacing `[author:...]`, `[checker:...]`, or `[workspace:...]` capture text headers with structured API fields or mounting worktrees into `daemon/internal/runner/workspace.go`.
- Wiring Wave 2 adapters (`grok`, `opencode`, `agy`, `ollama`), `Explore` fan-out, `Compare` notes, or `/outfall/*` GitHub PR creation (all 8 non-`claude`/`codex` CLIs stay disabled in Cycle 1 and are re-enabled individually in Cycle 2 once their daemon preflight/confinement is wired).
- Editing `.github/workflows/ci.yml` (remains unsigned until an owner explicitly signs the timeout diff).
- Retaining `preserve_patterns` / `copyIgnoredArtifacts()` (removed in Cycle 1 per YAGNI: zero first-party callers exist at tip `4ea68de`, eliminating secret-copy, hardlink, and TOCTOU attack surfaces).

---

## 2. Execution Order, Governance & Branch Topology

1. **Squash-merge per `docs/collaboration.md:12,82`:**
   - All three PRs (`#69`, `#82`, `#83`) are **squash-merged** to `main` with `Signed-off-by:` DCO trailers on new commits (`CONTRIBUTING.md:25`) and explicit AI-authorship disclosure in PR descriptions (`docs/collaboration.md:29`).
   - Owner approval for `/spec/` (`.github/CODEOWNERS:6`) is recorded in the `#82` and `#83` Standard change records and PR reviews.
2. **`#69` (`claude/funny-fermi-hls5sp` → `main`):**
   - Merge current `origin/main` (if needed), apply Section 3 fixes, run local `tools/` unittests + `ng.py validate --strict-custody` + CI, reply to and resolve all open review threads, and squash-merge `#69` to `main`.
3. **`#82` (`feat/workspace-ui-redesign` → `main`):**
   - Merge `main` (post-`#69`) into `feat/workspace-ui-redesign`, apply all Section 4 fixes (including regenerating `docs/commands/inventory.md` on `#82` and adding a Standard change record covering `repos.ts`, UI redesign, `CodexDisabledFeatures` in `daemon/internal/runner/sandbox.go:368`, and `styles.css`), verify local + CI + Playwright checks green, resolve all review threads, push to `origin/feat/workspace-ui-redesign`, and squash-merge `#82` to `main`.
4. **`#83` (`feat/wave1-hardened-worktrees` → `main`):**
   - Because `#82` squashes into a new commit on `main` (not `a1a04f0`) and `#83` already rewrote `services/api/src/repos.ts` (+316/−29), **restack `#83` cleanly onto `main`** after `#82` merges (carrying forward `#82`'s `repos.ts` hardening, `refusals.ts`, `NewWorkModal.tsx`, and `spec/` contract updates so none of `#82`'s fixes are overwritten).
   - Apply all Section 5 fixes + Standard change record, retarget `#83` → `main`, verify local + CI checks green, resolve all review threads, and squash-merge `#83` to `main`.
5. **Restack `#84 → #85 → #86` onto `main`:**
   - Once `#83` lands on `main`, restack `#84`, `#85`, and `#86` upward onto `main` and retarget `#84` → `main`.
   - Reconcile expected conflicts in `services/api/src/repos.ts` (keep `#83`'s hardened `repos.ts` + `#85`'s `/repos/freeze`), `services/api/test/repos.test.ts`, `apps/web/src/api/client.ts` (keep TypeSpec-generated types + `#86`'s `checkpointRepo`/`freezeRepo`), `apps/web/src/lib/runtimes.ts` & `NewWorkModal.tsx` (keep 8 disabled CLIs until Cycle 2), `services/api/src/refusals.ts`, `spec/api.tsp` + `spec/generated/*` + `services/api/src/preparation/schema.d.ts`, and regenerate `docs/commands/inventory.md` on `#86` (adding `outfall.*`).

---

## 3. `#69` Fixes (`claude/funny-fermi-hls5sp`)

### 3.1 `tools/check_workflow_timeouts.py` & `tools/test_check_workflow_timeouts.py`
- **Fail-closed YAML subset:** Keep rejecting quoted job names, YAML anchors, flow mappings, tabs, and multi-document streams (`---`).
- **Flag 3-space / misaligned job headers & duplicate jobs:**
  - Flag any key at `indent > 2` before a job is open (or a 3-space job header) as an unsupported job declaration instead of silently skipping it.
  - Flag duplicate job names under `jobs:` as a finding instead of merging via `jobs.setdefault(...)`.
  - Flag a job carrying **both** `runs-on` and `uses` as invalid rather than exempting it at `check_workflow_timeouts.py:72`.
- **Consistent per-job indentation & block/step skipping:**
  - Capture `job_indent` (`> 2`) from the first child key of each job. Flag any non-comment line inside a job with `2 < indent < job_indent` as inconsistent/unsupported indentation.
  - Stop scanning lines for job-level keys when inside `steps:` or inside multiline block scalars (`|`, `>`, `|-`, `|+`, `>-`, `>+`, `|2`, etc.) or multiline quoted scalars, resuming only when indentation returns to `<= job_indent` (and the scalar closes).
- **Summary output:** Change `f"{len(problems)} job(s) without a bounded timeout"` (line 103) to `f"{len(problems)} workflow timeout finding(s)"`.
- **Regression tests:** Add cases in `tools/test_check_workflow_timeouts.py` covering 3-space job headers, 3-space job keys with nested 4-space `env:\n    uses: ...`, `|-` / `|+` / `>+` / `|2` block scalars containing `uses:` or `timeout-minutes:`, multiline quoted scalars, inconsistent child indentation, duplicate job headers, `runs-on` + `uses` together, and multi-doc `---`.

### 3.2 `.nuclear/changes/xerj-patterns-and-timeout-guard/` (Quick Packet)
- Keep this packet strictly as a **Quick** packet (`risk.md` + `proof.md`); **do not** create `basis.md`. (Note: `ng.py --strict-custody` enforces full evidence custody only on Standard packets, so provenance here satisfies `AGENTS.md` Rule 5 and `docs/collaboration.md` review standards.)
- **Proposed workflow diff & guard output:** Regenerate `evidence/ci-timeouts.proposed.diff` against current `main`'s `.github/workflows/ci.yml` (`jdx/mise-action` v5.2.7), verify `git apply --check` on a scratch copy + `check_workflow_timeouts.py` exit 0, and regenerate `evidence/guard-on-current-ci.txt` with the updated summary line. Keep `.github/workflows/ci.yml` unmodified.
- **Measured job-time provenance (`AGENTS.md` Rule 5):** Commit the raw check-runs JSON input from GitHub Actions run `42297737091` plus a small deterministic script/command that produces `evidence/job-times.txt`, and record input/output SHA-256 digests in `proof.md`.
- **Policy ceiling & logs:** Document `MAX_TIMEOUT_MINUTES = 60` in `proof.md` as an owner policy ceiling, update `proof.md` test counts, and re-run/save `evidence/ngram-check.txt`. Note explicitly that `tools/` Python unit tests run locally (CI's `python` job only covers `sdk/python`).

---

## 4. `#82` Fixes (`feat/workspace-ui-redesign`)

### 4.1 `services/api/src/repos.ts`, `refusals.ts`, and TypeSpec Contract (`spec/api.tsp`)
- **Strict repo identifier (`isSafeRepoIdentifier`):** Reject `.` and `..`, leading `-` (`-u/x` acts as a CLI flag to `gh repo clone`), and leading `.` (`.git`, `.worktrees`) in local repo names and in both `owner` and `name` segments of `owner/name`. Strip an optional trailing `.git` before remote comparison.
- **Symlink-safe canonicalization (`realpathOrNearest` — refuse broken symlinks):**
  - Canonicalize `homedir()` itself with `realpathSync()`.
  - Walk path components from root/nearest existing parent using `lstatSync()`. **Refuse** any existing or broken/dangling symlink (`lstatSync().isSymbolicLink()`) with `400 invalid-workspace-root` or `400 invalid-repo` / `409 workspace-exists` rather than attempting relative `readlinkSync` resolution.
- **Safe workspace root (`resolveSafeWorkspaceRoot`):**
  - Reject `$HOME` itself (`rel === ""`) and **any** path whose first segment under `$HOME` starts with `.` (blocks `.ssh`, `.aws`, `.gnupg`, `.controlrod`, `.config`, `.kube`, `.docker`, `.claude`, `.codex`, `.local`, etc.; document that `CONTROLROD_WORKSPACE_ROOT` must live in a non-dot folder inside `$HOME`).
- **Shared host-Git hardening (`hostGitEnv` + `HOST_GIT_ARGS` + `.git` validation):**
  - Apply `HOST_GIT_ARGS` (`-c protocol.file.allow=user`, `-c core.hooksPath=/dev/null`, `-c core.fsmonitor=false`, `-c merge.verifySignatures=false`, `-c commit.gpgsign=false`, `-c tag.gpgsign=false`) and `hostGitEnv` (stripping unsafe `GIT_*` vars and setting `GIT_CEILING_DIRECTORIES` to `dirname(workspaceRoot)`) to **all** `git()` and `gh()` calls in `#82` (not deferring to `#83`).
  - Inject `HOST_GIT_ARGS` + `HOST_GIT_NETWORK_ARGS` (`-c protocol.allow=never`, `-c protocol.ext.allow=never`, `-c submodule.recurse=false`, plus keeping `https`/`ssh` allowed as needed for `gh`) via **`GIT_CONFIG_COUNT` / `GIT_CONFIG_KEY_n` / `GIT_CONFIG_VALUE_n`** in `gh()`'s environment—never via `-- -c ...` CLI flags, which permanently write config into `.git/config` and miss fork parent fetches.
  - Validate that any reused `baseCloneDir` (for `worktree`, `branch`, **and** local `fresh-clone`) has a real `.git` directory or valid gitfile pointing inside `workspaceRoot` so `git` can never walk up to an ancestor repo.
- **Strict remote identity verification (`ensureBaseClone`):**
  - Parse `git remote get-url origin` with a strict parser handling `https://[user@]github.com[:port]/owner/name[.git][/]` and SCP/SSH `git@github.com:owner/name[.git]` / `ssh://git@github.com[:port]/owner/name[.git]` (and `ssh.github.com`), comparing normalized lowercase `owner/name` exactly (never substring matching). Add a dedicated refusal code `repo-identity-mismatch` in `services/api/src/refusals.ts` (`"An existing folder at that path points to a different repository."`).
  - For `strategy: "branch"`, require `git status --porcelain` to be empty before checking out or creating a branch inside the base clone.
  - Fetch `origin` (`git fetch --prune origin`) rather than `git fetch --all`, and surface fetch errors instead of swallowing them silently.
- **Containment & target checks in `/repos/materialize`:** Verify `isContainedIn(workspaceRoot, baseCloneDir)` and `isContainedIn(workspaceRoot, targetDir)`, and detect pre-existing targets (including dangling symlinks) using `lstatSync`-based existence checks.
- **TypeSpec contract & drift sync (`spec/api.tsp`):**
  - Add `GET /repos` and `POST /repos/materialize` models and operations (plus Fastify route body/query validation) to `spec/api.tsp`.
  - Run **both** root `pnpm spec` (updating `spec/generated/*` and tracked `services/api/src/preparation/schema.d.ts`) and `pnpm --filter web gen:api` (updating gitignored `apps/web/src/api/schema.d.ts`).
  - Export typed aliases in `apps/web/src/api/types.ts` (`ReposResponse`, `LocalRepoInfo`, `GithubRepoInfo`, `MaterializeRepoRequest`, `MaterializeRepoResult`) and replace the handwritten interfaces in `apps/web/src/api/client.ts` with imports from `./types.js`.
- **Dedicated `#82` API tests (avoiding `#83` add/add conflict):** Create `services/api/test/repos-materialize.test.ts` (instead of `repos.test.ts`, which `#83` creates) testing dot-segments, leading `-`/`.`, dangling/parent symlinks, dot-dir `$HOME` rejection, ancestor `.git` non-walk-up, `fresh-clone` identity/containment, `repo-identity-mismatch`, dirty `branch` refusal, and `.git/config` non-persistence.

### 4.2 Honest `NewWorkModal.tsx`, `runtimes.ts`, `workDefaults.ts`, and `newwork.test.tsx`
- **Runnable-only CLIs & `localStorage` validation:** Add `runnable: boolean` to `CliEcosystem` in `apps/web/src/lib/runtimes.ts` (`true` only for `claude` and `codex`); render the 8 unbacked CLIs as disabled options labeled `"Not yet runnable"`. In `loadWorkDefaults()` (`workDefaults.ts`), validate both `ecosystem.runnable` **and** that stored `model` / `reasoning` exist in that ecosystem's current lists, falling back cleanly to runnable defaults.
- **Honest strategy & binding disclosure:** Add a concise inline note in `NewWorkModal.tsx` describing the selected strategy accurately (`worktree`, `fresh-clone`, or `branch` in base clone) and stating that binding runtime and workspace selections directly into daemon runs lands in Cycle 2.
- **Custody wording:** Update `NewWorkModal.tsx:516` (`"O6 Custody OK:"` → `"Distinct ecosystems (baselines checked at run time):"`) and `isIndependentCustody` comments in `runtimes.ts` (does not trigger `check_public_claims.py`).
- **Async race fix & branch pinning on Prepare:**
  - Snapshot the prepare request inputs (`repo`, `repoStrategy`, `activeWorkspaceRoot`, `resolvedBranch`) and track a request token/generation `ref`. Discard stale `materialize` responses if inputs changed or a newer request started while in-flight.
  - Do **not** invalidate `preparedPath` on every keystroke of `objective` in Simple mode (which would orphan worktrees/branches). Instead, pin `preparedBranch` when `Prepare local workspace` runs (or starts), and invalidate `preparedPath` + `preparedBranch` only when `repo`, `repoStrategy`, `workspaceRoot`, or explicit `branch` changes.
- **Error surfacing & dead clarification cleanup:** Surface `reposQuery.data?.github_error` inline when `gh` fails. Delete unused `buildClarifyingQuestions` from `workDefaults.ts` (also resolves `tools/check_public_claims.py` line 253 `"certified"`), and remove `"or 4-choice clarifications"` from `NewWorkModal.tsx` subtitle/JSDoc.
- **Tests:** Rewrite `apps/web/src/components/newwork.test.tsx` (`agy` / `opencode` scenarios and `/O6 Custody OK:/i` assertions) to test disabled non-runnable CLIs, updated custody wording, `github_error` display, stale `localStorage` fallback, branch pinning across `objective` edits, and delayed-response race discarding.

### 4.3 Board P2 Fixes & Inventory Sync
- **`apps/web/src/features/board/QuickAdd.tsx`:**
  - Validate `CAPTURE_LIMIT` across every line in `many` before mutating on both `Enter` (`onKeyDown`) and form `onSubmit`.
  - Track the current index in a `ref` inside `mutationFn` (or attach `sentCount` / `remaining` to a custom error) so `onError` knows how many lines succeeded: advance `many` past posted lines, update `text` alongside `many` (reverting to `setMany(null); setText(remaining[0]!)` if 1 line remains), and call `void qc.invalidateQueries({ queryKey: ["captures"] })` whenever `sentCount > 0` (or on network/ambiguous errors so the user sees any capture created before a dropped response).
- **`apps/web/src/features/board/BoardReviewDrawer.tsx`:** Pass `key={packageId}` to `<DecisionBar view={view} />` so decision state resets when switching reviewed cards.
- **`apps/web/src/features/board/BoardView.tsx`:** Restrict J/K navigation query selector to `button.bd-title` so non-button `CaptureCard` headings are skipped.
- **`apps/web/src/features/board/useBoardData.ts`:** Set `loading: packages.isPending || capturesQ.isPending` while preserving error alerts if `packages.isError` is already true.
- **Command inventory & status sync:** Regenerate `docs/commands/inventory.md` on `#82` (`tools/generate_command_inventory.py`), refresh `.nuclear/changes/program-gap-analysis/evidence/inventory-check.log`, and verify `docs/status.md` reflects `#82` accurately.
- **Tests:** Add tests covering `QuickAdd` paste length refusal, partial-failure retry + `captures` invalidation, and `BoardReviewDrawer` package-switch state reset.

### 4.4 Change Records & Custody (`#82`)
- Fix `.nuclear/changes/board-m4/ship.md:5` (remove stale branch reference `claude/clever-pasteur-cqsq13`).
- Create a **Standard** change record `.nuclear/changes/workspace-ui-redesign/` (`basis.md`, `plan.md`, `risk.md`, `trace.md`, `verification.md`, `ship.md`, `evidence/`) covering `repos.ts`, `NewWorkModal`/`runtimes`/`board` fixes, `CodexDisabledFeatures` (`daemon/internal/runner/sandbox.go:368`), `apps/web/src/styles.css`, `spec/api.tsp`, and `docs/commands/inventory.md`. Validate with `ng.py validate --strict-custody`.

---

## 5. `#83` Fixes (`feat/wave1-hardened-worktrees`, Restacked onto `main`)

### 5.1 `services/api/src/repos.ts`
- **Preserve all Section 4.1 hardenings:** Keep `#82`'s `isSafeRepoIdentifier`, `realpathOrNearest` (refusing broken symlinks), dot-dir `$HOME` exclusion, `hostGitEnv` with `GIT_CEILING_DIRECTORIES` and `GIT_CONFIG_*` non-persistent `gh()` hardening, `.git` validation across all strategies, strict `ensureBaseClone` identity check + `repo-identity-mismatch`, and `NewWorkModal.tsx` fixes.
- **Remove `preserve_patterns` & `copyIgnoredArtifacts()` (Option A / YAGNI):** Remove `copyIgnoredArtifacts()` and `preserve_patterns` from `materialize` routes/types/tests in Cycle 1. (Zero first-party callers exist at tip `4ea68de`, eliminating secret-copy, hardlink, and TOCTOU attack surfaces.)
- **Neutralize filters cleanly across host Git operations (LFS-safe):**
  - Query configured filter drivers (`git config --name-only --get-regexp '^filter\..*\.(clean|smudge|process)$'`) and pass `filter.<driver>.clean=`, `filter.<driver>.smudge=`, `filter.<driver>.process=`, and `filter.<driver>.required=false`—plus `core.autocrlf=false`, `core.safecrlf=false`, `core.eol=lf`—via **`GIT_CONFIG_COUNT` / `GIT_CONFIG_KEY_n` / `GIT_CONFIG_VALUE_n`** (handles subsection names with `=`, avoids `-c` persistent clone writes, and prevents exit-128 failures on LFS `filter.lfs.required=true` repos).
  - Apply filter neutralization across `createCheckpoint()`, `git status` (`scanLocalRepos` / `removeWorktreeSafely`), `git checkout`, and `git worktree add`. Document in `createCheckpoint()` JSDoc that checkpoints on Git LFS repos record raw working-tree/pointer bytes.
- **`createCheckpoint()` index, `.git`, and CAS ref safety:**
  - Verify `repoDir` has a valid `.git` entry (with `GIT_CEILING_DIRECTORIES` preventing ancestor walk-up).
  - Resolve the worktree's real index with `git(["rev-parse", "--path-format=absolute", "--git-path", "index"], repoDir)` and copy it to `tempIndex` when it exists (preserving force-staged files). On an unborn `HEAD` where no index exists yet, skip `read-tree HEAD` cleanly.
  - Use full `randomUUID()` in `refs/cr-checkpoints/${labelSlug}-${stamp}-${randomUUID()}` and pass compare-and-swap zero OID `""` to `git update-ref <ref> <commitSha> ""` so concurrent checkpoints never collide or overwrite.
- **`removeWorktreeSafely()` & `/repos/remove`:**
  - Put `!isContainedIn(resolvedRoot, resolvedRepo)` directly inside `isDangerousWorktreeRemovalPath()` (using `realpathOrNearest`), expand `~/` (refusing `~user/...` forms) on both `worktreePath` and `repoPath`, reject symlinked `worktreePath` via `lstatSync`, verify `repoPath` has `.git`, and pass canonical `resolvedWt` & `resolvedRepo` to `git`.
  - If `worktreePath` is already missing on disk (`!existsSync`), check `git worktree list --porcelain` in `resolvedRepo`: if still registered, run `git worktree prune` (or `git worktree remove` when `force === true`) cleanly instead of stranding a stale registration behind a 404.
  - Require strict `body.force === true` (never `Boolean(body.force)`).
  - Map git execution errors in `/repos/checkpoint` and `/repos/remove` to `400 git-failed` refusals (with `refusals.test.ts` coverage).

### 5.2 TypeSpec Contracts, `NewWorkModal.tsx`, Tests, and Change Record (`#83`)
- Extend `spec/api.tsp` with `POST /repos/checkpoint` and `POST /repos/remove` (plus `mode?: "software" | "capital-projects"` on `/repos/materialize`, without `preserve_patterns`). Run both `pnpm spec` and `pnpm --filter web gen:api`, update `apps/web/src/api/types.ts` + `client.ts`, and align Fastify validation schemas.
- Pass `mode` from `NewWorkModal.tsx` into `/repos/materialize` so `scaffoldCapitalProjectDirs()` executes in Capital Projects mode.
- Update `services/api/test/repos.test.ts` (pointing any temporary test workspace roots at a temp `HOME` rather than `~/.cr-repos-test-*`): remove `copyIgnoredArtifacts`/`.env.local`/`*.secret` tests alongside removing `copyIgnoredArtifacts()`, and add tests for LFS (`filter.lfs.required=true`) + custom filter neutralization, unborn `HEAD` + absent index + force-staged index preservation, CAS concurrent checkpoints, uncontained `repo_path` + `force: "false"` + missing-on-disk-but-registered worktree pruning on `/repos/remove`, and Capital Projects scaffolding via `mode`.
- Create a **Standard** change record `.nuclear/changes/wave1-hardened-worktrees/` validated by `ng.py validate --strict-custody`.

---

## 6. Verification Gate (Per PR Before Merge)

Each PR (`#69`, `#82`, `#83`) must pass before squash-merge:
1. **Local package & tooling checks:**
   - `#69`: `python3 -m unittest tools/test_check_workflow_timeouts.py`, `python3 tools/check_workflow_timeouts.py`, `tools/check_originality.py`, `ng.py validate --strict-custody`.
   - `#82` & `#83`: `pnpm spec` + `git diff --exit-code -- spec/generated services/api/src/preparation/schema.d.ts`, `pnpm --filter web exec tsc --noEmit`, `pnpm --filter web test -- --run`, `pnpm --filter web build`, `services/api` Vitest (`repos-materialize.test.ts` / `repos.test.ts` / `refusals.test.ts`), `cd daemon && go test ./...`, `python3 tools/generate_command_inventory.py --check`, `python3 tools/check_public_claims.py`, `python3 tools/check_originality.py`, `python3 tools/check_register.py` (no new regressions), local Chromium Playwright board/axe specs (covering `e2e/board-looks.spec.ts` and M4/QuickAdd focus), and `ng.py validate --strict-custody`.
2. **All 7 GitHub Actions CI jobs green** (`typescript`, `rust`, `go`, `python`, `licenses`, `change-records`, `sbom`).
3. **Independent adversarial diff review** before merging each PR.
4. **All open Codex/Copilot review threads** replied to and resolved (`docs/collaboration.md`).
