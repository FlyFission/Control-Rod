# Risk

## Selected mode

- **Mode:** Standard
- Decision owner is the repository maintainer. The eligibility check in `kernel/src/transition.rs` touches a trust surface.
- Test tenant isolation through the API and keep internal chain integrity checks intact. Test run stops and event ordering under the existing runner limits.
- Apply dependency provenance changes on upgrade and fresh install. Historic classified edges whose provenance was overwritten need their own source evidence for recovery.
- Reject unknown runtime identity without weakening the existing owner-override floor for known runtimes.

## Required links

[Basis](basis.md), [plan](plan.md), [risk](risk.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Implement and test the confirmed fixes, disclose platform and upgrade limits, and obtain the required owner decision before merge.

## Source-lineage note

Local engineering evidence under the repository workflow. [Workflow source map](https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md)
