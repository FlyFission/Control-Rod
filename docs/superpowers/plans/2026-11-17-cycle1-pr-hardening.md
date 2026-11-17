# Cycle 1 PR Hardening & Clean Landing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every open P1/P2, security, LFS/filter, contract-sync, and honest-UI finding on `#69`, `#82`, and `#83`, squash-merge them sequentially to `main` with passing DCO/change-record/CI gates, and restack `#84–#86` onto `main` for Cycle 2.

**Architecture:** All work happens inside the dedicated review checkout (`/home/flyfission/pr-reviews/Control-Rod`). Each PR lands via squash merge per `docs/collaboration.md:12` with `Signed-off-by:` trailers on new commits (`git commit -s`). Host Git calls share `hostGitEnv()` (`GIT_CEILING_DIRECTORIES` + `GIT_CONFIG_COUNT`/`KEY`/`VALUE` non-persistent injection) so neither `gh repo clone` nor Git LFS / `.gitattributes` filters mutate repo configs or leak ancestor repositories. Unused `preserve_patterns` / `copyIgnoredArtifacts()` is removed in `#83` per YAGNI.

**Tech Stack:** TypeScript (Fastify API, Vitest, React 19, Vite, TypeSpec), Python 3 (stdlib workflow checker + `ng.py`), Go (daemon tests already passing on `#82`), Git 2.43 + `gh` CLI.

**Spec:** [`docs/superpowers/specs/2026-11-16-cycle1-pr-hardening-design.md`](../specs/2026-11-16-cycle1-pr-hardening-design.md)

---

## File Structure

### Part A — `#69` (`claude/funny-fermi-hls5sp`)
- Modify: `tools/check_workflow_timeouts.py` (indent tracking, block scalars, duplicate jobs, `runs-on`+`uses` check, summary string)
- Modify: `tools/test_check_workflow_timeouts.py` (regression tests for each parser edge case)
- Create: `.nuclear/changes/xerj-patterns-and-timeout-guard/evidence/job-times.raw.json`, `tools/measure_ci_times.py` (or inline script documented in `proof.md`), regenerated `evidence/job-times.txt`, `evidence/ci-timeouts.proposed.diff`, `evidence/guard-on-current-ci.txt`, `evidence/ngram-check.txt`
- Modify: `.nuclear/changes/xerj-patterns-and-timeout-guard/proof.md` (Quick packet digests, `MAX_TIMEOUT_MINUTES = 60` policy note, updated test counts)

