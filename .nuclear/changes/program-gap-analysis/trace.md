# Trace: program gap analysis

| ID | Requirement | Evidence | Disposition |
|---|---|---|---|
| A-1 | Every Control Rod capability claim in the analysis is checked against code on `main`, not against a plan. | Section 1 method; file and route names in sections 3 to 5 | done |
| A-2 | Every competitor claim carries a dated source and is labeled a vendor claim. | Section 2 source column; section 4 preamble; section 9 | done |
| A-3 | The SWOT, capability matrix, ranked end-user gaps and program gaps are present, and each gap names what to build and the trust constraint it keeps. | Sections 3 to 6 | done |
| A-4 | Features the field has that Control Rod should keep refusing are listed with reasons. | Section 7 | done |
| A-5 | The roadmap respects the slice rule and names the owner decisions it needs. | Section 8 | done |
| A-6 | The command inventory is regenerated and `--check` is clean; the status page no longer lists it as behind. | E-02 | done |
| A-7 | The owner has read the analysis and answered or deferred its decisions. | E-03 | open |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The analysis document is complete, the sources it rests on are cited with their dates, the owner has read it and answered or deferred its four requested decisions. No product code is part of this change beyond the command inventory regeneration and the status page; no claim is made about any competitor beyond what its public README or the cited research said on the date given.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
