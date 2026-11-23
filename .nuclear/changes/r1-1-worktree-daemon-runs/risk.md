# Risk: worktree daemon binding

**Mode:** Standard. **Execution owner:** Codex author agent. **Decision owner:** Ben Huffer.

| Risk | Control | Stop condition |
| --- | --- | --- |
| Capture text grants filesystem authority | Only validated structured capture input binds author runs. | Text header influences launch path. |
| Checkout escape or wrong branch | API and daemon independently validate containment, symlinks and Git identity. The daemon also enforces its own host rule: root and checkout inside the home folder, outside dot folders, and not overlapping the daemon home, CLI login locations or the run policy's denied paths. | Validation permits an escaped or changed checkout, or one that overlaps a protected location. |
| Agent gets writable Git administration | Only linked worktrees can be bound: the API refuses base and fresh clones, and the daemon refuses any binding whose Git directory or common directory is inside the checkout. Shared Git administration stays outside the sandbox's write scope. | A bound checkout has `.git` as a directory inside it. |
| Agent redirects staging or output capture | The run directory is in the agent-writable checkout. Inputs are staged, and inputs and outputs are read, through `os.Root` directory handles: staging opens the checkout and run directory as handles and creates files exclusively; capture opens each component below the checkout through its parent's handle, refuses a link, then walks and opens files relative to the final handle. A path swapped for a link after the open cannot redirect a read or write. | Staging or capture touches a file outside the run directory. |
| Checkout changes between check and run end | Identity, branch and HEAD are checked before start (`BeforeStart`) and read again after the processes are confirmed gone. The trace records the values found (`checkout_final`) beside the requested binding (`checkout`). The run fails if the repository, Git directories or `.git` entry changed, the branch differs, or HEAD is neither the bound commit nor a descendant of it. Commits on the bound branch are allowed. Residual window: nothing pins the branch during the run or between the last pre-start check and process start, so a change made and undone inside the run, or a descendant HEAD moved by a non-commit action, is not detected. | A run succeeds although the checkout left the bound branch or moved HEAD off its history. |
| Run preparation deletes user files | Reserve per-run evidence paths; never clear the selected checkout. The reserved `.controlrod-run-<id>` directory is removed with custody once outputs are in memory; no other checkout content is removed. | Existing checkout data is overwritten or removed during preparation or cleanup. |
| Concurrent writers | Exclusive checkout custody: a lock file in the daemon's own home (`checkout-locks/`), keyed by checkout identity, so the agent cannot unlink it. It stays held when a run's processes cannot be confirmed stopped (`ErrUncontained`), until the daemon exits. Custody is per daemon home; two daemons with different homes on one host do not exclude each other. | Concurrent author launches share the checkout, or custody is released while processes may survive. |
| Daemon without custody claims bound work | The claim advertises checkout support only where custody works (Unix); a bound run that a daemon cannot take is held with a visible reason, not skipped silently. | A host where `lockCheckout` fails advertises support. |
| Trace names another checkout | Completion refuses an execution trace whose checkout differs from the checkout frozen into the run. | A completion with a mismatched checkout is applied. |
| Checker sees author history | Checker never inherits the checkout binding. | Checker starts inside author checkout. |
| Old daemon ignores new binding | Claim admission requires checkout support. | Unsupported daemon claims a bound author run. |

Additive contracts require CODEOWNERS review at merge. No kernel decision function, policy, protected red-team test or workflow changes are planned. No new benchmark, budget or estimate is claimed.

## Required links

[Basis](basis.md), [plan](plan.md), [risk](risk.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Controls have author evidence and are independently checked before acceptance.

## Source-lineage note

Local engineering evidence under the repository workflow. [Workflow source map](https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md)
