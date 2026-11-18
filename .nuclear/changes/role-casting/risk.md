# Risk: role casting design spec

- **Mode:** Standard
- Execution owner: Claude Code under the owner's 2026-11-16 request to plan per-role model selection.
- Decision owner: Ben Huffer. No protected surface is touched by this record. The later build touches protected surfaces (kernel separation rules by duty, signed policy) in milestone C6 only, under its own record and the owner's signature.
- Scope: the spec, ADR 0023 (Proposed), the pattern note, two index lines, and this packet.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | Casting becomes a way to shop for a passing checker. | Sheet is static and signed, and a run uses the version fixed at queue time; sticky fails stay keyed on the deliverable; quorum unchanged; trial and production results are reported, never applied; proposals are script-generated; acceptance and disposition signals never count against a check or refute role; budget and quota hold, never walk (spec sections 2, 8, 9). | Any design or slice that changes a cast without a newly signed sheet, demotes a checker on acceptance or disposition signals, or moves a run down the sheet on quota or budget. |
| R-02 | Casting overrides provider separation, the tier floor, the local-model rule or confirmed review seats. | Separation (by lineage, pairwise) and tier stay kernel rules on attested facts, with tier from the registry, not the sheet; provenance needs positive evidence for every run that feeds a check; review panel seats stay as the person confirmed (spec sections 8, 10, 11). | A slice where a sheet entry can admit a checker the kernel would refuse, or replace a confirmed seat. |
| R-03 | A model types a trial score, or a hypothesis is presented as a finding. | Scores only from scoring scripts with digests (rule 5); spec sections 6 and 7 label every model suggestion as a hypothesis; section 16 not claimed. | A trial result without a scoring script digest, or copy that says a model is best at a duty without a cited trial. |
| R-04 | Capital Projects roles choose engineering methods, tolerances or numbers. | Spec principle 3 and section 7: tools make numbers; methods (including alternates), tolerances, inputs and references from a qualified domain owner; scripts take parameters by reference, with a literal check; drawing findings state only tool-supplied dimensions; each role waits on its own prerequisites and on C6. | A slice that ships a Capital Projects role before its prerequisites or with a model-supplied tolerance. |
| R-05 | Composition reintroduces subagents inside counted runs. | Spec section 10: consults are separate runs queued by the control plane. | A slice that lets an agent start another model inside its run. |
| R-06 | Ideas or text from an outside specification enter the repository under an unchecked license. | Pattern note carries ideas only, notes the license is unchecked, and routes any adoption through the register and clean-room rule. | Copied text or schema from standardagentspec.org. |
| R-07 | The design is unsound in ways a self-check misses. | One round of cross-vendor review ran on 2026-11-18 (Codex, agy, Grok; all three returned FLAWED AS WRITTEN on the spec commit `2a9c46bd`). Each of the 33 findings was checked against the repository and dispositioned (`evidence/05-review-dispositions.md`): none rejected in full; four partly accepted (three with a part rejected on repository evidence, one with a part deferred to the owner as C-1 option (b)); everything accepted is fixed in the spec, ADR, pattern note and this record. The reviews were dispatched by the authoring side from a brief it wrote, so they are partially separated, not independent assurance. Still open: the revised spec has had no second round, and no person has reviewed it. | Approval on a claim that the spec was independently reviewed, or that the revised spec was reviewed at all. |

## Selected mode

- **Mode:** Standard
- Basis: documentation only, but the design governs which models may do what, an agent-authority concern.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The design spec, ADR 0023 (Proposed) and the pattern note are complete, and the owner has reviewed them. No product code is part of this change; role casting is designed, not implemented, and no behavior claim is made here beyond what the spec states.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
