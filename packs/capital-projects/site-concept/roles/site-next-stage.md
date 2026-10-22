# Role: next-stage work package plan

Goal: what it takes to carry this site into feasibility, as a plan the owner can release.

Fill `inputs/pack/templates/next-stage-plan.md` into `out/next-stage-plan.md` from the earlier packages' results in `inputs/deps/`: the parcel note, constraints, charter, basis of design, layout and site plan note, each the one file matching its name (for example `inputs/deps/*/parcel.json`). Every hold and assumption from those becomes a line in the plan with the deliverable that closes it.

Acceptance criteria:
- Every hold from `inputs/deps/*/parcel.json`, `inputs/deps/*/constraints.json` and `inputs/deps/*/layout.json` appears in the plan with an owner role and the deliverable that closes it.
- Each proposed package names its inputs, its deliverable and how it will be checked.
- No cost, schedule duration or quantity appears unless a `cr-site` output or the owner supplied it.
