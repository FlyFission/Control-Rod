# Ship: First-run setup and the Agents roster

Release decision: **the owner's yes for the `spec/` change is recorded (see Signature), and the owner asked for the open pull requests to be landed (2026-11-23); no release is authorized by this record.** Landed from the landing thread's branch, which carries this pull request's commits unchanged plus this record.

- Rollback: revert the merge. The `agent_setup` settings key can stay; nothing else reads it. No migration.
- Merge order: land #137 first (Codex 0.171.0 qualification). This PR touches `Shell.tsx` in two lines that #137 and #153 also edit nearby; expect a trivial rebase.
- Monitoring after merge: on a fresh install, the app opens on Setup, and the Agents roster rows match the daemon's startup log line for each runtime. A benched agent must receive no new claim. Re-run intake on any card that failed with "Completion refused (invalid)".
- After merge: on a fresh install, the app opens on Setup. Re-run intake on any card that failed with "Completion refused (invalid)".

## Signature

| Field | Entry |
|---|---|
| Decision | **Yes.** The owner approved #154's `spec/` change for merge: GET/PUT /setup, PUT /setup/seats/{runtime} and their new models; no existing field changes. Recorded by the agent (Claude, landing thread); not the owner's signature. |
| Question | "Approve the spec/ contract change in #154 so it can merge?", on a decision card in the Control Rod project thread "Land the open PRs onto main", whose first option read: "I record your yes in #154's ship.md Signature table. It only adds GET/PUT /setup, PUT /setup/seats/{runtime} and new models; no existing field changes." |
| Answer | "Yes, approve #154's spec change" (the owner's own pick on the card) |
| When and where | 2026-11-23 19:08:15 UTC, Control Rod project thread "Land the open PRs onto main" |
| Head when asked | #154 at `ef40eab`. Later `spec/` edits stay inside the new models: a doc comment on `AgentSetupRequest.seats`, and `AgentSetupRequest.check_in` made optional. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A first run opens on Setup; the person confirms seats and one check-in answer before anything is saved; the Agents roster shows one switch per runnable agent and says in plain words why an agent cannot work, from the same probes as Provider CLIs; a benched agent is never offered work; the intake brief names every field the WorkPackage contract requires. API and web tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
