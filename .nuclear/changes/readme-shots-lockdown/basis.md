# Basis: lock down the README screenshot workflow

**Change slug:** `readme-shots-lockdown`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-18
**Decision this basis supports:** whether `.github/workflows/readme-shots.yml`, added by PR #93 without a recorded signature, may stay on `main` in the split form this change proposes.

## Mission / need

PR #93 (merged 2026-11-18 as 8b875ab) added `readme-shots.yml`. Its one job held `contents: write` while it installed and ran the pull request's own code (`pnpm install`, the spec build, Playwright), with the token stored in the checkout's git config, and then pushed with it. Review on #93 found two problems with it (comments 4621730491 by Copilot and 4621714336 by Codex): pull request code ran with a write token, and the workflow, a trust surface under AGENTS rule 2, had no human signature. The push step also expanded `${{ github.head_ref }}` straight into the shell script, which zizmor reports as template injection (`evidence/zizmor-before-after.txt`).

## Exposure found on 2026-11-18

- Triggers: `pull_request` touching the spec or the workflow, and `workflow_dispatch`. Not `pull_request_target`, so a fork's pull request gets a read-only token from GitHub and the push step's same-repository condition skips it.
- Who could reach the write token: only people who can push a branch here (they already have write access), and any code their branch pulls in (a dependency or install script), which is the real gap.
- What ran: 11 runs of `readme-shots` exist (GitHub Actions API, read 2026-11-18), all `pull_request` on `claude/tour-accuracy` in this repository. 7 were started by FlyFission's pushes; 4 were created by the bot's own pushes and ran no job. The bot made 4 commits (63f5d8e, d62c32c, 1548495, f0f8a2c), each touching only `docs/assets/readme/app/*.png`. No `workflow_dispatch` run and no fork run. Nothing suspicious was found. Repository settings and secrets were not changed or rotated.

## Protected outcomes

| Protected outcome | Evidence needed |
|---|---|
| No pull request code, dependency or install script runs while a write token exists. | `evidence/yaml-parse.txt`: `shots` is `contents: read` with `persist-credentials: false`; `commit` runs no repository code. |
| Only pictures can be pushed, and only to the pull request's own branch. | `evidence/commit-step-test.txt`: names, types, sizes, links and folders checked; staged paths limited to `docs/assets/readme/app/*.png`. |
| No event value is expanded into a shell script. | `evidence/zizmor-before-after.txt`: the template-injection finding is gone. |
| A fork's pull request never reaches the write job. | The `commit` job's `if`, and GitHub's read-only token for forks on `pull_request`. |

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| `actions/checkout` and `git commit` run no code from the checked-out branch. | No hooks, submodules or LFS are enabled; git hooks and filters come from `.git/config`, which the branch does not supply. | Adding `submodules`, `lfs`, a setup step or any `run` of repository code to `commit`. |
| A same-repository author already has write access, so a workflow edit on their own branch is not an escalation. | `pull_request` takes the workflow from the pull request; only people with push access open same-repository branches. | A change to `pull_request_target` or `workflow_run`, or a reviewer role without push access. |
| The bot's pushes start no further jobs. | On #93 the 4 bot-created runs ran no job. | A run started by `github-actions[bot]` that executes a job. |

## Revision 2 (2026-11-19): the push moves to a workflow only the default branch defines

Review on #94 after merge (Copilot comment 4622578535) found that the `commit` job, though it ran no branch code, still lived in a `pull_request` workflow, which GitHub runs as the pull request's own copy. A branch could add a step to `commit` and use its write token. Codex (comment 4622565588) found the Signature table blank. Revision 2:

- `readme-shots.yml` keeps only the read-only `shots` job. Nothing in it holds a write token.
- `readme-shots-commit.yml` is new. It runs on `workflow_run` when a `readme-shots` run completes, and GitHub always runs the default branch's copy of a `workflow_run` workflow, so no pull request can change what holds the write token. Branch, commit and repository come from the event, not the artifact; only successful `pull_request` runs from this repository and not on the default branch are served. The artifact checks are unchanged.
- Limit: any workflow a branch names `readme-shots` can start it, so the event checks and the artifact checks are what hold, not the name. A branch can at most get validated PNG files pushed to its own branch, which its author can already do.
- Limit: `workflow_run` workflows run only from the default branch, so `readme-shots-commit.yml` cannot run on the pull request that adds it. Its first live run is the first `readme-shots` pull request after merge.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

RS-01 to RS-05 are implemented with scanner, YAML-parse and local test evidence, and CI on this change is reported as it ran; the signature for the screenshot workflow is left for a maintainer. Nothing here is presented as signed.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
