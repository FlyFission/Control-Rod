# packs/software

Software mode domain pack: shared author, tool, and pre-check briefs plus playbooks for bugfixes, features, and migrations.

## Layout

- `roles/` — shared software roles resolved by `findRoleIn`, `roleToolText`, and `preCheckRole`:
  - `software-author.md`: author brief for software packages.
  - `software-author.tools.md`: qualified tools for software authoring (read, write, edit, search, and scoped test/build commands; no network line by default so packages stay admissible across restricted lanes and all runtimes).
  - `software-pre-check.md`: family pre-check brief (`software-*` resolves to `software-pre-check`) enforcing independent verification against acceptance criteria and deterministic test/build evidence without modifying deliverables.
- `bugfix/` — playbook for defect investigation and fixes (`roles/intake.md`, `templates/`, `typicals/`).
- `feature/` — playbook for scoped feature delivery (`roles/intake.md`, `templates/`, `typicals/`).
- `migration/` — playbook for schema, data, dependency, or platform migrations (`roles/intake.md`, `templates/`, `typicals/`).

## Conventions

- Every playbook directory sits at depth 2 (`packs/software/<playbook>/roles/intake.md`) so `jobIntakeGuides()` includes its intake guidance automatically.
- Templates and typicals contain structure and placeholders only—never hardcoded engineering thresholds, synthetic counts, or unverified claims.
- All files are regular files (no symlinks) kept well within `packFiles` per-file and total size limits.
