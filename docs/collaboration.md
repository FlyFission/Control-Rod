# Collaborating on Control Rod

How work moves from an idea to `main`. The rules that cannot bend are in [AGENTS.md](../AGENTS.md) and [CONTRIBUTING.md](../CONTRIBUTING.md); this page is the day-to-day workflow around them.

## The path of a change

1. **Issue.** Every piece of work starts as a GitHub issue (use a template under *New issue*). One issue, one outcome a reviewer can check.
2. **Change record.** Create `.nuclear/changes/<slug>/` with risk, basis, plan, trace, verification and ship files before you touch code. A small administrative change may use the commit message as its record. CI validates every record with `--strict-custody`.
3. **Branch.** From the latest `main`. Name it by kind: `feat/…`, `fix/…`, `docs/…`, or `phase-N/…` for planned phase work.
4. **Pull request.** Fill in the template completely: the change record, what changed and why, whether a trust surface is touched, and the evidence. Link the issue with `Closes #N`. Open it as a draft until CI is green.
5. **Review.** Answer every review thread, including the ones left by automated reviewers (Copilot, the Codex connector). A thread left open at merge has meant a follow-up PR before; resolve or reply to each one first.
6. **Merge.** Squash merge, once CI is green and the required review is in. The squash title is the commit on `main`, so make it say what changed, with the PR number.

## Who reviews what

[CODEOWNERS](../.github/CODEOWNERS) lists the trust surfaces: `policies/`, `tests/redteam/`, `.github/`, `kernel/`, `spec/` and `docs/adr/`. A change there needs a maintainer who did not author it. That includes agent-authored changes: the person who prompted the agent counts as the author.

The same rule works as a team habit: with two people building, each reviews the other's pull requests. Neither approves their own.

Never skip, disable or quarantine a test to get green, and never merge on red. If a failure is environmental, say so in the PR with the output, and add it to [status.md](status.md#known-failures-and-rough-edges).

## Working with AI agents

Agents are expected here; the repository is built for them. The rules that apply to them apply to you when you drive one:

- Start the agent from a change record, and have it read that record before anything else.
- It must not edit a trust surface, hand-edit generated code, copy code from a copyleft or source-available project, or type an engineering number. All of these are in [AGENTS.md](../AGENTS.md).
- Review its diff as you would a colleague's. Run the checks in [getting-started.md](getting-started.md#check-your-change) yourself; do not rely on its report that they passed.
- Say in the PR when an agent wrote it. Agent PRs carry the same evidence requirement as any other.

## Labels

Create these once (the owner or anyone with write access; needs the `gh` CLI):

```sh
gh label create "kind: bug"      --color d73a4a --description "Something is broken"
gh label create "kind: feature"  --color 0e8a16 --description "New capability"
gh label create "kind: docs"     --color 0075ca --description "Documentation only"
gh label create "kind: chore"    --color cfd3d7 --description "Maintenance, dependencies, tooling"
gh label create "trust surface"  --color b60205 --description "Touches policies, red-team, workflows, kernel decisions, spec majors"
gh label create "needs owner"    --color fbca04 --description "Waiting on a decision only the owner can make"
gh label create "blocked"        --color 000000 --description "Waiting on something else"
gh label create "good first task" --color 7057ff --description "Self-contained, no trust surface, clear test"
```

Dependabot already uses `dependencies` plus an ecosystem label.

## The project board

Use one [GitHub Project](https://docs.github.com/en/issues/planning-and-tracking-with-projects) for planning so that issues, pull requests and phases are visible in one place. Projects are created in the GitHub UI under the organization's **Projects** tab. Suggested setup:

**Fields**

| Field | Type | Values |
| --- | --- | --- |
| Status | Single select | Backlog, Ready, In progress, In review, Done |
| Phase | Single select | One value per phase of the plan (for example 5 and 6), plus Platform and Docs |
| Area | Single select | Kernel, API, Web, Daemon, Packs, Spec, Docs, Repo |
| Trust surface | Single select | None, Needs signature |
| Owner | Assignee | Whoever is building it |

**Views**

- **Board** grouped by Status, filtered to open items. This is the daily view.
- **Roadmap** (table) grouped by Phase, sorted by Status.
- **Needs me**, filtered to `Trust surface = Needs signature` or label `needs owner`. This is what each of you checks first thing.
- **Dependencies**, filtered to label `dependencies`, so bumps do not drown real work.

**Automation** (built in, under the project's *Workflows*): add new issues and pull requests to the project automatically; set Status to *Done* when an item closes or merges; set Status to *In review* when a pull request opens.

Seed the backlog from [status.md](status.md) (the stubbed and planned list) and the Phase 6 remainder.

## Branch protection

Settings, then Branches, then a rule for `main`. Recommended:

- Require a pull request, with at least 1 approving review and review from Code Owners.
- Require the seven CI checks to pass: `typescript`, `rust`, `go`, `python`, `licenses`, `change-records` and `sbom`.
- Require conversation resolution before merging.
- Require branches to be up to date before merging.
- Do not allow bypassing the above, including for administrators.
- Allow squash merging only.

A pull request that shows as `blocked` with green CI is usually waiting on one of these requirements, most often a review. Check the merge box on the PR before assuming CI is at fault.

## Dependabot

Dependabot opens version bumps weekly. Routine patch and minor bumps whose CI is green and which touch no trust surface can be squash merged. Do not merge a bump just because it is green; check whether it needs a coordinated change.

Bumps held on purpose as of 2026-11-06:

| PR | Bump | Why it waits |
| --- | --- | --- |
| #43 | `wasm-bindgen` 0.2.104 to 0.2.130 | `kernel/bindings/wasm/Cargo.toml` pins `=0.2.104`, and `scripts/build-kernel-wasm.sh` needs the matching CLI. The crate, the CLI and the generated artifacts must move together. It lives under `kernel/`, which CODEOWNERS covers, so get a second maintainer's review. |
| #44 | `jdx/mise-action` 5.2.2 to 5.2.6 | Edits `.github/workflows/ci.yml`, a trust surface. The action is pinned by SHA; a reviewer should check the new SHA. |
| #50 | `@types/node` 22 to 26 | The runtime is Node 22 (`mise.toml`). Types for a newer Node than the one we run hide real errors. The earlier 26 bump (#9) was closed on purpose. |
| #48 | `jsdom` 26 to 30 | The `typescript` CI job fails. Needs a code change in the web tests. |
| #10 | `typescript` 5.9 to 7.0 | The `typescript` CI job fails. A migration task, not a bump. |

When you decide a bump will never be wanted, close it and comment `@dependabot ignore this major version` (or minor, or dependency) so it stops coming back.

## Issue and PR hygiene

- Close a pull request that has been superseded, and say why in a comment. Keep its branch for a while in case someone wants it.
- Stacked pull requests (one based on another's branch) are fine, but say so in the description and merge in order. Retarget to `main` as each base merges, and never leave a stack open for weeks: the earlier stack here drifted so far from `main` (dozens of its files had since been edited there) that merging it risked undoing later work, and it had to be closed.
- Delete merged branches (turn on *Automatically delete head branches* in repository settings).
- Anything you find that you will not fix in the current PR becomes an issue.
