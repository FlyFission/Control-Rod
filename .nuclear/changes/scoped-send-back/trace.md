# Trace: scoped send-back after a failed check

| Requirement | Code | Tests | Disposition |
|---|---|---|---|
| SB-01 A finding may carry evidence, a location and the files a fix may change. | `Finding`, `FindingLocation`, `FindingPath` in `spec/records.tsp`; regenerated `spec/generated` and `daemon/internal/wire/schemas` | `scoped-send-back.test.ts` "keeps a finding's evidence, location and scope, and drops unsafe paths" | implemented and tested |
| SB-02 Unsafe paths (absolute, `..`, empty segments, backslash, control characters) are dropped, not stored. The schema pattern has no lookaheads, so the daemon's Go validator compiles it. | `findingPath` and `findingDetail` in `services/api/src/work.ts`; `FindingPath` in `spec/records.tsp` | same test: `../etc/passwd`, `/abs.md`, `a\b.md`, `a//b.md` and a `../x` location are dropped; `daemon/internal/wire/decode_test.go` | implemented and tested |
| SB-03 The checker is asked for the three fields. | `packs/general/roles/pre-check.md`, `packs/software/roles/software-pre-check.md` | not tested: role text only | implemented |
| SB-04 The author's next round is told to change only the scope files. | "Scope of this fix" section in the author job (`run.round > 1` branch) | "tells the author the scope..." checks BRIEF.md | implemented and tested |
| SB-05 Files changed outside the scope are reported: an event, the package view, and the next checker's inputs. | `scopeDrift`, `changedPaths`, `outsideScope`; `finishAuthor` appends `package.scope-drift`; `packageView` sets `scope_drift`; the pre-check job adds `scope-drift.json` and a brief section | same test; unit cases for the helpers | implemented and tested |
| SB-06 Drift shows on the card and the package page. Findings show their detail on the card, the package page and the case view. | `FindingDetail`, `ScopeDriftNote` in `apps/web/src/components/FindingDetail.tsx`; `BoardReviewDrawer`, `PackagePage`, `CasePage` | `finding-detail.test.tsx` | implemented and tested in jsdom |
| SB-07 The dispute item says three failed rounds usually mean the plan needs another look. | dispute `detail` text in `services/api/src/work.ts` | not tested: copy only | implemented |
| SB-08 The inbox change digest names drift in words. | `CHANGE_TYPES` in `services/api/src/inbox.ts` | not tested | implemented |

No kernel source file, policy, red-team fixture or workflow was edited. The spec change is additive inside API 0.1: optional fields on `Finding`, new `FindingLocation`, `FindingPath` and `ScopeDrift` models, and an optional `scope_drift` on `PackageView`. The decision subject digest does not include `scope_drift`.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

As in [basis](basis.md#exit-criteria).

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
