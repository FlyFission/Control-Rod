# Pattern notes: domain-specific agents (Standard Agents talk)

> **Provenance.** Written on 2026-11-16 from public coverage of the talk "The Future Is Domain-Specific Agents" by Justin Schroeder (Standard Agents), AI Engineer World's Fair 2026, video at https://www.youtube.com/watch?v=wIPr9GmLRaQ, with talk pages at ai.engineer. The video itself could not be retrieved from this environment; the notes come from the talk's public listing and press coverage, written in our own words. The talk mentions an open agent specification at standardagentspec.org; its license was not checked and none of its text, schemas or code was read or copied. This file carries ideas only. If the specification is ever considered as a dependency or source, its license goes through the register and the clean-room rule first (`docs/patterns/README.md`, AGENTS rule 4).

## The ideas

| # | The talk's idea (our words) | Our version | Fit |
|---|---|---|---|
| S1 | Many narrow agents beat one general agent carrying many skills: a mail agent beats a mail skill. | A **domain agent** per role, each with its own instructions, tools, rules, inputs, outputs and sandbox ([role casting spec](../superpowers/specs/2026-11-16-role-casting-design.md), section 4). | Adapt |
| S2 | The harness is the unit to specify: model, system prompt, tools, sub agents, rules, hooks, effects, thread. | Our `AgentRole` and `AgentBaseline` already hold most of this. We add `duty` and a trial set, keep hooks to Control Rod-owned ones, and leave "thread" out: our runs are one-shot against a frozen revision (ADR 0020). | Adapt |
| S3 | Agents compose recursively: a specialist consults another specialist. | Composition between runs, in the control plane: flows, and consult nodes that are separate print-mode runs queued from a signed flow, never a subagent inside a counted run. A checker is separate from every node whose output reached what it checks (spec section 10). | Adapt |
| S4 | Defining the task tightly ahead of time saves tokens. The talk reports a large saving; coverage gives no baseline, so we do not repeat the figure. | Our packages, criteria and role briefs already define the task ahead of the run; role trials (spec section 9) will show our own usage per cast where the CLI reports it, as usage, not as a score. | Already have, measure it |
| S5 | A shared runtime and specification across vendors. | Our adapter seam is the shared runtime for CLIs we qualify. We do not adopt an outside specification. | Skip for now |

## What we leave

- Any agent choosing or spawning another agent's model at run time.
- Long-lived threads that carry context across tasks; they defeat transcript isolation (multi-provider plan, private home section).
- Vendor-neutral claims we cannot check: we claim provider separation only.
