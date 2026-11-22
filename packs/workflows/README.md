# Workflow packs

A package runs one workflow: the plain playbook (no pack), or one of these. A workflow sets how the work is sequenced; the context profile (Light or Nuclear) sets how much evidence and decision discipline a run carries. The two are separate choices, and workflows never stack. Background and the stage maps: [docs/patterns/skill-workflows.md](../../docs/patterns/skill-workflows.md); a thank-you to the authors: [docs/patterns/ode-to-two-workflows.md](../../docs/patterns/ode-to-two-workflows.md).

| Pack | Author | Upstream | License |
|---|---|---|---|
| `superpowers/` | Jesse Vincent | https://github.com/obra/superpowers | MIT (`superpowers/LICENSE`) |
| `pocock/` | Matt Pocock | https://github.com/mattpocock/skills | MIT (`pocock/LICENSE`) |
| `pocock-superpowers/` | the hybrid of the two | references the two packs; holds no copies | as above |

## What is generated and what is ours

- **Generated, never hand-edited:** each pack's `reference/` (the upstream skill folders, Markdown only, byte for byte), its `LICENSE`, and `manifest.json` (the upstream commit and a sha256 for every generated file). `scripts/generate-workflow-packs.mjs` writes them from a pinned checkout; `--check` fails on any hand edit.
- **Not shipped:** a skill `pins.json` excludes, with its reason, recorded again in the manifest's `excluded`. Today that is Superpowers' `writing-skills` (it reproduces Anthropic documentation not under the MIT licence) and Pocock's `pr` (it reproduces part of humanlayer/humanlayer, Apache-2.0). Neither is used by any stage.
- **Locked:** `lock.json` holds the digest of every manifest, `workflow.json` and stage card; the API refuses a pack whose files differ from it. After editing a card or map, run `node scripts/generate-workflow-packs.mjs --lock` and commit the change with it.
- **Ours, reviewed like policy:** `workflow.json` (which upstream skills each stage ships) and `stages/<role>.md` (the card that goes into the intake, author or pre-check brief), and `budgets.json` (measured brief sizes).

At run time the composer puts the stage's card in the brief and ships the skills the stage names as `inputs/workflow/<pack>/<skill>/...`, after checking each file against the manifest.

## Keeping pace with upstream

`scripts/sync-workflow-packs.mjs` moves a pack to a newer upstream commit, regenerates it, and writes a report of skills added, changed, renamed or removed, and of stage skills that no longer resolve. A person reads that report and the diff before the bump merges. Run it about every two weeks.
