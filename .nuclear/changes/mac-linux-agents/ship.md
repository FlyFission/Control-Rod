# Ship: agent runs on macOS and native Linux

Release decision: **draft pull request for a maintainer's signature; no merge or release is authorized by this record.**

- **Proposed:** merge the platform change, the `platforms` workflow and this record to `main` once a maintainer who did not author the change has reviewed and signed.
- **Not claimed:** a live-login check on macOS or native Linux; that the whole app starts on macOS; checker launches qualified on any platform; an independent signature.
- **Decisions requested from the maintainers:**
  1. Who signs (see risk R-05).
  2. Whether a live-login check on a real Mac and a real Ubuntu machine is required before launch, or can follow it.
  3. Whether the Seatbelt checker tests in CI are enough to drop the `CONTROLROD_SEATBELT_QUALIFIED` gate, which this change removes. The gate was a control in `checker-workspace` (risk R-10) for a profile never run on a Mac; it now runs on one in every `platforms` run.

## Signature

| Field | Entry |
|---|---|
| Decision | not yet signed: approve, approve with changes, or reject |
| Signed by | not yet signed: a maintainer other than the person who prompted the agent |
| Date | not yet signed |
| Basis | not yet signed: the PR review that approves `platforms.yml` and the platform change |

Until the Signature table is filled by that maintainer, this change is an unsigned proposal.

## Rollback and monitoring

Rollback: revert the PR. Monitoring: any `platforms` run where a `*_holds_every_boundary` check is false, and any user report of an agent reaching a file outside its workspace on macOS or Linux.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

ML-01 to ML-07 are implemented with CI and local evidence reported as it ran; the signature for the new `platforms` workflow is left for a maintainer. Nothing here is presented as signed.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
