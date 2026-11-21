# packs/software

Software mode domain pack: shared author, tool, and pre-check briefs, shared templates and typicals, and depth-2 intake playbooks for bugfixes, features, and migrations.

## Layout

- `roles/` — shared software roles resolved by `findRoleIn`, `roleToolText`, and `preCheckRole`:
  - `software-author.md`: author brief for software packages (resolves `packDir` to `packs/software`).
  - `software-author.tools.md`: qualified tools for software authoring (read, write, edit, search, and scoped test/build commands; no network line by default so packages stay admissible across restricted lanes and all runtimes).
  - `software-pre-check.md`: family pre-check brief (`software-*` resolves to `software-pre-check`) enforcing independent verification against acceptance criteria and deterministic test/build evidence without modifying deliverables.
- `templates/` — markdown templates (`bugfix-report.md`, `feature-spec-and-summary.md`, `migration-plan.md`) shipped by `packFiles(findRoleIn(cfg, "software-author")!.packDir)` under `inputs/pack/templates/`.
- `typicals/` — structured JSON checklists (`bugfix-checklist.json`, `feature-checklist.json`, `migration-checklist.json`) shipped by `packFiles(findRoleIn(cfg, "software-author")!.packDir)` under `inputs/pack/typicals/`.
- `bugfix/roles/intake.md`, `feature/roles/intake.md`, `migration/roles/intake.md` — playbook guidance placed at depth 2 (`packs/software/<playbook>/roles/intake.md`) so `jobIntakeGuides()` discovers and includes all three automatically during intake runs.

## Conventions

- Shared templates and typicals live directly under `packs/software/templates/` and `packs/software/typicals/` because `buildJob()` passes `findRoleIn(cfg, "software-author")!.packDir` (`packs/software`) to `packFiles()`.
- Playbook intake guides live at depth 2 (`packs/software/<playbook>/roles/intake.md`) because `jobIntakeGuides()` scans `packs/<mode>/<job>/roles/intake.md`.
- Templates and typicals contain structure and placeholders only—never hardcoded engineering thresholds, synthetic counts, or unverified claims.
- All files are regular files (no symlinks) kept well within `packFiles` per-file and total size limits.
