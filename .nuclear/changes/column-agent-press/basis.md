# Basis: Pick a column's agent with a press, and let one agent check its own vendor's work

**Change slug:** `column-agent-press`
**Owner:** Ben Huffer
**Date:** 2026-11-25
**Status:** Built, for owner review.

## Mission / need

The owner, 2026-11-25: agent choice belongs to the picker at the top of each board column, and cards should finish without him stepping in; "You can probably do it with Haiku and Sonnet agents." Trying exactly that on his Mac hit two root causes:

1. The column picker sends `project.workspace-update`, a passkey-signed command, so every agent pick asks for his passkey. It also offers only Claude and Codex, and silently switches the other column when both match.
2. #219 let a project use one CLI for both jobs, but the dispatcher (`pickChecker`) still sends the check to another vendor whenever one is installed, and the kernel refuses a same-vendor check without a per-run signed override. So "Claude writes, Claude checks" cannot happen without a passkey per card.

## Proposal

1. `project.workspace-update` becomes press-or-sign: a patch that only picks agents (`laneAgents`, `author`, `checker`) is a press; any other key still needs the passkey (refused `signature-required`). The data lane, not the agent pick, decides which agents may see the work (disclosure.ts), so a press cannot widen who reads it.
2. The column picker lists every runnable agent and keeps the pick as made; agent-only changes skip the passkey.
3. `policySameAgentCheck`: where the owner's signed signing policy covers the card and releases on its own, and the card is not high-consequence, an explicitly picked same-agent checker is honoured at claim, and at submission the policy stands as the owner's override (`owner_override_verified`). The kernel is not changed. The record keeps `independence.runtime: "shared"` (shown on the case page) and the `package.pre-checked` event names the policy.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Changing the agent at the top of a board column saves with one press and no passkey, and offers every agent Control Rod can run (Claude, Codex, Antigravity, Grok); every other project setting still asks for the passkey. Where the owner picked the author's own agent to check, under a signed policy that takes cards through on its own and outside high-consequence work, the dispatcher honours the pick and the kernel receives that policy as the owner's override; the verification record says the runtime was shared and the pre-check event names the policy. API and web tests and both typechecks pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
