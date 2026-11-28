# Working in this repository

The short brief for anyone working here, agent or person. Load the files it points to when the task needs them.

## Rules

1. Start from a change record. Every change has one under `.nuclear/changes/<slug>/`; read it and the files it names first.
2. Never edit trust surfaces without a human signature: `policies/`, `tests/redteam/`, all of `.github/`, `spec/` major versions, kernel decision functions in `kernel/`, and `docs/adr/`. While CODEOWNERS names one maintainer, that maintainer's recorded yes is the signature, on the terms in [docs/collaboration.md](docs/collaboration.md#sole-maintainer-sign-off).
3. Contracts in `spec/` are the source of truth. Regenerate; never hand-edit generated code.
4. Shipped code uses permissive licenses only. Never copy code from AGPL, GPL, SSPL, BSL, Elastic or source-available projects; port ideas from pattern notes.
5. No engineering number is typed by a model. Values come from tools with recorded inputs, outputs and digests.
6. Keep context lean. Read by section and ID; do not paste whole documents.

## Where things are

- Decisions: `docs/adr/`
- Threat model: `docs/threat-model.md`
- Visual references and the visual bar: `design/references/` (read before any visual change)
- Software quality assurance: `docs/sqa/`
- The Platform Plan: owner-held, not in this repo (see `docs/README.md`)
