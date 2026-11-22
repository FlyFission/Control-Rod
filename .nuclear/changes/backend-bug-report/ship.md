# Ship

Release decision is owner review pending. Preparing the kernel change was authorized in chat. Approval to merge the exact protected diff is pending under `docs/collaboration.md`.

Rollback is to revert the code and rebuild the WebAssembly kernel. For an installed database, follow the migration preservation checks before restoring the prior trigger definition.

Monitoring should cover cross-organization refusals, completions held as uncontained, recorded event gaps, and checker acceptance on macOS.

## Verification limits

- The installed-Codex qualification test fails on the audited baseline and on this branch. The focused daemon race tests and the Darwin arm64 cross-build passed. Live macOS sandbox and Keychain execution remain open.
- Migration 025 preserves surviving classification provenance. Recovering already deleted dependency edges requires external evidence of their classification.
- Tenant event responses retain installation-wide chain sequence identifiers, so gaps can show intervening activity. Legacy capture and run creation still relies on a single active organization.

## Required links

[Basis](basis.md), [plan](plan.md), [risk](risk.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Implement and test the confirmed fixes, disclose platform and upgrade limits, and obtain the required owner decision before merge.

## Source-lineage note

Local engineering evidence under the repository workflow. [Workflow source map](https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md)
