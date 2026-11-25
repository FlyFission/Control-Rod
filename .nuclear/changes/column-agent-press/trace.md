# Trace: Pick a column's agent with a press, and let one agent check its own vendor's work

| Need | Code | Test |
| --- | --- | --- |
| Agent pick is a press; other settings signed | `services/api/src/admin.ts` project.workspace-update, AGENT_PICK_KEYS | `test/admin.test.ts` "picks a column's agent with a press" |
| Same-agent check under policy | `services/api/src/work.ts` pickChecker, policySameAgentCheck, submit path | `test/signing-policy.test.ts` "lets Claude check Claude's work when the owner picked it" |
| Picker lists every runnable agent, no swap, no passkey | `apps/web/src/features/board/BoardView.tsx`, `api/client.ts` | `features/board/board.test.tsx` "picks a column's agent with one press" |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Changing the agent at the top of a board column saves with one press and no passkey, and offers every agent Control Rod can run (Claude, Codex, Antigravity, Grok); every other project setting still asks for the passkey. Where the owner picked the author's own agent to check, under a signed policy that takes cards through on its own and outside high-consequence work, the dispatcher honours the pick and the kernel receives that policy as the owner's override; the verification record says the runtime was shared and the pre-check event names the policy. API and web tests and both typechecks pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
