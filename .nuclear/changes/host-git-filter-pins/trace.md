# Trace: replace repository-defined filter drivers in host-side git

| Requirement | Code (`daemon/internal/runner/git_host.go`) | Tests (`git_host_test.go`) | Disposition |
|---|---|---|---|
| HG-01 A filter driver defined in repository config (`.git/config`, an included file, `config.worktree`) does not run through `HostGitCommand`, and `required=true` does not fail the command. | `listGitConfig`, `repoConfigScope`, `filterPins`, `pinEnv`, `HostGitCommand` | `TestHostGitCommandNeutralizesRepoFilterDriver`, `...IncludedFilterDriver`, `...WorktreeFilterDriver`, `TestFilterPins`, `TestParseGitConfigList` | implemented and tested; mutation checked |
| HG-02 The host user's global or system definition of the same variable is the one that runs; a valueless trusted entry (git reads it as true) is pinned as `true`. | `filterPins` | `TestHostGitCommandKeepsGlobalFilterDefinition`, `TestFilterPins`, `TestFilterPinsValuelessTrustedRequired` | implemented and tested; mutation checked |
| HG-03 A change to the repository's filter-driver entries while the command runs fails it with `ErrRepoConfigChanged`; other changes do not. | `HostGitCmd`, `repoFilterEntries`, verify in `HostGitCommand` | `TestHostGitCmdDetectsFilterConfigChange` | implemented and tested; mutation checked |
| HG-05 A repository filter driver whose name contains "=", or is empty (`filter..clean`, selected by `filter=`), is pinned and checked after the run too: the pins go through the `GIT_CONFIG_*` environment, which keeps the key whole, not `-c`, which git splits at the first "=". Found by the Codex and Copilot reviews on PR #104. | `configPin`, `pinEnv`, `filterDriverKey`, `HostGitCommand` | `TestHostGitCommandNeutralizesFilterNameWithEquals`, `TestHostGitCommandNeutralizesEmptyFilterName`, `TestFilterDriverKey`, `TestPinEnv` | implemented and tested; mutation checked |
| HG-04 An empty directory is refused; `core.hooksPath` is `os.DevNull`. | `HostGitCommand`, `HostGitArgs` | `TestHostGitCommandRequiresDir`, `TestHostGitArgsNeutralizesHostExecution` | implemented and tested; Windows not run |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

HG-01 to HG-05 are implemented with tests, each control is shown to matter by mutation, and the daemon suite passes.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
