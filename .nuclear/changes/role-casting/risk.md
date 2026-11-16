# Risk: role casting design spec

- **Mode:** Standard
- Execution owner: Claude Code under the owner's 2026-11-16 request to plan per-role model selection.
- Decision owner: Ben Huffer. No protected surface is touched by this record. The later build touches protected surfaces (kernel separation rules by duty, signed policy) in milestone C6 only, under its own record and the owner's signature.
- Scope: the spec, ADR 0023 (Proposed), the pattern note, two index lines, and this packet.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | Casting becomes a way to shop for a passing checker. | Sheet is static and signed; sticky fails and quorum unchanged; trial and production results are reported, never applied (spec sections 2, 9). | Any design or slice that changes a cast without a newly signed sheet. |
| R-02 | Casting overrides provider separation or the tier floor. | Separation and tier stay kernel rules on attested facts; the sheet is a preference walked after admission and separation (spec sections 8, 11). | A slice where a sheet entry can admit a checker the kernel would refuse. |
| R-03 | A model types a trial score, or a hypothesis is presented as a finding. | Scores only from scoring scripts with digests (rule 5); spec sections 6 and 7 label every model suggestion as a hypothesis; section 16 not claimed. | A trial result without a scoring script digest, or copy that says a model is best at a duty without a cited trial. |
| R-04 | Capital Projects roles choose engineering methods, tolerances or numbers. | Spec principle 3 and section 7: tools make numbers; methods, tolerances and references from a qualified domain owner; roles wait on DN-01 to DN-06. | A slice that ships a Capital Projects role before its prerequisites or with a model-supplied tolerance. |
| R-05 | Composition reintroduces subagents inside counted runs. | Spec section 10: consults are separate runs queued by the control plane. | A slice that lets an agent start another model inside its run. |
| R-06 | Ideas or text from an outside specification enter the repository under an unchecked license. | Pattern note carries ideas only, notes the license is unchecked, and routes any adoption through the register and clean-room rule. | Copied text or schema from standardagentspec.org. |
| R-07 | The design is unsound in ways a self-check misses. | Verification states this is a self-check by the authoring agent; ship asks the owner whether to run cross-vendor review before approval, as the earlier plans did. | Approval on a claim that the spec was independently reviewed. |

## Selected mode

- **Mode:** Standard
- Basis: documentation only, but the design governs which models may do what, an agent-authority concern.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The design spec, ADR 0023 (Proposed) and the pattern note are complete, and the owner has reviewed them. No product code is part of this change; role casting is designed, not implemented, and no behavior claim is made here beyond what the spec states.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
