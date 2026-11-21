# Plan: replace repository-defined filter drivers in host-side git

1. Write tests that define a filter driver in repository config (directly, through `include.path`, and in `config.worktree`) whose commands touch a marker, and run checkout, status and add through `HostGitCommand` ([basis](basis.md)).
2. Port the config listing, filter pins and `HostGitCmd` after-run check from upstream; refuse an empty directory; use `os.DevNull`.
3. Add tests for the global definition being kept, for the after-run check, for the empty directory, and unit tests for parsing and pins.
4. Remove each control in turn and record the tests failing (`evidence/mutation.sh`, `evidence/mutation.log`); run the whole daemon suite (`evidence/green-daemon.log`).
5. Update the third-party register rows for `git_host.go` and its test.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

HG-01 to HG-04 are implemented with tests, each control is shown to matter by mutation, and the daemon suite passes.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
