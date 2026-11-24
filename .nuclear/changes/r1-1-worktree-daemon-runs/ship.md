# Ship: worktree daemon binding

Release decision: **draft only.** [Verification](verification.md) records the author checks, the overseer's macOS suite results and the [fix round](verification.md#fix-round), in which the Go and API suites and the typecheck were rerun. The independent checker verdict, Ben's acceptance, and merge are pending.

## Behaviour change for Ben to confirm

A bound checkout must now be a linked worktree (`<root>/.worktrees/<repo>/<branch>`). The API refuses the base clone and fresh clones (`<root>/<repo>`, `<root>/<repo>-<branch>`) with `checkout-not-linked-worktree`, and the daemon refuses any checkout whose Git directory sits inside it. Those clones keep `.git` inside the writable checkout, so hooks and config would be writable by the agent. The alternative, keeping `.git` read-only in the sandbox, depends on Claude and Codex sandbox options that were not tested here. Confirm that linked worktrees only is acceptable.

Other changes a reviewer should know: the daemon enforces its own home-folder and protected-location rule; the run directory in the checkout is removed after the run (it is not git-excluded, because that would write shared Git administration); custody locks live in the daemon home, so they exclude runs within one daemon home only; and an uncontained run keeps custody until the daemon exits.

Additive TypeSpec contracts and generated artifacts require owner CODEOWNERS review at merge. No protected-path preparation signature is claimed by this packet.

## Signature

| Decision | Question | Answer | When and where | Recorded by |
| --- | --- | --- | --- | --- |
| Pending | Pending exact-diff review | Pending | Pending | Author agent |

Rollback: revert the change through review. Bound runs must never fall back to an unbound workspace during a mixed-version upgrade or rollback.

## Required links

[Basis](basis.md), [plan](plan.md), [risk](risk.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Author evidence, independent different-vendor checker, green required checks, answered review threads and Ben's recorded acceptance precede merge.

## Source-lineage note

Local engineering evidence under the repository workflow. [Workflow source map](https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md)
