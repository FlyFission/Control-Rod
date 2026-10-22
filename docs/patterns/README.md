# Pattern notes

A pattern file records ideas Control Rod may borrow from another project: what the other project does, why it matters, how it would look in Control Rod, and whether we adopt, adapt, skip or already have it. Pattern files are design input. They hold no code.

## The clean-room rule

Some projects we learn from use licenses our shipped code cannot take in (AGENTS rule 4). For those, we keep two roles apart:

- **Readers** study the other project's public documentation and its behaviour when run, and write notes in their own words. No code, configuration, schemas or copied sentences; a short quoted phrase only for a UI label or feature name. Readers do not open the project's source code.
- **Builders** write Control Rod's docs, specs and code from the notes only, and never open the other project's documentation or source.

Before a pattern file merges, someone who did not write it checks it against the source documentation for copied wording, and the result goes in the change record. Raw notes and screenshots stay out of the repository.

Each pattern file starts with a provenance header: the source, its license, the date, and the statement that it carries ideas only.

## Files

- `kandev.md`: Kandev, an open workbench for coding agents (AGPL-3.0). Decision: ADR 0019.
