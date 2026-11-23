# Pattern notes

A pattern file records ideas Control Rod may borrow from another project: what the other project does, why it matters, how it would look in Control Rod, and whether we adopt, adapt, skip or already have it. Pattern files are design input. They hold no code.

## The clean-room rule

Some projects we learn from use licenses our shipped code cannot take in (AGENTS rule 4). For those, we keep two roles apart:

- **Readers** study the other project's public documentation and its behaviour when run, and write notes in their own words. No code, configuration, schemas or copied sentences; a short quoted phrase only for a UI label or feature name. Readers do not open the project's source code.
- **Builders** write Control Rod's docs, specs and code from the notes only, and never open the other project's documentation or source.

Before a pattern file merges, someone who did not write it checks it against the source documentation for copied wording, and the result goes in the change record. Raw notes and screenshots stay out of the repository.

Each pattern file starts with a provenance header: the source, its license, the date, and the statement that it carries ideas only.

## Files

- `agent-orchestrator.md`: Agent Orchestrator (`OrchestratorInc/agent-orchestrator`), an agent orchestrator and daemon (Apache-2.0, commit `7c65ce3`). Ideas only: 16 patterns (`AO-1`–`AO-16`) covering worktree teardown/recovery, adapter isolation, hidden-ref snapshots, controller-owned PR checks, UI de-slopping, and battle-scar tests mapped to `#118`–`#133` and `M5`–`M8`. Change record: `agent-orchestrator-patterns`.
- `agent-workbenches.md`: Orchestrator.inc (Apache-2.0), Vibe Kanban (Apache-2.0), Paradev (MIT) and the Claude Code desktop app (proprietary; public docs only). How these tools organise a person's attention and the review-to-merge workflow; AW1 to AW4 (tab count, opt-in notifications, `N` to the next card that needs you, the `?` shortcut list) are built in #159. Change record: `agent-workbench-patterns`.
- `headroom.md`: Headroom, a local layer that shrinks what coding agents send to a model (Apache-2.0). Ideas on instruction files written from transcripts, fail-closed release evidence, paired benchmarks and byte-for-byte gateway forwarding; read only part of the repo. Change record: `headroom-patterns`.
- `kandev.md`: Kandev, an open workbench for coding agents (AGPL-3.0). Decision: ADR 0019.
- `openharness.md`: openharness, a multi-agent harness (MIT, with some GPL and AGPL parts). Plan to port a few pinned pieces; see the build plan in the file.
- `plannotator.md`: Plannotator, a review surface for coding agents (MIT OR Apache-2.0). Ideas only: formal lifecycle models, conformance traces, anchored notes, plan approval and test isolation; see the build plan in the file.
- `ode-to-two-workflows.md`: a thank-you to Jesse Vincent and Matt Pocock for Superpowers and their skills, and how Control Rod carries both. Not a pattern file; it holds no design decisions.
- `skill-workflows.md`: Superpowers (obra/superpowers, MIT) and Matt Pocock's skills (MIT) as per-card workflows, one per card and separate from the Nuclear-grade discipline, plus a hybrid built from their stages; stage maps, conflicts with one-shot runs and in-run sub-agents, a biweekly sync plan and a build plan. Change record: `skill-workflow-patterns`.
- `standard-agents.md`: the case for domain-specific agents, from public coverage of a Standard Agents talk (ideas only; license of its specification unchecked). Feeds the role casting spec and ADR 0023.
- `xerj.md`: XERJ, a local search tool for coding agents that also runs as an MCP server (Apache-2.0). Ideas on CI timeouts, claim-to-run evidence, long-job loops and output sanitization; read only part of the repo. Change record: `xerj-patterns-and-timeout-guard`.