### Part B — `#82` (`feat/workspace-ui-redesign`)
- Modify: `spec/api.tsp` (add `Repos` namespace: `GET /repos`, `POST /repos/materialize`)
- Regenerate: `spec/generated/*`, `services/api/src/preparation/schema.d.ts`, `apps/web/src/api/schema.d.ts` (gitignored)
- Modify: `apps/web/src/api/types.ts`, `apps/web/src/api/client.ts` (export and consume generated repo types)
- Modify: `services/api/src/refusals.ts` (add `repo-identity-mismatch`)
- Modify: `services/api/src/repos.ts` (strict `isSafeRepoIdentifier`, `realpathOrNearest` refusing symlinks, dot-dir `$HOME` rejection, `hostGitEnv` + `GIT_CEILING_DIRECTORIES` + `GIT_CONFIG_*` `gh()`, `.git` checks on all strategies including `fresh-clone`, strict origin parser, dirty check on `branch`, `origin`-only fetch, `isContainedIn` + `lstatSync` target checks)
- Create: `services/api/test/repos-materialize.test.ts` (separate file from `#83`'s `repos.test.ts` to avoid add/add conflicts)
- Modify: `apps/web/src/lib/runtimes.ts` (`runnable: boolean`, custody JSDoc)
- Modify: `apps/web/src/lib/workDefaults.ts` (validate runnable + model + reasoning in `loadWorkDefaults`, remove unused `buildClarifyingQuestions`)
- Modify: `apps/web/src/components/NewWorkModal.tsx` (disable non-runnable CLIs, honest strategy/Cycle-2 notice, custody sentence, `github_error` alert, async snapshot/nonce race fix, `preparedBranch` pinning, remove clarification subtitle claim)
- Modify: `apps/web/src/components/newwork.test.tsx` (update `agy`/`opencode`/O6 tests, add `github_error`, stale `localStorage`, branch pinning, and delayed-response race tests)
- Modify: `apps/web/src/features/board/QuickAdd.tsx`, `BoardReviewDrawer.tsx`, `BoardView.tsx`, `useBoardData.ts`, `apps/web/src/features/board/quick-add.test.tsx` (paste `CAPTURE_LIMIT`, ref-tracked partial retry + `captures` invalidation, `key={packageId}`, `button.bd-title`, `capturesQ.isPending`)
- Regenerate: `docs/commands/inventory.md`, `.nuclear/changes/program-gap-analysis/evidence/inventory-check.log`
- Modify: `.nuclear/changes/board-m4/ship.md` (remove stale branch name)
- Create: `.nuclear/changes/workspace-ui-redesign/{basis.md,plan.md,risk.md,trace.md,verification.md,ship.md,evidence/}` (Standard change record)

### Part C — `#83` (`feat/wave1-hardened-worktrees`, restacked onto `main`) & `#84–#86` Restack
- Modify: `spec/api.tsp` (add `POST /repos/checkpoint`, `POST /repos/remove`, `mode` on `/repos/materialize`; omit `preserve_patterns`)
- Regenerate: `spec/generated/*`, `services/api/src/preparation/schema.d.ts`, `apps/web/src/api/schema.d.ts`
- Modify: `apps/web/src/api/types.ts`, `apps/web/src/api/client.ts`, `apps/web/src/components/NewWorkModal.tsx` (pass `mode` to `materializeRepo`)
- Modify: `services/api/src/repos.ts` (remove `copyIgnoredArtifacts`/`preserve_patterns`; dynamic `GIT_CONFIG_*` filter + `required=false` + `autocrlf`/`safecrlf`/`eol` neutralization across checkpoint/status/checkout/worktree add; `--path-format=absolute --git-path index` + unborn `HEAD` skip; full `randomUUID()` + CAS `update-ref`; `repoPath` containment in `isDangerousWorktreeRemovalPath`; missing-dir registered worktree prune/remove; `force === true`; `git-failed` mapping)
- Modify: `services/api/test/repos.test.ts` (temp `HOME`, remove `copyIgnoredArtifacts` fixtures, add LFS, unborn `HEAD`, force-staged index, CAS concurrency, missing-dir prune, `mode` scaffolding tests)
- Create: `.nuclear/changes/wave1-hardened-worktrees/{basis.md,plan.md,risk.md,trace.md,verification.md,ship.md,evidence/}` (Standard change record)
- Restack: `feat/wave2-multi-cli-assurance` (`#84`), `feat/wave3-workbench-outfall` (`#85`), `feat/wave4-full-integration` (`#86`) onto `main` + refresh `docs/commands/inventory.md` on `#86`

---

## Part A: `#69` (`claude/funny-fermi-hls5sp`)

### Task 1: Fix `check_workflow_timeouts.py` YAML Subset & Edge-Case Tests

**Files:**
- Modify: `tools/check_workflow_timeouts.py:1-110`
- Modify: `tools/test_check_workflow_timeouts.py:1-72`

- [ ] **Step 1: Checkout `#69` branch synced with `origin/main` and write failing parser tests**

```bash
cd /home/flyfission/pr-reviews/Control-Rod
git fetch -q origin
git checkout -q -B claude/funny-fermi-hls5sp origin/claude/funny-fermi-hls5sp
git merge -s --no-edit origin/main
```

Append failing tests to `tools/test_check_workflow_timeouts.py`:

```python
    def test_three_space_job_keys_cannot_spoof_uses_from_nested_env(self):
        text = (
            "jobs:\n"
            "  build:\n"
            "   runs-on: ubuntu-latest\n"
            "   env:\n"
            "    uses: ./.github/workflows/other.yml\n"
        )
        findings = timeout_findings(text)
        self.assertTrue(any("no timeout-minutes" in f for f in findings))

    def test_rejects_inconsistent_job_child_indentation(self):
        text = (
            "jobs:\n"
            "  build:\n"
            "      runs-on: ubuntu-latest\n"
            "    timeout-minutes: 10\n"
        )
        findings = timeout_findings(text)
        self.assertTrue(any("inconsistent" in f for f in findings))

    def test_rejects_three_space_job_header(self):
        text = "jobs:\n  a:\n    runs-on: x\n    timeout-minutes: 5\n   evil:\n     runs-on: x\n"
        findings = timeout_findings(text)
        self.assertTrue(any("unsupported job" in f for f in findings))

    def test_skips_steps_and_block_scalars_with_fake_keys(self):
        text = (
            "jobs:\n"
            "  build:\n"
            "    runs-on: ubuntu-latest\n"
            "    env:\n"
            "      SCRIPT: |-\n"
            "    uses: fake/reusable\n"
            "    steps:\n"
            "      - run: echo ok\n"
        )
        findings = timeout_findings(text)
        self.assertTrue(any("no timeout-minutes" in f for f in findings))

    def test_rejects_duplicate_job_names(self):
        text = (
            "jobs:\n"
            "  build:\n"
            "    runs-on: x\n"
            "    timeout-minutes: 5\n"
            "  build:\n"
            "    runs-on: x\n"
        )
        findings = timeout_findings(text)
        self.assertTrue(any("duplicate job" in f for f in findings))

    def test_rejects_job_with_both_runs_on_and_uses(self):
        text = "jobs:\n  build:\n    runs-on: x\n    uses: ./.github/workflows/other.yml\n"
        findings = timeout_findings(text)
        self.assertTrue(any("both runs-on and uses" in f for f in findings))

    def test_rejects_tabs_and_multi_document_yaml(self):
        for text in ["jobs:\n\tbuild:\n    runs-on: x\n", "---\njobs:\n  a:\n    runs-on: x\n    timeout-minutes: 5\n---\njobs:\n"]:
            with self.subTest(text=text):
                self.assertTrue(len(timeout_findings(text)) >= 1)
```

- [ ] **Step 2: Run unit tests to verify the new tests fail**

Run: `cd /home/flyfission/pr-reviews/Control-Rod/tools && python3 -m unittest test_check_workflow_timeouts`
Expected: FAIL (`AssertionError` on 3-space `uses:`, duplicate job, `runs-on` + `uses`, tabs/multi-doc).

- [ ] **Step 3: Implement strict indent-aware parser and updated summary in `tools/check_workflow_timeouts.py`**

Replace `timeout_findings` and line 103 in `tools/check_workflow_timeouts.py`:

```python
BLOCK_SCALAR = re.compile(r"^[|>][+-]?[0-9]*[+-]?(\s+#.*)?$")
JOB_KV = re.compile(r"^( +)([A-Za-z0-9_-]+):\s*(.*?)\s*(#.*)?$")
DOC_MARKER = re.compile(r"^(---|\.\.\.)(\s.*)?$")


def _indent_of(line: str) -> int:
    return len(line) - len(line.lstrip(" "))


def timeout_findings(text: str) -> list[str]:
    """Return one message per problem in one workflow file's text; empty means clean."""
    lines = text.splitlines()
    for i, line in enumerate(lines, start=1):
        if "\t" in line[: len(line) - len(line.lstrip(" \t"))]:
            return [f"line {i}: tab indentation is not supported"]
    if sum(1 for line in lines if DOC_MARKER.match(line)) > 1:
        return ["multiple YAML documents are not supported"]

    try:
        start = next(i for i, line in enumerate(lines) if JOBS_HEADER.match(line))
    except StopIteration:
        return ["no `jobs:` block found"]

    findings: list[str] = []
    if sum(1 for line in lines if JOBS_HEADER.match(line)) > 1:
        findings.append("more than one `jobs:` block; only the first would be read")

    jobs: dict[str, dict[str, str]] = {}
    current_name: str | None = None
    job_indent: int | None = None
    skip_until_indent: int | None = None
    in_quoted_until_indent: int | None = None

    for line in lines[start + 1 :]:
        stripped = line.strip()
        indent = _indent_of(line)

        if in_quoted_until_indent is not None:
            if stripped.endswith(('"', "'")) and not stripped.endswith(('\\"', "\\'")):
                in_quoted_until_indent = None
            continue

        if skip_until_indent is not None:
            if not stripped:
                continue
            if indent > skip_until_indent:
                continue
            skip_until_indent = None

        if not stripped or stripped.startswith("#"):
            continue
        if indent == 0 and TOP_LEVEL_KEY.match(line):
            break

        if indent == 2:
            header = JOB_HEADER.match(line)
            if not header:
                findings.append(f"unsupported job declaration: {stripped!r}")
                current_name = None
                job_indent = None
                continue
            name = header.group(1)
            if name in jobs:
                findings.append(f"{name}: duplicate job declaration")
                current_name = None
                job_indent = None
                continue
            jobs[name] = {}
            current_name = name
            job_indent = None
            continue

        if current_name is None:
            findings.append(f"unsupported job declaration: {stripped!r}")
            continue

        if job_indent is None:
            kv = JOB_KV.match(line)
            if not kv:
                findings.append(f"{current_name}: unsupported job property: {stripped!r}")
                continue
            job_indent = len(kv.group(1))
        elif indent < job_indent:
            findings.append(f"{current_name}: inconsistent job indentation ({indent} < {job_indent}): {stripped!r}")
            continue
        elif indent > job_indent:
            continue

        kv = JOB_KV.match(line)
        if not kv or len(kv.group(1)) != job_indent:
            findings.append(f"{current_name}: unsupported job property: {stripped!r}")
            continue

        key, val = kv.group(2), kv.group(3)
        if key == "steps" and (val == "" or val.startswith("#")):
            skip_until_indent = job_indent
            continue
        if BLOCK_SCALAR.match(val):
            skip_until_indent = job_indent
            continue
        if (val.startswith('"') and not val.endswith('"')) or (val.startswith("'") and not val.endswith("'")):
            in_quoted_until_indent = job_indent
            continue
        jobs[current_name][key] = val

    if not jobs and not findings:
        return ["`jobs:` block has no jobs this check recognises"]

    for name, keys in jobs.items():
        if "runs-on" in keys and "uses" in keys:
            findings.append(f"{name}: defines both runs-on and uses")
            continue
        if "uses" in keys:
            continue
        if "runs-on" not in keys:
            findings.append(f"{name}: has neither runs-on nor uses; the parser may have lost the job")
            continue
        value = keys.get("timeout-minutes")
        if value is None:
            findings.append(f"{name}: no timeout-minutes (GitHub's default is 360)")
        elif not re.fullmatch(r"[0-9]+", value):
            findings.append(f"{name}: timeout-minutes must be a plain integer, found '{value}'")
        elif not 1 <= int(value) <= MAX_TIMEOUT_MINUTES:
            findings.append(f"{name}: timeout-minutes {value} is outside 1..{MAX_TIMEOUT_MINUTES}")
    return findings
```

And at line 103 in `main()`:

```python
    if problems:
        print(f"{len(problems)} workflow timeout finding(s)")
        return 1
```

- [ ] **Step 4: Run unit tests to verify they pass**

Run: `cd /home/flyfission/pr-reviews/Control-Rod/tools && python3 -m unittest -v test_check_workflow_timeouts`
Expected: `Ran 14 tests ... OK`.

- [ ] **Step 5: Commit Task 1**

```bash
cd /home/flyfission/pr-reviews/Control-Rod
git add tools/check_workflow_timeouts.py tools/test_check_workflow_timeouts.py
git commit -s -m "fix(tools): harden workflow timeout parser indentation and duplicate checks"
```

---

### Task 2: Refresh `#69` Evidence, Validate Quick Custody, Merge `#69`

**Files:**
- Create: `.nuclear/changes/xerj-patterns-and-timeout-guard/evidence/job-times.raw.json`
- Modify: `.nuclear/changes/xerj-patterns-and-timeout-guard/evidence/job-times.txt`
- Modify: `.nuclear/changes/xerj-patterns-and-timeout-guard/evidence/ci-timeouts.proposed.diff`
- Modify: `.nuclear/changes/xerj-patterns-and-timeout-guard/evidence/guard-on-current-ci.txt`
- Modify: `.nuclear/changes/xerj-patterns-and-timeout-guard/evidence/ngram-check.txt`
- Modify: `.nuclear/changes/xerj-patterns-and-timeout-guard/proof.md`

- [ ] **Step 1: Fetch raw GitHub Actions check-run JSON for run `42297737091` and generate `job-times.txt` deterministically**

```bash
cd /home/flyfission/pr-reviews/Control-Rod
EVID=".nuclear/changes/xerj-patterns-and-timeout-guard/evidence"
gh api repos/FlyFission/Control-Rod/actions/runs/42297737091/jobs --jq '{run_id: 42297737091, jobs: [.jobs[] | {name, started_at, completed_at}]}' > "$EVID/job-times.raw.json"
python3 - <<'EOF' > "$EVID/job-times.txt"
import json, datetime
data = json.load(open(".nuclear/changes/xerj-patterns-and-timeout-guard/evidence/job-times.raw.json"))
caps = {"typescript": 20, "rust": 30, "go": 15, "licenses": 15, "change-records": 10, "python": 15, "sbom": 10}
print("Control Rod CI, per-job wall time computed from evidence/job-times.raw.json (run 42297737091).")
print(f"{'job':<15} {'seconds':<9} {'proposed cap':<14} cap / measured")
rows = []
for j in data["jobs"]:
    t0 = datetime.datetime.fromisoformat(j["started_at"].replace("Z", "+00:00"))
    t1 = datetime.datetime.fromisoformat(j["completed_at"].replace("Z", "+00:00"))
    sec = round((t1 - t0).total_seconds())
    rows.append((sec, j["name"]))
for sec, name in sorted(rows, reverse=True):
    cap = caps[name]
    print(f"{name:<15} {sec:<9} {f'{cap} min':<14} {cap*60/sec:.1f}x")
EOF
```

- [ ] **Step 2: Regenerate `ci-timeouts.proposed.diff` against current `main` `ci.yml` and test on a scratch copy**

```bash
cd /home/flyfission/pr-reviews/Control-Rod
EVID=".nuclear/changes/xerj-patterns-and-timeout-guard/evidence"
python3 - <<'EOF' > /tmp/ci.proposed.yml
text = open(".github/workflows/ci.yml").read()
caps = {"typescript": 20, "rust": 30, "go": 15, "python": 15, "licenses": 15, "change-records": 10, "sbom": 10}
out = []
cur = None
for line in text.splitlines(keepends=True):
    out.append(line)
    for name, cap in caps.items():
        if line == f"  {name}:\n":
            cur = name
    if cur and line == "    runs-on: ubuntu-latest\n":
        out.append(f"    timeout-minutes: {caps[cur]}\n")
        cur = None
open("/tmp/ci.proposed.yml", "w").write("".join(out))
EOF
git diff --no-index --label a/.github/workflows/ci.yml --label b/.github/workflows/ci.yml .github/workflows/ci.yml /tmp/ci.proposed.yml > "$EVID/ci-timeouts.proposed.diff" || true
git apply --check "$EVID/ci-timeouts.proposed.diff"
python3 -c 'import sys; sys.path.insert(0, "tools"); import check_workflow_timeouts as c; assert c.timeout_findings(open("/tmp/ci.proposed.yml").read()) == []'
rm -f /tmp/ci.proposed.yml
python3 tools/check_workflow_timeouts.py > "$EVID/guard-on-current-ci.txt" || true
```

- [ ] **Step 3: Re-run originality/n-gram check and update `proof.md` with SHA-256 digests, test count, and policy note**

Run `sha256sum` on `evidence/job-times.raw.json` and `evidence/job-times.txt`, re-run `python3 tools/check_originality.py` + the n-gram comparison documented in `proof.md` into `evidence/ngram-check.txt`, and update `.nuclear/changes/xerj-patterns-and-timeout-guard/proof.md` (keeping Quick packet format — **no `basis.md`**):
- Update test count (`7` → `14` tests in `tools/test_check_workflow_timeouts.py`, noting local execution since CI's `python` job covers `sdk/python` only).
- Record `job-times.raw.json` + `job-times.txt` SHA-256 digests and exact generation command (`AGENTS.md` Rule 5).
- State explicitly that `MAX_TIMEOUT_MINUTES = 60` is an owner policy ceiling, not a measured derivation.

- [ ] **Step 4: Run local validation & push `#69`, resolve review threads, wait for CI, and squash-merge**

Run:
```bash
cd /home/flyfission/pr-reviews/Control-Rod
python3 -m unittest -v tools/test_check_workflow_timeouts.py
python3 tools/check_originality.py
python3 -I /home/flyfission/nuclear-grade-context-engineering/tools/ng.py validate --strict-custody .nuclear/changes/xerj-patterns-and-timeout-guard/
git add tools/ .nuclear/changes/xerj-patterns-and-timeout-guard/
git commit -s -m "fix(tools): refresh #69 timeout evidence and parser tests"
git push -u origin claude/funny-fermi-hls5sp
```
Wait for all 7 CI checks on `#69` to pass, perform independent adversarial check on the `#69` diff, reply to + resolve all open Copilot/Codex threads on `#69`, then:
```bash
gh pr merge 69 -R FlyFission/Control-Rod --squash --delete-branch
```
Expected: `#69` status `MERGED`.

---

## Part B: `#82` (`feat/workspace-ui-redesign`)

### Task 3: Sync `#82` with `main`, Update `spec/api.tsp`, Regenerate Contracts

**Files:**
- Modify: `spec/api.tsp`
- Regenerate: `spec/generated/*`, `services/api/src/preparation/schema.d.ts`, `apps/web/src/api/schema.d.ts` (gitignored)
- Modify: `apps/web/src/api/types.ts`, `apps/web/src/api/client.ts:195-248`

- [ ] **Step 1: Merge updated `origin/main` into `feat/workspace-ui-redesign`**

```bash
cd /home/flyfission/pr-reviews/Control-Rod
git fetch -q origin
git checkout -q feat/workspace-ui-redesign
git merge -s --no-edit origin/main
```

- [ ] **Step 2: Add `Repos` namespace (`GET /repos`, `POST /repos/materialize`) to `spec/api.tsp`**

Append to `spec/api.tsp`:

```typespec
@route("/repos")
namespace Repos {
  model LocalRepoInfo {
    name: string;
    path: string;
    branch: string;
    remote_url: string | null;
    dirty: boolean;
  }

  model GithubRepoInfo {
    name_with_owner: string;
    default_branch: string;
    is_private: boolean;
    url: string;
    updated_at: string;
  }

  model ReposResponse {
    workspace_root: string;
    local: LocalRepoInfo[];
    github: GithubRepoInfo[];
    github_error: string | null;
  }

  enum MaterializeStrategy {
    worktree: "worktree",
    freshClone: "fresh-clone",
    branch: "branch",
  }

  model MaterializeRepoRequest {
    repo: string;
    branch: string;
    base_branch?: string;
    strategy?: MaterializeStrategy;
    workspace_root?: string;
  }

  model MaterializeRepoResult {
    ok: boolean;
    strategy: MaterializeStrategy;
    repo: string;
    branch: string;
    local_path: string;
  }

  @get op list(@query workspace_root?: string): ReposResponse | Refused;
  @route("/materialize") @post op materialize(@body body: MaterializeRepoRequest): MaterializeRepoResult | Refused;
}
```

- [ ] **Step 3: Run both contract generators (`pnpm spec` and `pnpm --filter web gen:api`) and wire `types.ts` + `client.ts`**

Run:
```bash
cd /home/flyfission/pr-reviews/Control-Rod
pnpm spec
pnpm --filter web gen:api
```
Update `apps/web/src/api/types.ts`:
```ts
export type LocalRepoInfo = S["Repos.LocalRepoInfo"];
export type GithubRepoInfo = S["Repos.GithubRepoInfo"];
export type ReposResponse = S["Repos.ReposResponse"];
export type MaterializeStrategy = S["Repos.MaterializeStrategy"];
export type MaterializeRepoRequest = S["Repos.MaterializeRepoRequest"];
export type MaterializeRepoResult = S["Repos.MaterializeRepoResult"];
```
In `apps/web/src/api/client.ts`: import `ReposResponse`, `MaterializeRepoRequest`, `MaterializeRepoResult`, `MaterializeStrategy`, `LocalRepoInfo`, `GithubRepoInfo` from `./types.js` and delete the duplicate handwritten interfaces at lines 211–244.

- [ ] **Step 4: Verify no contract drift and typecheck**

Run:
```bash
cd /home/flyfission/pr-reviews/Control-Rod
pnpm --filter web exec tsc --noEmit
git diff --stat spec/generated services/api/src/preparation/schema.d.ts
```
Expected: `tsc` exits 0; generated contract files reflect `/repos` and `/repos/materialize`.

- [ ] **Step 5: Commit Task 3**

```bash
cd /home/flyfission/pr-reviews/Control-Rod
git add spec/ services/api/src/preparation/schema.d.ts apps/web/src/api/types.ts apps/web/src/api/client.ts
git commit -s -m "feat(spec): add /repos and /repos/materialize contracts and use generated web types"
```

---

### Task 4: Harden `services/api/src/repos.ts` & `refusals.ts` on `#82` with TDD

**Files:**
- Modify: `services/api/src/refusals.ts`
- Modify: `services/api/src/repos.ts:1-246`
- Create: `services/api/test/repos-materialize.test.ts` (kept separate from `#83`'s `repos.test.ts` to prevent add/add conflict)

- [ ] **Step 1: Write failing API tests in `services/api/test/repos-materialize.test.ts`**

Create `services/api/test/repos-materialize.test.ts`:

```ts
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  isContainedIn,
  isSafeRepoIdentifier,
  parseGithubOwnerRepoFromUrl,
  realpathOrNearest,
  resolveSafeWorkspaceRoot,
} from "../src/repos.js";

const dirs: string[] = [];
function tempDir(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(d);
  return d;
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("repos.ts #82 boundaries", () => {
  it("rejects dot segments, leading dashes, and leading dots in repo identifiers", () => {
    for (const bad of [".", "..", "owner/..", "../repo", "owner/.", "./repo", "-u/repo", "owner/-p", ".git", ".worktrees", "-flag"]) {
      expect(isSafeRepoIdentifier(bad), bad).toBe(false);
    }
    for (const ok of ["FlyFission/Control-Rod", "FlyFission/Control-Rod.git", "my-repo"]) {
      expect(isSafeRepoIdentifier(ok), ok).toBe(true);
    }
  });

  it("refuses broken/dangling symlinks and symlinked parents in realpathOrNearest", () => {
    const base = tempDir("cr-sym-");
    const real = join(base, "real");
    mkdirSync(real);
    const outside = tempDir("cr-out-");
    const link = join(real, "escape");
    symlinkSync(join(outside, "nonexistent"), link);
    expect(() => realpathOrNearest(link)).toThrow(/symlink/i);
    expect(() => realpathOrNearest(join(link, "child"))).toThrow(/symlink/i);
  });

  it("rejects $HOME itself and any dot-prefixed top folder under $HOME", () => {
    const home = realpathOrNearest(process.env.HOME!);
    expect(() => resolveSafeWorkspaceRoot(home)).toThrow(/home/i);
    expect(() => resolveSafeWorkspaceRoot("~/.ssh")).toThrow(/sensitive|dot/i);
    expect(() => resolveSafeWorkspaceRoot("~/.config/gh")).toThrow(/sensitive|dot/i);
    expect(() => resolveSafeWorkspaceRoot("~/.claude")).toThrow(/sensitive|dot/i);
  });

  it("parses GitHub origin URLs strictly without substring spoofing", () => {
    expect(parseGithubOwnerRepoFromUrl("https://github.com/FlyFission/Control-Rod.git")).toBe("flyfission/control-rod");
    expect(parseGithubOwnerRepoFromUrl("git@github.com:FlyFission/Control-Rod.git")).toBe("flyfission/control-rod");
    expect(parseGithubOwnerRepoFromUrl("ssh://git@ssh.github.com:443/FlyFission/Control-Rod")).toBe("flyfission/control-rod");
    expect(parseGithubOwnerRepoFromUrl("https://evil.example/github.com/FlyFission/Control-Rod.git")).toBeNull();
    expect(parseGithubOwnerRepoFromUrl("https://github.com/FlyFission/Control-Rod.evil")).toBe("flyfission/control-rod.evil");
  });

  it("isContainedIn refuses equal paths and symlink escapes", () => {
    const base = tempDir("cr-cont-");
    const root = join(base, "root");
    const outside = tempDir("cr-out2-");
    mkdirSync(root);
    symlinkSync(outside, join(root, "link"));
    expect(isContainedIn(root, root)).toBe(false);
    expect(() => isContainedIn(root, join(root, "link", "sub"))).toThrow();
  });
});
```

*(Also add Fastify route tests using `startHarness` or `repoRoutes` over temp `HOME` verifying: (1) `repo-identity-mismatch` when `baseCloneDir` has a different `origin` URL; (2) `fresh-clone` fails if `baseCloneDir` has no `.git` or is outside containment; (3) `branch` strategy refuses a dirty `baseCloneDir`; (4) ancestor `.git` at `$HOME` is never walked up; (5) `gh()` injects `GIT_CONFIG_COUNT` in env without persisting into `.git/config`.)*

- [ ] **Step 2: Run the new test file to confirm it fails**

Run: `cd /home/flyfission/pr-reviews/Control-Rod/services/api && npx vitest run test/repos-materialize.test.ts`
Expected: FAIL (missing exported helpers `isSafeRepoIdentifier`, `realpathOrNearest`, `parseGithubOwnerRepoFromUrl`, `isContainedIn`).

- [ ] **Step 3: Register `repo-identity-mismatch` in `services/api/src/refusals.ts` and implement `repos.ts` hardening**

Add to `services/api/src/refusals.ts` under `// Workspace repositories & governed outfall.`:
```ts
  "repo-identity-mismatch": r("An existing folder at that path points to a different repository.", "Use a clean folder or choose a different workspace root."),
```

Implement in `services/api/src/repos.ts`:
- `HOST_GIT_ARGS` and `hostGitEnv(extraEnv, ceilingDir)` setting `GIT_CEILING_DIRECTORIES` (defaulting to `dirname(defaultWorkspaceRoot())`, overridden with `dirname(workspaceRoot)`) and stripping unsafe `GIT_*` env vars.
- `gitConfigEnv(pairs: Array<[string, string]>)`: builds `GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_i`, `GIT_CONFIG_VALUE_i` entries (for non-persistent `gh()` config injection).
- `isSafeRepoIdentifier(repo)`:
  ```ts
  export function isSafeRepoIdentifier(repo: string): boolean {
    const clean = repo.trim();
    if (!clean || clean.startsWith("-") || clean.startsWith(".")) return false;
    if (SAFE_OWNER_REPO.test(clean)) {
      const [owner, name] = clean.split("/");
      if (!owner || !name) return false;
      if (owner.startsWith("-") || owner.startsWith(".") || name.startsWith("-") || name.startsWith(".")) return false;
      return true;
    }
    return SAFE_LOCAL_NAME.test(clean);
  }
  ```
- `realpathOrNearest(targetPath)` & `pathExistsAny(p)`:
  ```ts
  function pathExistsAny(p: string): boolean {
    try {
      lstatSync(p);
      return true;
    } catch {
      return false;
    }
  }

  export function realpathOrNearest(targetPath: string): string {
    const abs = resolve(targetPath);
    const parts = abs.split("/").filter(Boolean);
    let cur = abs.startsWith("/") ? "/" : "";
    for (const seg of parts) {
      cur = join(cur, seg);
      if (!pathExistsAny(cur)) continue;
      const st = lstatSync(cur);
      if (st.isSymbolicLink()) {
        throw new Refusal(400, "invalid-workspace-root", `Symbolic links are not permitted in workspace paths: ${cur}`);
      }
    }
    return existsSync(abs) ? realpathSync(abs) : abs;
  }
  ```
  *(Note: apply `realpathSync(homedir())` for `home`, and check `rel === ""` or `rel.split("/")[0]?.startsWith(".")` in `resolveSafeWorkspaceRoot()`!)*
- `parseGithubOwnerRepoFromUrl(rawUrl)`:
  ```ts
  export function parseGithubOwnerRepoFromUrl(rawUrl: string): string | null {
    const s = rawUrl.trim();
    const scp = s.match(/^git@(github\.com|ssh\.github\.com):([^/\s]+)\/([^\s/]+?)(?:\.git)?\/?$/i);
    if (scp) return `${scp[2]!.toLowerCase()}/${scp[3]!.toLowerCase()}`;
    try {
      const u = new URL(s);
      const host = u.hostname.toLowerCase();
      if (host !== "github.com" && host !== "ssh.github.com") return null;
      const parts = u.pathname.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "").split("/");
      if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
      return `${parts[0].toLowerCase()}/${parts[1].toLowerCase()}`;
    } catch {
      return null;
    }
  }
  ```
- Validate `isContainedIn(workspaceRoot, baseCloneDir)` and `isContainedIn(workspaceRoot, targetDir)`, use `pathExistsAny()` before cloning/creating worktrees, verify `.git` exists on `baseCloneDir` (for `worktree`, `branch`, and local `fresh-clone`), verify origin URL matches `repo.replace(/\.git$/i, "").toLowerCase()` (refusing `409 repo-identity-mismatch`), require clean `git status --porcelain` before `strategy: "branch"`, and run `git(["fetch", "--prune", "origin"], baseCloneDir, undefined, workspaceRoot)` surfacing errors via `400 git-failed`.

- [ ] **Step 4: Run API tests (`repos-materialize.test.ts` and `refusals.test.ts`)**

Run:
```bash
cd /home/flyfission/pr-reviews/Control-Rod/services/api
npx vitest run test/repos-materialize.test.ts
npx vitest run test/refusals.test.ts -t "every reason code"
```
Expected: Both PASS.

- [ ] **Step 5: Commit Task 4**

```bash
cd /home/flyfission/pr-reviews/Control-Rod
git add services/api/src/repos.ts services/api/src/refusals.ts services/api/test/repos-materialize.test.ts
git commit -s -m "fix(api): harden repos.ts path boundaries, git env, and base clone identity"
```

---

### Task 5: Honest `NewWorkModal`, Runtime Filtering & Race Fix (`#82`)

**Files:**
- Modify: `apps/web/src/lib/runtimes.ts:18-275`
- Modify: `apps/web/src/lib/workDefaults.ts:45-257`
- Modify: `apps/web/src/components/NewWorkModal.tsx:90-620`
- Modify: `apps/web/src/components/newwork.test.tsx:1-190`

- [ ] **Step 1: Update `apps/web/src/lib/runtimes.ts` and `workDefaults.ts`**

1. In `runtimes.ts`: add `readonly runnable: boolean;` to `CliEcosystem`, set `runnable: true` on `claude` and `codex`, and `runnable: false` on the other 8 ecosystems (`agy`, `opencode`, `grok`, `cursor`, `copilot`, `aider`, `cline`, `ollama`). Update `isIndependentCustody` JSDoc:
   `/** Preliminary UI check: distinct ecosystems selected (baselines and overrides are enforced at run time). */`
2. In `workDefaults.ts`:
   - Delete `buildClarifyingQuestions` and `ClarifyingQuestion` completely.
   - Add `sanitizeSelection(sel: Partial<AgentRuntimeSelection> | undefined, fallback: AgentRuntimeSelection): AgentRuntimeSelection` that checks `ecosystemById(sel.ecosystem).runnable`, verifies `sel.model` is in `eco.models` (falling back to `eco.defaultModel`), and resolves `reasoning` via `resolveReasoningForModel`. Apply it to `author` and `checker` in `loadWorkDefaults()`.

- [ ] **Step 2: Update `NewWorkModal.tsx` and rewrite `newwork.test.tsx` tests**

In `apps/web/src/components/NewWorkModal.tsx`:
- Track `preparedBranch` and `prepareSeqRef = useRef(0)` + snapshot `{ seq, repo, repoStrategy, workspaceRoot: activeWorkspaceRoot, branch: effectiveBranch }` in `materialize.mutationFn`. Only set `preparedPath` + `preparedBranch` in `onSuccess` if `seq === prepareSeqRef.current` and current `repo` / `repoStrategy` / `activeWorkspaceRoot` still match the snapshot.
- Invalidate `preparedPath` / `preparedBranch` (and bump `prepareSeqRef.current`) when `repo`, `repoStrategy`, `workspaceRoot`, explicit `branch`, or `mode` changes — **not** on `objective` edits in Simple mode (because `preparedBranch` pins the branch name used in `[branch:...]` when submitting!).
- Render `reposQuery.data?.github_error` in `<p role="alert" className="error">` inside the Repository fieldset when non-null.
- Add inline `<p className="small muted">` under Repository & Custody explaining:
  - Selected strategy (`worktree` / `fresh-clone` / `branch` in base clone) prepares the local git checkout now; direct runtime & workspace binding to daemon runs lands in Cycle 2.
  - Non-runnable CLIs render disabled: `<option key={c.id} value={c.id} disabled={!c.runnable}>{c.label} ({c.cliCommand}){c.runnable ? "" : " — Not yet runnable"}</option>`.
- Update subtitle at line 245 (remove `"or 4-choice clarifications"`) and O6 status at line 516:
  `Distinct ecosystems (baselines checked at run time): ${ecosystemById(author.ecosystem).cliCommand} prepares, ${ecosystemById(checker.ecosystem).cliCommand} verifies.`
- Rewrite `newwork.test.tsx`:
  - Replace `"agy"` / `"opencode"` selections with verifying disabled options (`agy`, `opencode`, `grok`, `ollama` etc. have `disabled === true`), switching between `claude` and `codex` for `Distinct ecosystems (baselines checked at run time):` vs `O6 Notice:`.
  - Add tests for: `github_error` alert rendering, stale `localStorage` (`agy` / removed model) falling back to `claude`/`codex`, `preparedBranch` staying pinned after editing `objective`, and a delayed `/repos/materialize` response discarded if `repo` changed mid-flight.

- [ ] **Step 3: Run `newwork.test.tsx` and typecheck**

Run:
```bash
cd /home/flyfission/pr-reviews/Control-Rod/apps/web
pnpm exec tsc --noEmit
npx vitest run src/components/newwork.test.tsx
```
Expected: Typecheck exits 0; all `newwork.test.tsx` tests PASS.

- [ ] **Step 4: Commit Task 5**

```bash
cd /home/flyfission/pr-reviews/Control-Rod
git add apps/web/src/lib/runtimes.ts apps/web/src/lib/workDefaults.ts apps/web/src/components/NewWorkModal.tsx apps/web/src/components/newwork.test.tsx
git commit -s -m "fix(web): disable unbacked CLIs, fix prepare race/pinning, and remove dead clarifications"
```

---

### Task 6: Board P2 Fixes & Command Inventory Sync (`#82`)

**Files:**
- Modify: `apps/web/src/features/board/QuickAdd.tsx:60-130`
- Modify: `apps/web/src/features/board/BoardReviewDrawer.tsx:145-150`
- Modify: `apps/web/src/features/board/BoardView.tsx:70-75`
- Modify: `apps/web/src/features/board/useBoardData.ts:202-208`
- Modify: `apps/web/src/features/board/quick-add.test.tsx` (and board drawer test)
- Regenerate: `docs/commands/inventory.md`, `.nuclear/changes/program-gap-analysis/evidence/inventory-check.log`

- [ ] **Step 1: Add failing tests for `QuickAdd` paste-limit/partial-retry and `BoardReviewDrawer` card switch**

In `apps/web/src/features/board/quick-add.test.tsx` (or `board-review-drawer.test.tsx`), add tests asserting:
1. Multi-line paste where line 2 exceeds `CAPTURE_LIMIT` shows the length error without calling `POST /captures`.
2. Multi-line paste of 3 lines where line 2 returns 500 keeps only lines `[line2, line3]` in state/input, invalidates `["captures"]`, and retrying sends only `line2` and `line3` (never duplicating `line1`).
3. Switching `packageId` in `BoardReviewDrawer` clears any typed `DecisionBar` return reason / error from the previous package.

- [ ] **Step 2: Run board tests to confirm failure**

Run: `cd /home/flyfission/pr-reviews/Control-Rod/apps/web && npx vitest run src/features/board/quick-add.test.tsx`
Expected: FAIL on paste `CAPTURE_LIMIT` and partial retry assertions.

- [ ] **Step 3: Apply P2 fixes in `QuickAdd.tsx`, `BoardReviewDrawer.tsx`, `BoardView.tsx`, `useBoardData.ts`**

1. `QuickAdd.tsx`:
   - Add `validateMany(titles: string[]): string | null` checking `t.length > CAPTURE_LIMIT`. Run it before `send.mutate(many)` in both `onKeyDown` (`Enter`) and `onSubmit`.
   - Use `const batchProgress = useRef<{ titles: string[]; sent: number }>({ titles: [], sent: 0 });`:
     ```ts
     mutationFn: async (titles: string[]) => {
       batchProgress.current = { titles, sent: 0 };
       for (const t of titles) {
         await api.capture({ text: t, source: "web" });
         batchProgress.current.sent += 1;
       }
     },
     onError: (e) => {
       const { titles, sent } = batchProgress.current;
       if (titles.length > 1) {
         const remaining = titles.slice(sent);
         if (sent > 0) void qc.invalidateQueries({ queryKey: ["captures"] });
         if (remaining.length <= 1) {
           setMany(null);
           setText(remaining[0] ?? "");
         } else {
           setMany(remaining);
           setText(remaining.join(" / "));
         }
       }
       setError(explain(e, "Could not add the card."));
     }
     ```
2. `BoardReviewDrawer.tsx:147`: `<DecisionBar key={packageId} view={view} />`.
3. `BoardView.tsx:72`: `document.querySelectorAll<HTMLButtonElement>(".bd-board button.bd-title")`.
4. `useBoardData.ts:205`: `loading: packages.isPending || capturesQ.isPending`.

- [ ] **Step 4: Regenerate `docs/commands/inventory.md` & refresh `inventory-check.log`**

Run:
```bash
cd /home/flyfission/pr-reviews/Control-Rod
python3 tools/generate_command_inventory.py
python3 tools/generate_command_inventory.py --check > .nuclear/changes/program-gap-analysis/evidence/inventory-check.log
cd apps/web && pnpm exec tsc --noEmit && npx vitest run src/features/board/
```
Expected: Board tests PASS; `generate_command_inventory.py --check` exits 0.

- [ ] **Step 5: Commit Task 6**

```bash
cd /home/flyfission/pr-reviews/Control-Rod
git add apps/web/src/features/board/ docs/commands/inventory.md .nuclear/changes/program-gap-analysis/evidence/inventory-check.log
git commit -s -m "fix(board): apply QuickAdd, Drawer, J/K, loading fixes and sync command inventory"
```

---

### Task 7: `#82` Standard Change Record, Full Verification Gate & Squash-Merge

**Files:**
- Modify: `.nuclear/changes/board-m4/ship.md:5` (remove stale branch name)
- Check/Modify: `docs/status.md` (ensure status matches `#82` reality)
- Create: `.nuclear/changes/workspace-ui-redesign/{basis.md,plan.md,risk.md,trace.md,verification.md,ship.md,evidence/}`

- [ ] **Step 1: Fix `board-m4/ship.md` and author Standard change record `.nuclear/changes/workspace-ui-redesign/`**

Model the Standard packet sections after `.nuclear/changes/checker-workspace/{basis,plan,risk,trace,verification,ship}.md`, covering:
- `repos.ts` + `spec/api.tsp` + `refusals.ts` + `NewWorkModal` / `runtimes` / `workDefaults` / `board` fixes + `CodexDisabledFeatures` (`daemon/internal/runner/sandbox.go:368`) + `styles.css` + `docs/commands/inventory.md` + owner `/spec/` review sign-off.
- Capture fresh logs in `.nuclear/changes/workspace-ui-redesign/evidence/`.

- [ ] **Step 2: Run full `#82` verification gate**

Run:
```bash
cd /home/flyfission/pr-reviews/Control-Rod
pnpm spec && git diff --exit-code -- spec/generated services/api/src/preparation/schema.d.ts
pnpm --filter web exec tsc --noEmit
pnpm --filter web test -- --run
pnpm --filter web build
cd services/api && npx vitest run test/repos-materialize.test.ts test/refusals.test.ts && cd ../..
cd daemon && go test ./... && cd ..
python3 tools/generate_command_inventory.py --check
python3 tools/check_public_claims.py
python3 tools/check_originality.py
python3 tools/check_register.py || true
for record in .nuclear/changes/*/; do python3 -I /home/flyfission/nuclear-grade-context-engineering/tools/ng.py validate --strict-custody "$record"; done
```
Also run local Chromium Playwright board/axe specs (`e2e/board-looks.spec.ts` etc.) and record pass output.

- [ ] **Step 3: Push `#82`, wait for CI + independent diff review, resolve threads, and squash-merge**

```bash
cd /home/flyfission/pr-reviews/Control-Rod
git push origin feat/workspace-ui-redesign
```
Update PR `#82` description with AI-authorship disclosure, wait for all 7 CI jobs green, run independent adversarial diff check, reply to + resolve all open review threads, then:
```bash
gh pr merge 82 -R FlyFission/Control-Rod --squash
```
Expected: `#82` status `MERGED`.

---

## Part C: `#83` (`feat/wave1-hardened-worktrees`, Restacked onto `main`) & `#84–#86` Restack

### Task 8: Restack `#83` onto Updated `main` (Post-`#82`)

**Files:**
- Modify/Reconcile: `feat/wave1-hardened-worktrees` against `origin/main`

- [ ] **Step 1: Restack Wave 1 commits cleanly onto `origin/main` without overwriting `#82`'s `repos.ts` / `NewWorkModal.tsx` / `spec/` fixes**

```bash
cd /home/flyfission/pr-reviews/Control-Rod
git fetch -q origin
git checkout -q -B feat/wave1-hardened-worktrees origin/main
# Cherry-pick Wave 1's daemon/license/refusal commits cleanly, then integrate Wave 1's repos.ts additions on top of main's hardened repos.ts
git cherry-pick ef4e110 --no-commit
# Inspect conflicts in services/api/src/repos.ts and keep main's Task 4 hardenings alongside Wave 1's checkpoint/remove/scaffold functions
```
*(Ensure `services/api/src/refusals.ts` retains Wave 1's 5 refusal codes, `daemon/internal/runner/git_host.go`, `git_host_test.go`, `docs/third-party/register.md`, and `third_party/licenses/GoogleCloudPlatform__scion/` remain intact.)*

- [ ] **Step 2: Verify `refusals.test.ts` and `daemon` tests pass after restack**

Run:
```bash
cd /home/flyfission/pr-reviews/Control-Rod/services/api && npx vitest run test/refusals.test.ts -t "every reason code"
cd /home/flyfission/pr-reviews/Control-Rod/daemon && go test ./...
```
Expected: Both PASS.

---

### Task 9: Remove `copyIgnoredArtifacts`/`preserve_patterns`, Extend `spec/api.tsp`, Wire `mode` in `NewWorkModal`

**Files:**
- Modify: `services/api/src/repos.ts` (delete `copyIgnoredArtifacts` and `preserve_patterns` handling)
- Modify: `spec/api.tsp` (add `CheckpointRequest`, `CheckpointResult`, `RemoveWorktreeRequest`, `RemoveWorktreeResult`, `mode` on `MaterializeRepoRequest`)
- Regenerate: `spec/generated/*`, `services/api/src/preparation/schema.d.ts`, `apps/web/src/api/schema.d.ts`
- Modify: `apps/web/src/api/types.ts`, `apps/web/src/api/client.ts`
- Modify: `apps/web/src/components/NewWorkModal.tsx:100-115`

- [ ] **Step 1: Remove `copyIgnoredArtifacts()` and `preserve_patterns` from `repos.ts`, and update `spec/api.tsp` + `NewWorkModal.tsx`**

In `spec/api.tsp` inside `namespace Repos`:
- Add optional `mode?: "software" | "capital-projects";` and `scaffolded_dirs?: string[];` on `MaterializeRepoRequest` / `MaterializeRepoResult`.
- Add `CheckpointRequest`, `CheckpointResult`, `RemoveWorktreeRequest`, `RemoveWorktreeResult`, plus `@route("/checkpoint") @post op checkpoint(...)` and `@route("/remove") @post op remove(...)`.
- In `NewWorkModal.tsx`: pass `mode` in `api.materializeRepo({ ..., mode })` (and include `mode` in the prepare snapshot).
- Run `pnpm spec` and `pnpm --filter web gen:api`, export types in `apps/web/src/api/types.ts`, and consume in `apps/web/src/api/client.ts`.

- [ ] **Step 2: Commit Task 9**

```bash
cd /home/flyfission/pr-reviews/Control-Rod
git add spec/ services/api/src/preparation/schema.d.ts services/api/src/repos.ts apps/web/src/
git commit -s -m "feat(wave1): drop unused preserve_patterns, sync TypeSpec checkpoint/remove, pass mode"
```

---

### Task 10: Harden `createCheckpoint()`, Filter Neutralization & `removeWorktreeSafely()` with TDD

**Files:**
- Modify: `services/api/src/repos.ts`
- Modify: `services/api/test/repos.test.ts`

- [ ] **Step 1: Update `services/api/test/repos.test.ts` with temp `HOME` and failing tests for all `#83` fixes**

In `services/api/test/repos.test.ts`:
- Replace `~/.cr-repos-test-*` workspace roots with a temporary `HOME` (`mkdtempSync` + `process.env.HOME = tempHome` in `beforeEach`/`afterEach` so dot-dir `$HOME` rules pass).
- Remove `.env.local` / `*.secret` `copyIgnoredArtifacts` tests.
- Add failing tests for:
  1. `createCheckpoint()` succeeds when repo configures `[filter "lfs"] clean = ... required = true` (leaves working tree/LFS content raw in checkpoint tree, exit 0).
  2. `createCheckpoint()` preserves force-staged ignored files (`git add -f`) using `--path-format=absolute --git-path index`, and works on an unborn `HEAD` with no index yet.
  3. `createCheckpoint()` refuses plain subdirectories without `.git` (never walks up to an ancestor repo) and succeeds concurrently with unique UUID refs + CAS `update-ref`.
  4. `isDangerousWorktreeRemovalPath()` / `removeWorktreeSafely()` refuses uncontained `repoPath`, symlinked `worktreePath`, `~user` tilde paths, and `"false"` string `force`; prunes/removes a missing-on-disk worktree still registered in `git worktree list` instead of leaving stale registration; maps git failures on `/repos/checkpoint` and `/repos/remove` to `400 git-failed`.
  5. `materialize` with `mode: "capital-projects"` creates `calculations/`, `drawings/`, `specifications/`.

- [ ] **Step 2: Run `repos.test.ts` to confirm new tests fail**

Run: `cd /home/flyfission/pr-reviews/Control-Rod/services/api && npx vitest run test/repos.test.ts`
Expected: FAIL on LFS `required=true`, force-staged index, uncontained `repoPath`, missing-dir registered worktree, and `git-failed` route mapping.

- [ ] **Step 3: Implement filter neutralization, CAS checkpoints, and safe removal in `services/api/src/repos.ts`**

1. Add `filterDisableEnv(repoDir: string)`:
   - Run `git config --name-only --get-regexp '^filter\..*\.(clean|smudge|process)$'` in `repoDir` (returning `[]` on exit 1).
   - Extract unique driver prefixes `filter.<driver>` and emit `GIT_CONFIG_COUNT` / `GIT_CONFIG_KEY_i` / `GIT_CONFIG_VALUE_i` entries setting `filter.<driver>.clean=""`, `filter.<driver>.smudge=""`, `filter.<driver>.process=""`, `filter.<driver>.required="false"`, plus `core.autocrlf="false"`, `core.safecrlf="false"`, `core.eol="lf"`.
   - Apply this env in `createCheckpoint()`, `scanLocalRepos()` (`git status`), `removeWorktreeSafely()` (`git status`), and `checkout`/`worktree add`.
2. In `createCheckpoint()`:
   - Require `pathExistsAny(join(repoDir, ".git"))` (and `isContainedIn(workspaceRoot, repoDir)` at the route).
   - Resolve index via `const idxPath = await git(["rev-parse", "--path-format=absolute", "--git-path", "index"], repoDir, ..., workspaceRoot)`. If `existsSync(idxPath)`, `copyFileSync(idxPath, tempIndex)`; else if `headSha`, `git(["read-tree", "HEAD"], ...)`; else skip `read-tree` cleanly for unborn `HEAD`.
   - Ref name: `refs/cr-checkpoints/${labelSlug}-${stamp}-${randomUUID()}` and `git(["update-ref", ref, commitSha, ""], repoDir, indexEnv, workspaceRoot)`.
3. In `isDangerousWorktreeRemovalPath()` & `removeWorktreeSafely()`:
   - Put `!isContainedIn(resolvedRoot, resolvedRepo)` directly inside `isDangerousWorktreeRemovalPath()`.
   - Expand only `~/...` (refuse `~user/...` with `400 unsafe-worktree-path`).
   - Require `pathExistsAny(join(resolvedRepo, ".git"))`.
   - If `!pathExistsAny(resolvedWt)`, check `git(["worktree", "list", "--porcelain"], resolvedRepo)`: if `worktree ${resolvedWt}` is listed, run `git(["worktree", "prune"], resolvedRepo)` (or `remove --force` if `opts.force`) and return `{ removed: resolvedWt }`; otherwise throw `404 worktree-not-found`.
4. In `/repos/remove` and `/repos/checkpoint` routes: pass `force: body.force === true` and wrap `git` execution errors in `throw new Refusal(400, "git-failed", msg)` when not already a `Refusal`.

- [ ] **Step 4: Run `repos.test.ts` and `repos-materialize.test.ts` to verify all pass**

Run: `cd /home/flyfission/pr-reviews/Control-Rod/services/api && npx vitest run test/repos.test.ts test/repos-materialize.test.ts test/refusals.test.ts`
Expected: All PASS.

- [ ] **Step 5: Commit Task 10**

```bash
cd /home/flyfission/pr-reviews/Control-Rod
git add services/api/src/repos.ts services/api/test/repos.test.ts
git commit -s -m "fix(wave1): neutralize git/LFS filters, preserve checkpoint index, harden removal"
```

---

### Task 11: `#83` Change Record, Merge to `main`, and Restack `#84–#86`

**Files:**
- Create: `.nuclear/changes/wave1-hardened-worktrees/{basis.md,plan.md,risk.md,trace.md,verification.md,ship.md,evidence/}`
- Restack branches: `feat/wave2-multi-cli-assurance` (`#84`), `feat/wave3-workbench-outfall` (`#85`), `feat/wave4-full-integration` (`#86`)

- [ ] **Step 1: Create Standard change record `.nuclear/changes/wave1-hardened-worktrees/` and run full `#83` gate**

Run:
```bash
cd /home/flyfission/pr-reviews/Control-Rod
pnpm spec && git diff --exit-code -- spec/generated services/api/src/preparation/schema.d.ts
pnpm --filter web exec tsc --noEmit && pnpm --filter web test -- --run && pnpm --filter web build
cd services/api && npx vitest run test/repos.test.ts test/repos-materialize.test.ts test/refusals.test.ts && cd ../..
cd daemon && go test ./... && cd ..
python3 tools/generate_command_inventory.py --check
python3 tools/check_public_claims.py
python3 tools/check_originality.py
python3 tools/check_register.py || true
for record in .nuclear/changes/*/; do python3 -I /home/flyfission/nuclear-grade-context-engineering/tools/ng.py validate --strict-custody "$record"; done
```
Retarget `#83` → `main` (`gh pr edit 83 -R FlyFission/Control-Rod --base main`), push `feat/wave1-hardened-worktrees` (force-with-lease on restack), wait for CI green + independent adversarial diff review, resolve all review threads, and squash-merge `#83`:
```bash
gh pr merge 83 -R FlyFission/Control-Rod --squash
```

- [ ] **Step 2: Restack `#84` → `#85` → `#86` onto `main` cleanly**

```bash
cd /home/flyfission/pr-reviews/Control-Rod
git fetch -q origin
```
Restack `feat/wave2-multi-cli-assurance` onto `origin/main` (keeping disabled non-`claude`/`codex` CLIs in `runtimes.ts` + `NewWorkModal.tsx` until Cycle 2), then `feat/wave3-workbench-outfall` onto `#84` (reconciling `repos.ts` to keep `#83`'s hardened helpers alongside `/repos/freeze`, plus `refusals.ts`), then `feat/wave4-full-integration` onto `#85` (reconciling `repos.ts`, `client.ts` generated types + `checkpointRepo`/`freezeRepo`, and running `python3 tools/generate_command_inventory.py` so `outfall.*` passes `--check`).
Retarget `#84` → `main` (`gh pr edit 84 -R FlyFission/Control-Rod --base main`), push `--force-with-lease` on `#84`, `#85`, `#86`, and verify all 3 show `MERGEABLE` + green CI.

---

## Plan Self-Review

1. **Spec coverage:**
   - Section 2 (squash-merge, DCO, CODEOWNERS `/spec/`, `#83` restack, `#84–#86` restack + `inventory.md` on `#82` & `#86`): covered in Tasks 2, 3, 6, 7, 8, 11.
   - Section 3 (`#69` parser indent/steps/block-scalars/duplicate/both/tabs/multi-doc + Quick packet digests & proposed diff): covered in Tasks 1–2.
   - Section 4 (`#82` `repos.ts` + `repo-identity-mismatch` + `spec/api.tsp` + `pnpm spec`/`gen:api` + `repos-materialize.test.ts` + `NewWorkModal`/`runtimes`/`workDefaults`/`newwork.test.tsx` + `QuickAdd`/`Drawer`/`BoardView`/`useBoardData` + Standard record): covered in Tasks 3–7.
   - Section 5 (`#83` drop `copyIgnoredArtifacts`/`preserve_patterns`, LFS/filter `GIT_CONFIG_*`, `--path-format=absolute` index + unborn `HEAD`, CAS `update-ref`, `repoPath` containment + missing-dir prune + `force === true` + `git-failed` mapping, `spec/api.tsp` + `mode`, temp `HOME` in `repos.test.ts`, Standard record): covered in Tasks 8–11.
   - Section 6 (local/CI/Playwright/custody/independent-review/thread-resolution verification gates): covered in Tasks 2, 7, 11.
2. **Placeholder scan:** No `TBD`/`TODO` or deferred steps; every code change has concrete snippets, paths, and verification commands.
3. **Type consistency:** `isSafeRepoIdentifier`, `realpathOrNearest`, `parseGithubOwnerRepoFromUrl`, `isContainedIn`, `LocalRepoInfo`, `GithubRepoInfo`, `ReposResponse`, `MaterializeRepoRequest`, `MaterializeRepoResult`, `runnable`, `preparedBranch`, `batchProgress` match across spec, plan tasks, and existing source.
