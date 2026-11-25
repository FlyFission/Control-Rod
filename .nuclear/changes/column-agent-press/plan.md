# Plan: Pick a column's agent with a press, and let one agent check its own vendor's work

1. Reproduce: on the owner's Mac the picker asks for a passkey (`applyProjectChange`), and `pickChecker` never returns the author's runtime while another is offered.
2. Server: press-or-sign for agent-only patches; policy-backed same-agent check. Web: picker lists runnable agents, no forced swap, no passkey for agent picks.
3. API test (admin, signing-policy) and web test first, then the fix; both typechecks.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Changing the agent at the top of a board column saves with one press and no passkey, and offers every agent Control Rod can run (Claude, Codex, Antigravity, Grok); every other project setting still asks for the passkey. Where the owner picked the author's own agent to check, under a signed policy that takes cards through on its own and outside high-consequence work, the dispatcher honours the pick and the kernel receives that policy as the owner's override; the verification record says the runtime was shared and the pre-check event names the policy. API and web tests and both typechecks pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
