# ADR 0023: Cast each role from a signed sheet, earned by scripted trials

- Status: Proposed (awaiting owner review)
- Date: 2026-11-16
- Amends: the multi-provider design plan's non-goal "an editable strengths matrix, and any learning loop", if the owner accepts the reading in decision C-1

## Context
Control Rod runs a handful of agent CLIs, each able to launch several models. Today the author runtime is pinned per role and the checker is picked by a fixed order (`pickChecker`: codex, claude, fake). The owner wants the best available model for each job, with separate job sets for Software and Capital Projects modes. Models differ by duty: originating, checking, refuting, driving tools such as CAD and solvers, extracting from documents, planning, summarizing.

The multi-provider plan cut an editable strengths matrix and any learning loop, because a live, self-adjusting choice of checker invites shopping for a pass and cannot be audited.

## Decision
1. Each pack has a catalog of roles; each role has one **duty** and a domain agent spec (instructions, tools, rules, inputs, outputs, sandbox profile, lane floor).
2. A passkey-signed, versioned **casting sheet** per pack lists, per role, grade and lane, an ordered list of candidates (harness, model, effort, tier). The control plane takes the first candidate that passes admission, provider separation, tier and budget. Version zero reproduces today's choices.
3. A candidate earns its place through **role trials**: frozen, owner-held task sets run through the daemon as production runs are, scored only by scripts with recorded inputs, outputs and digests.
4. Nothing changes a cast except a newly signed sheet. Trial and production results are reported; they are never applied automatically.
5. Specialists compose between runs in the control plane, never as subagents inside a counted run.

## Conditions
- Casting is a preference. Provider separation and tier floors stay kernel rules on attested facts; a sheet cannot override them.
- A run whose observed models differ from its cast cannot count as a check.
- No score is typed by a model (AGENTS rule 5). The record format rejects a score without a scoring script digest.
- Capital Projects trial items and reference results come from a qualified domain owner.
- New duty-based separation rules are kernel and policy changes and need the owner's signature.

## Alternatives considered
- **Keep the fixed order and pin by hand.** Simple, but extends badly past two harnesses and rests on no evidence.
- **A learned router that picks per task.** Rejected: unauditable, invites pass shopping, and conflicts with sticky fails.
- **Public benchmark scores.** Rejected as the basis: they measure other tasks, may be in training data, and come from vendors.
- **Adopt an outside agent specification.** Deferred: our ontology already holds the parts; license and fit unchecked.

## Consequences
- Easier: adding a harness or model becomes a trial plus a signed diff, not a code change. Each desk can say why it holds its model.
- Harder: trial sets must be built and kept private and fresh; Capital Projects trials need domain owners.
- Given up: any automatic improvement between signed sheets.

## Evidence
Design: `docs/superpowers/specs/2026-11-16-role-casting-design.md`. Today's behavior: `services/api/src/work.ts` (`pickChecker`), `services/api/src/runtimes.ts` (pins per role), `spec/records.tsp` (`AgentRole`, `AgentBaseline`), `spec/workbench.tsp` (`RuntimePin`). Pattern note: `docs/patterns/standard-agents.md`.
