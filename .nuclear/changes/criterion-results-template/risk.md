# Risk: Checkers get a filled-in criterion results file to complete

- **Validation unchanged.** The server still checks the submission against the schema, the released basis, finding ids and retained evidence. A checker that leaves the template untouched submits "open" outcomes, which cannot pass.
- **No trust surface is touched.** Brief wording and one extra input file only.

## Selected mode

- **Mode:** Standard
- Basis: reversible by revert; no kernel, policy, spec or workflow change.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Every prepared pre-check receives inputs/criterion-results.template.json, which is schema-valid and lists the exact package, revision, manifest digest and every current criterion and mapped check, and the brief tells the checker to copy and fill it. The server's validation is unchanged. API tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
