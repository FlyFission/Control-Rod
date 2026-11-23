# Pattern notes

A pattern file records ideas Control Rod may borrow from another project: what the other project does, why it matters, how it would look in Control Rod, and whether we adopt, adapt, skip or already have it. Pattern files are design input. They hold no code.

## The clean-room rule

Some projects we learn from use licenses our shipped code cannot take in (AGENTS rule 4). For those, we keep two roles apart:

- **Readers** study the other project's public documentation and its behaviour when run, and write notes in their own words. No code, configuration, schemas or copied sentences; a short quoted phrase only for a UI label or feature name. Readers do not open the project's source code.
- **Builders** write Control Rod's docs, specs and code from the notes only, and never open the other project's documentation or source.

Before a pattern file merges, someone who did not write it checks it against the source documentation for copied wording, and the result goes in the change record. Raw notes and screenshots stay out of the repository.

Each pattern file starts with a provenance header: the source, its license, the date, and the statement that it carries ideas only.

## Files

- `headroom.md`: Headroom, a local layer that shrinks what coding agents send to a model (Apache-2.0). Ideas on instruction files written from transcripts, fail-closed release evidence, paired benchmarks and byte-for-byte gateway forwarding; read only part of the repo. Change record: `headroom-patterns`.
- `herdr.md`: herdr, a terminal runtime for coding agents (Apache-2.0). Ideas on background terminals, remote machines, agent state and owning the terminal instead of plugging into the agent; read the README and issue titles only. Decision input for ADR 0024.
- `kandev.md`: Kandev, an open workbench for coding agents (AGPL-3.0). Decision: ADR 0019.
- `openharness.md`: openharness, a multi-agent harness (MIT, with some GPL and AGPL parts). Plan to port a few pinned pieces; see the build plan in the file.
- `plannotator.md`: Plannotator, a review surface for coding agents (MIT OR Apache-2.0). Ideas only: formal lifecycle models, conformance traces, anchored notes, plan approval and test isolation; see the build plan in the file.
- `standard-agents.md`: the case for domain-specific agents, from public coverage of a Standard Agents talk (ideas only; license of its specification unchecked). Feeds the role casting spec and ADR 0023.
- `xerj.md`: XERJ, a local search tool for coding agents that also runs as an MCP server (Apache-2.0). Ideas on CI timeouts, claim-to-run evidence, long-job loops and output sanitization; read only part of the repo. Change record: `xerj-patterns-and-timeout-guard`.
