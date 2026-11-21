# Basis: replace repository-defined filter drivers in host-side git

**Change slug:** `host-git-filter-pins`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-21
**Decision this basis supports:** whether `HostGitCommand` may carry upstream's repository filter-driver pins and after-run check.

## Mission / need

The port of `GoogleCloudPlatform/scion` `pkg/util/git_host.go` in `daemon/internal/runner/git_host.go` left out every check that reads the repository's own git config. The provenance backfill on PR #88 (`.nuclear/changes/wave1-hardened-worktrees/provenance.md` on that branch, "Unavoidable behaviour differences" item 1) reported the result: a filter driver (`filter.<name>.clean`, `smudge`, `process`, `required`) set in a repository's `.git/config`, a `config.worktree` or a file it includes is not replaced, so a host-side checkout, status or add in a repository an agent can write would run whatever command that config names, on the host, outside the run's confinement. The owner asked on 2026-11-21 for the open items to be closed out.

## What exists today

`HostGitCommand` has no callers on `main` (`grep -rn HostGit daemon` finds only `git_host.go` and its test), so no shipped code path is exposed today. The fix lands before the first caller does.

## Fix

Carried from upstream at the pinned commit, Apache-2.0, notice already retained under `third_party/licenses/GoogleCloudPlatform__scion/`:

1. Before building the command, `HostGitCommand` lists the config git sees in the directory (`git config --show-scope -z --list`, with `HostGitArgs` and the scrubbed environment). For each filter driver variable the repository scope (`local`, `worktree`, including included files) sets, it adds `-c filter.<name>.<var>=<value>`, where the value is the host user's global or system definition, or empty when there is none, and `required` becomes `false`. Command-line settings outrank every config file.
2. The command is returned as `*HostGitCmd`; `Run`, `Output` and `CombinedOutput` list the config again afterwards and fail with `ErrRepoConfigChanged` if the repository's filter-driver entries changed while git ran.
3. Two additions from the Codex review on PR #104, not in upstream: a repository filter driver whose name contains "=" is refused, because a `-c` setting cannot address it; and a valueless trusted entry is pinned as `true`, as git reads it.
4. An empty directory is refused (provenance item 3), and `core.hooksPath` uses `os.DevNull` as upstream does (item 2).

## Not carried

Upstream's deny-by-default repository config policy (refusing an include directive or any key outside an allowlist, before and after the command), the discovery ceiling, and the LFS and credential options. That policy is upstream's primary control and depends on a larger body of code (`checkRepoConfigPolicy`, `verifyConfigStable`, allowlists per repository kind) that is not in the pinned file. See risk R-04.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

HG-01 to HG-05 are implemented with tests, each control is shown to matter by mutation, and the daemon suite passes.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
