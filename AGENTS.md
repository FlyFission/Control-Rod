# Working in this repository

This file is the short brief for any agent or person working here. Details live in the files it points to; load them when the task needs them.

## Rules

1. Start from a change record. Every change has one under `.nuclear/changes/<slug>/`; read it and the files it names before touching anything else.
2. Never edit trust surfaces without a human signature: `policies/`, `tests/redteam/`, `.github/workflows/`, `spec/` major versions, and kernel decision functions in `kernel/`.
3. Contracts in `spec/` are the source of truth. Regenerate; never hand-edit generated code.
4. Shipped code uses permissive licenses only. Do not copy code from AGPL, GPL, SSPL, BSL, Elastic or source-available projects; port ideas from pattern notes instead.
5. No engineering number is typed by a model. Values come from scripts or tools with recorded inputs, outputs and digests.
6. Keep context lean. Read by section and ID; do not paste whole documents.

## Where things are

- Decisions: `docs/adr/`
- Threat model: `docs/threat-model.md`
- Software quality assurance: `docs/sqa/`
- The plan and architecture: the Control Rod Platform Plan (linked from `docs/README.md`)
