# Trace: replace repository-defined filter drivers in host-side git

| Requirement | Code (`daemon/internal/runner/git_host.go`) | Tests (`git_host_test.go`) | Disposition |
|---|---|---|---|
| HG-01 A filter driver defined in repository config (`.git/config`, an included file, `config.worktree`) does not run through `HostGitCommand`, and `required=true` does not fail the command. | `listGitConfig`, `repoConfigScope`, `filterPins`, `HostGitCommand` | `TestHostGitCommandNeutralizesRepoFilterDriver`, `...IncludedFilterDriver`, `...WorktreeFilterDriver`, `TestFilterPins`, `TestParseGitConfigList` | implemented and tested; mutation checked |
| HG-02 The host user's global or system definition of the same variable is the one that runs. | `filterPins` | `TestHostGitCommandKeepsGlobalFilterDefinition`, `TestFilterPins` | implemented and tested; mutation checked |
| HG-03 A change to the repository's filter-driver entries while the command runs fails it with `ErrRepoConfigChanged`; other changes do not. | `HostGitCmd`, `repoFilterEntries`, verify in `HostGitCommand` | `TestHostGitCmdDetectsFilterConfigChange` | implemented and tested; mutation checked |
| HG-04 An empty directory is refused; `core.hooksPath` is `os.DevNull`. | `HostGitCommand`, `HostGitArgs` | `TestHostGitCommandRequiresDir`, `TestHostGitArgsNeutralizesHostExecution` | implemented and tested; Windows not run |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

HG-01 to HG-04 are implemented with tests, each control is shown to matter by mutation, and the daemon suite passes.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
