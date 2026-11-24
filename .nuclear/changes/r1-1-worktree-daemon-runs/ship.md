# Ship: worktree daemon binding

Release decision: **authorized for the diff at head `372b80bf`** by the owner's recorded yes in the Signature table, including the linked-worktrees-only behaviour change it names. The independent different-vendor checker verdict was not run on this diff; that residual risk is accepted by the same yes. [Verification](verification.md) records the author checks, the overseer's macOS suite results and the [fix round](verification.md#fix-round).

## Behaviour change for Ben to confirm

A bound checkout must now be a linked worktree (`<root>/.worktrees/<repo>/<branch>`). The API refuses the base clone and fresh clones (`<root>/<repo>`, `<root>/<repo>-<branch>`) with `checkout-not-linked-worktree`, and the daemon refuses any checkout whose Git directory sits inside it. Those clones keep `.git` inside the writable checkout, so hooks and config would be writable by the agent. The alternative, keeping `.git` read-only in the sandbox, depends on Claude and Codex sandbox options that were not tested here. Confirm that linked worktrees only is acceptable.

Other changes a reviewer should know: the daemon enforces its own home-folder and protected-location rule; the run directory in the checkout is removed after the run (it is not git-excluded, because that would write shared Git administration); custody locks live in the daemon home, so they exclude runs within one daemon home only; and an uncontained run keeps custody until the daemon exits.

Additive TypeSpec contracts and generated artifacts require owner CODEOWNERS review at merge. No protected-path preparation signature is claimed by this packet.

## Signature

| Decision | Question | Answer | When and where | Recorded by |
| --- | --- | --- | --- | --- |
| Approved: merge at head `372b80bf` once CI is green | "Do you approve merging #135 at head 372b80bf (additive spec/api.tsp, spec/records.tsp and generated contracts, daemon checkout custody, New Work workspace binding), and confirm that bound checkouts being linked worktrees only is acceptable?" | "Yes" (2026-11-24 sign-off form) | 2026-11-24, Claude Code session sign-off form | The implementing agent, from the sign-off form answer. Ben Huffer did not type this entry, and no signature or initials were typed for him. |

Rollback: revert the change through review. Monitoring: the board shows a bound run's checkout hold in plain words whenever the daemon that asked cannot take custody, and a bound run never starts on an unbound workspace — watch the hold queue after any daemon or API version mix, and treat a bound run that started without a recorded checkout as a bug.

## Required links

[Basis](basis.md), [plan](plan.md), [risk](risk.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Author evidence, independent different-vendor checker, green required checks, answered review threads and Ben's recorded acceptance precede merge.

## Source-lineage note

Local engineering evidence under the repository workflow. [Workflow source map](https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md)
