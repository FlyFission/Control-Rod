# Trace: Phase 0 scaffold

**Purpose:** Tie each claim to its basis, control, evidence and merge stance.

**Change slug:** `phase-0-scaffold`
**Owner:** Ben Huffer
**Date:** 2026-10-22

---

## Change context

- **Slug:** `phase-0-scaffold`
- **Related records:** `basis.md`, `verification.md`
- **Owner:** Ben Huffer
- **Date:** 2026-10-22
- **Requirements cross-reference:** `docs/sqa/requirements.sdoc`

## Trace summary

| ID | Claim | Basis link | Control / design feature | Verification evidence | Ship posture | Status |
|---|---|---|---|---|---|---|
| C-001 | Work packages that break the contract are refused, including unknown fields at any depth. | `basis.md#derived-requirements-or-claims`; REQ-API-001; RT-015 | Ajv2020 strict validation against closed generated schemas | E-001 | Merge | pass |
| C-002 | Rust, Go and Python give the same canonical digest. | `basis.md#derived-requirements-or-claims`; REQ-KRN-001 to 004 | RFC 8785 plus SHA-256 and one shared profile in each language | E-002 | Merge | pass |
| C-003 | Numbers outside safe integers are refused by all three digests, and fractions by the API. | REQ-KRN-005; REQ-KRN-006; RT-002 | Decimal-string `Quantity`; float checks with JSON pointer | E-001, E-002 | Merge | pass |
| C-004 | The kernel decision type refuses by default. | `basis.md#protected-outcomes` | `Decision::undecided()` denies; crate-private `allow` | E-003 | Merge | pass |
| C-005 | Shipped dependencies carry permissive licenses only. | ADR 0002 | Three license gates | E-004 | Merge | pass |
| C-006 | Generated contracts match the TypeSpec source. | ADR 0005 | CI regenerate-and-diff | E-005 | Merge | pass |
| C-007 | All checks run on every pull request on GitHub. | `basis.md#assumptions-constraints-and-invalidation-triggers` | `.github/workflows/ci.yml` | E-005 | Merge | pass |
| C-008 | Twenty-three pending red-team cases are enforced. | `tests/redteam/catalog.yaml` | Components in later phases | none yet | Do not claim | deferred |

## Evidence chain

```text
Risk: records and digests set patterns every later phase inherits.
  -> Basis: refuse bad records, agree on digests, no floats, refuse by default, permissive licenses.
  -> Control: closed schemas + Ajv; RFC 8785 in three languages; fail-closed Decision; three license gates.
  -> Verification: 7 API tests, 6 kernel tests, Go and Python digest tests, gate output; all 7 CI jobs green on GitHub.
  -> Ship: merge once the owner approves.
```

## Open trace gaps

| Gap | Why it matters | Disposition |
|---|---|---|
| No TypeScript digest yet | The control plane will need to digest records. | Deferred to Phase 1; it must pass the same vector file. |
| Digest error kind differs past depth 128 | Rust's parser stops at depth 128 and reports invalid JSON; Python and Go report the depth error. All three refuse. | Accepted; validity agrees. |
| Twenty-three red-team cases pending | Their components do not exist yet. | Each activates with its component. |
| Contract profile not yet enforced by CI | Generated types in Go, Rust and Python accepted records the schema refuses; the current contracts avoid the risky types, but nothing stops a future edit. | Phase 1 adds a CI check for the profile in ADR 0005 and validation before every typed decode (RT-024). |

## Required links

- `basis.md`, `verification.md`, `ship.md`
- `docs/sqa/requirements.sdoc`, `tests/redteam/catalog.yaml`

## Exit criteria

- Every claim has a status.
- Deferred and planned claims are not used as merge evidence until they pass.

## Source-lineage note

Trace structure follows nuclear-grade context engineering; public source map at https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. No compliance claim is made.
