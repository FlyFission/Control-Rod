Static review of `b712425` against `origin/buildout/controlled-preparation-20261023...HEAD`. No files modified or tests executed.

**Closed for their reported paths: P5-01–P5-30, including P5-02, P5-28 and P5-29.** P5-30’s fix is connected throughout:

- `MarkingOverride.covered_configured` retains coverage (`spec/tenancy.tsp:378`).
- `configuredClosure` traverses configured sources and package ancestors; `configuredStillCovered` rejects missing, newly added or raised classifications (`services/api/src/markings.ts:125`, `:139`).
- Approval records that coverage and refuses unclassified sources (`services/api/src/admin.ts:499`).
- `provenanceLane` checks coverage before honoring an override; failed coverage restores recursive source admission (`services/api/src/work.ts:207`).

No remaining or newly introduced High/Critical defect found in tasks 1.7–1.14. No P5-31 finding assigned.

| ID | Severity | Finding | Evidence (file:line) | Fix |
|---|---|---|---|---|

MERGE