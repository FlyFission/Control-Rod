# Ship: first macOS install fixes

Release decision: **pull request for owner review; no merge or release is authorized by this record.**

- **Proposed:** merge to main.
- **Not claimed:** no live Codex run on macOS; doctor's agent section checked on Linux only.
- **Known (blind check, P2):** doctor prints a CLI's own probe diagnostics as is, so a path a CLI prints on a failed `--version` would appear in copied doctor output (no token content was found); doctor can judge a runtime with an older built daemon than `start` then rebuilds, and without `start`'s `bin` on PATH.

Rollback: revert the commit. This removes `controlrod runtimes`, doctor's agent section, the quieter start and the evidence; the nine features stay allowed, because #156 already put them in `CodexSafeFeatures`. To refuse Codex 0.171.0 again, remove those nine from the list in its own change.

Monitoring after merge: a Codex feature found to reach further than classified; a new Codex release refused for new features (each needs the same qualification).

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

MI-01 to MI-03 are implemented; MI-01 fails first on the captured Codex 0.171.0 feature list, and the daemon tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
