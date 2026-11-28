# Working in this repository

The short brief for any agent or person here. Details live in the files it points to; load them when needed.

## Rules

1. Start from a change record under `.nuclear/changes/<slug>/`; read it and the files it names first.
2. Never edit a trust surface without a human signature. Trust surfaces are the paths in `.github/CODEOWNERS`, listed with the sign-off rules in [docs/collaboration.md](docs/collaboration.md#who-reviews-what).
3. Contracts in `spec/` are the source of truth. Regenerate; never hand-edit generated code.
4. Shipped code uses permissive licenses only. Do not copy code from AGPL, GPL, SSPL, BSL, Elastic or source-available projects; port ideas from pattern notes instead.
5. No engineering number is typed by a model. Values come from scripts or tools with recorded inputs, outputs and digests.
6. Keep context lean. Read by section and ID; do not paste whole documents.

## Where things are

- Decisions: `docs/adr/`
- Threat model: `docs/threat-model.md`
- Visual references and the visual bar: `design/references/` (read before any visual change)
- Quality assurance: `docs/sqa/`
- Plan and architecture: linked from `docs/README.md`
