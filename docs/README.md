# Control Rod documentation

- `adr/`: architecture decision records, one per decision
- `threat-model.md`: what Control Rod defends against, and what it cannot
- `boundary.md`: what Control Rod is not, and how it fits inside a QA program
- `crosswalk.md`: how one control spine serves Software and Capital Projects modes
- `sqa/`: the software quality assurance package for Control Rod itself
- `patterns/`: ideas borrowed from other projects, written under the clean-room rule

## Overlay theme planning

- [Interchangeable overlay specification](superpowers/specs/2026-10-25-overlay-themes-design.md)
- [Fifteen-world catalog and art briefs](superpowers/specs/2026-10-25-overlay-themes-catalog.md)
- [Implementation plan](superpowers/plans/2026-10-25-overlay-themes.md)
- [Change basis and verification](../.nuclear/changes/overlay-themes/basis.md)

The design/plan were approved for implementation on 2026-10-26. The implementation includes fifteen original worlds, a shared Floor engine and a standalone local draft preview. Pack-specific human art/distribution approval is separate from implementation.

- [Working Worlds user guide](overlay-themes/user-guide.md)
- [Art authoring and release workflow](overlay-themes/asset-workflow.md)
- [Execution and remaining review decisions](../.nuclear/changes/overlay-themes/execution.md)

The full platform plan (product, architecture, security, domain model, flows, typicals, experience and business) is the Control Rod Platform Plan, an owner-held document with ten tabs (Overview, Build or borrow, Architecture, Security and compliance, Domain model, Flows, Typicals, Large-project typicals, Experience, Business). It is not public; contributors work from the records here, which cite it by tab. The workbench specification maps each of its sections to the plan in its [Platform Plan alignment table](superpowers/specs/2026-10-29-workbench-ontology-design.md#2-platform-plan-alignment).
