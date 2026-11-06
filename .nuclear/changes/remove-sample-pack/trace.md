# Trace: remove the example-package pack and its examples

| Requirement | Change | Tests and checks | Disposition |
|---|---|---|---|
| RS-01 The example-package pack, the drawings pack, the CAD conformance tests and their two change records are gone; ADR 0018 is withdrawn, not deleted. | `packs/capital-projects/`, `tests/conformance/cad/`, `.nuclear/changes/mvp-example-package/`, `.nuclear/changes/drawing-engine-drawing tool/` removed; `docs/adr/0018-drawing-engine-drawing tool.md` stripped to status and summary | `evidence/removed-files.txt` (60 files) | implemented |
| RS-02 Nothing that used them breaks. | `scripts/cr.mjs`; `services/api/src/work.ts` tool lists; `daemon/internal/runner/runtime.go` `DefaultClaudeTools`; `apps/web/src/lib/decide.ts` and its two callers; API tests on a fixture pack (`services/api/test/fixtures/packs/`, `rootWithFixturePacks` in `harness.ts`); `tests/e2e/fake/*.sh` | web, API, Go and Python suites (verification E-01 to E-05) | implemented and tested |
| RS-03 No tracked file outside evidence logs names the removed subject or its business; examples are neutral engineering work. | App placeholder and attach button, web and API tests and fixtures, daemon test data, general role briefs, README, docs, ADR 0019, specs, plans and historical records | `evidence/grep-after.txt` | implemented; only the withdrawn ADR 0018 and this record's own slug remain |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

RS-01 to RS-03 are met: the packs and records are gone, nothing that used them breaks, no tracked file outside evidence logs names the removed subject, and the full suites pass on the merged tree.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
