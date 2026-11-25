# Risk: Pick a column's agent with a press, and let one agent check its own vendor's work

- A same-vendor check is less independent than a cross-vendor one. Mitigation: only when the owner explicitly picked it (column or request tag), only under his signed policy that already takes cards through on its own, never for high-consequence work; the record says "shared" and names the policy, and the checker still works blind in a fresh context. Spec note: this is the policy standing in for the per-run independence override, as it already stands in for release and accept.
- An agent pick without a passkey could be made by anyone signed in as an administrator. It changes which installed agent runs; the data lane still bounds which agents may see the work, and the change is an audited event.
- No trust surface is touched (no kernel, policy, spec or workflow change).

## Selected mode

- **Mode:** Standard
- Basis: reversible by revert, no migration, no trust surface.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Changing the agent at the top of a board column saves with one press and no passkey, and offers every agent Control Rod can run (Claude, Codex, Antigravity, Grok); every other project setting still asks for the passkey. Where the owner picked the author's own agent to check, under a signed policy that takes cards through on its own and outside high-consequence work, the dispatcher honours the pick and the kernel receives that policy as the owner's override; the verification record says the runtime was shared and the pre-check event names the policy. API and web tests and both typechecks pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
