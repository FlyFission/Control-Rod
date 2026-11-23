# Risk: worktree daemon binding

**Mode:** Standard. **Execution owner:** Codex author agent. **Decision owner:** Ben Huffer.

| Risk | Control | Stop condition |
| --- | --- | --- |
| Capture text grants filesystem authority | Only validated structured capture input binds author runs. | Text header influences launch path. |
| Checkout escape or wrong branch | API and daemon independently validate containment, symlinks and Git identity. The daemon also enforces its own host rule: root and checkout inside the home folder, outside dot folders, and not overlapping the daemon home, CLI login locations or the run policy's denied paths. | Validation permits an escaped or changed checkout, or one that overlaps a protected location. |
| Agent gets writable Git administration | Only linked worktrees can be bound: the API refuses base and fresh clones, and the daemon refuses any binding whose Git directory or common directory is inside the checkout. Shared Git administration stays outside the sandbox's write scope. | A bound checkout has `.git` as a directory inside it. |
| Checkout ancestor swapped after validation | The daemon opens the checkout once (`os.OpenRoot`), validates the binding, then requires the handle's directory to be the same device and inode as what the path names (`os.SameFile`). Reservation, staging, capture and cleanup all go through that one handle, never the path again. The run directory is opened right after it is created and must be the very directory created (a link put at that name is refused); staging and capture then use that run directory handle, so nothing is written or read through a link inside the checkout either. | A write or read lands in a directory other than the validated checkout. |
| Agent redirects staging or output capture | The run directory is in the agent-writable checkout. Inputs are staged, and inputs and outputs are read, through `os.Root` directory handles: staging opens the checkout and run directory as handles and creates files exclusively; capture opens each component below the checkout through its parent's handle, refuses a link, then walks and opens files relative to the final handle. A path swapped for a link after the open cannot redirect a read or write. | Staging or capture touches a file outside the run directory. |
| Checkout changes between check and run end | Identity, branch and HEAD are checked before start (`BeforeStart`) and read again after the processes are confirmed gone. The trace records the values found (`checkout_final`) beside the requested binding (`checkout`). The run fails if the repository, Git directories or `.git` entry changed, the branch differs, or HEAD is neither the bound commit nor a descendant of it. Commits on the bound branch are allowed. The observed values are recorded only after Git identity is confirmed; on an identity mismatch no `checkout_final` is recorded. | A run succeeds although the checkout left the bound branch or moved HEAD off its history. |
| Run preparation deletes user files | Reserve per-run evidence paths; never clear the selected checkout. The reserved `.controlrod-run-<id>` directory is removed with custody once outputs are in memory. Removal is checked against the held handle but is not atomic with the delete, so under a same-user swap it could remove other content (accepted residual below). | Existing checkout data is overwritten or removed during preparation or cleanup. |
| Concurrent writers | Exclusive checkout custody: a lock file in the daemon's own home (`checkout-locks/`), keyed by checkout identity, so the agent cannot unlink it. It stays held when a run's processes cannot be confirmed stopped (`ErrUncontained`), until the daemon exits. Custody is per daemon home; two daemons with different homes on one host do not exclude each other. | Concurrent author launches share the checkout, or custody is released while processes may survive. |
| Cleanup deletes another directory | Before removing the run directory, the held run handle is compared with the entry at that name (`os.SameFile`). A different directory is left in place and a warning is logged. This is a check, not a lock: see the accepted residual risk below. | The daemon removes a directory it did not reserve after a swap that the check could see. |
| Worktree of another repository bound under a card's name | The API requires the worktree's common Git directory to equal the named base clone's `.git`, as well as the GitHub origin check. | A worktree whose common directory is another repository's is bound. |
| Bound success without evidence | A succeeded completion for a bound run must carry an execution trace whose checkout equals the frozen one and a `checkout_final` whose branch equals the frozen branch; otherwise it is refused. | A bound run's success is applied with no trace. |
| Daemon without custody claims bound work | The claim advertises checkout support only where custody works (Unix); a bound run that a daemon cannot take is held with a visible reason, not skipped silently. | A host where `lockCheckout` fails advertises support. |
| Trace names another checkout | Completion refuses an execution trace whose checkout differs from the checkout frozen into the run. | A completion with a mismatched checkout is applied. |
| Checker sees author history | Checker never inherits the checkout binding. | Checker starts inside author checkout. |
| Old daemon ignores new binding | Claim admission requires checkout support. | Unsupported daemon claims a bound author run. |

## Accepted residual risk

A process running as the same user, outside the agent's sandbox, can switch the checkout's branch or HEAD after the last check and before the agent process starts, then restore it before the post-run read. Neither check can see this, and no user-space lock prevents it: Git does not lock a worktree against other processes of its owner, and the checks read state rather than hold it. The same applies to a change made and undone entirely inside the run. The agent process is likewise started in the checkout by pathname, so a directory swapped in at that path after preparation by such a process can be entered. A cheap mitigation narrows it: immediately before the start, `beforeStartCheck` requires the path to still name the directory the held handle opened (`os.SameFile`). It does not close the window between that check and the operating system's `chdir`. Cleanup has the same gap: a same-user process can swap a directory in at the run directory's name between the identity check and the recursive delete, and the delete then removes what was swapped in. The check narrows this; it does not prevent it. This is accepted as residual because closing it needs operating-system level mandatory locking or a different execution model, both out of scope for this change. The run's recorded branch and HEAD show what was found, not what was held throughout.

Additive contracts require CODEOWNERS review at merge. No kernel decision function, policy, protected red-team test or workflow changes are planned. No new benchmark, budget or estimate is claimed.

## Required links

[Basis](basis.md), [plan](plan.md), [risk](risk.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Controls have author evidence and are independently checked before acceptance.

## Source-lineage note

Local engineering evidence under the repository workflow. [Workflow source map](https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md)
