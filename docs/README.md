# Control Rod documentation

## Start here

- [getting-started.md](getting-started.md): run it, test it, change it
- [status.md](status.md): what works, what is stubbed, what is next, and the known failures
- [collaboration.md](collaboration.md): issues, branches, reviews, merges, labels, the project board and Dependabot policy

## Why it is built this way

- [`adr/`](adr/): architecture decision records, one per decision
- [threat-model.md](threat-model.md): what Control Rod defends against, and what it cannot
- [boundary.md](boundary.md): what Control Rod is not, and how it fits inside a QA program
- [crosswalk.md](crosswalk.md): how one control spine serves Software and Capital Projects modes
- [`sqa/`](sqa/): the software quality assurance package for Control Rod itself
- [`patterns/`](patterns/): ideas borrowed from other projects, written under the clean-room rule

## Running and operating it

- [owner-pilot.md](owner-pilot.md): the owner's step-by-step run, including recovery
- [guided-preparation.md](guided-preparation.md): from a rough request to a pinned release and criterion-based acceptance
- [daemon.md](daemon.md): the run daemon
- [test-database.md](test-database.md): how the API tests find or build PostgreSQL 17
- [preparation-recovery.md](preparation-recovery.md): backup and restore
- [`commands/`](commands/): command inventory and database roles
- [`office-view/`](office-view/): the office view and its acceptance status
- [`third-party/`](third-party/): third-party notices

## Specs and plans

Design specifications and implementation plans live in [`superpowers/specs/`](superpowers/specs/) and [`superpowers/plans/`](superpowers/plans/), with execution ledgers in `superpowers/execution/`. Each change also has a record under [`../.nuclear/changes/`](../.nuclear/changes/).

- [Platform buildout specification](superpowers/specs/2026-10-23-platform-buildout-design.md)
- [Workbench ontology specification](superpowers/specs/2026-10-29-workbench-ontology-design.md), which maps each of its sections to the Platform Plan in its [alignment table](superpowers/specs/2026-10-29-workbench-ontology-design.md#2-platform-plan-alignment)
- [Guided preparation](superpowers/specs/2026-10-22-guided-preparation-design.md)

### Overlay themes

- [Interchangeable overlay specification](superpowers/specs/2026-10-25-overlay-themes-design.md)
- [Fifteen-world catalog and art briefs](superpowers/specs/2026-10-25-overlay-themes-catalog.md)
- [Implementation plan](superpowers/plans/2026-10-25-overlay-themes.md)
- [Working Worlds user guide](overlay-themes/user-guide.md)
- [Art authoring and release workflow](overlay-themes/asset-workflow.md)
- [Change basis and verification](../.nuclear/changes/overlay-themes/basis.md) and [execution and remaining review decisions](../.nuclear/changes/overlay-themes/execution.md)

The overlay design and plan were approved for implementation on 2026-10-26. The implementation includes fifteen original worlds, a shared Floor engine and a standalone local draft preview. Pack-specific human art and distribution approval is separate from implementation.

## The Platform Plan

The full platform plan (product, architecture, security, domain model, flows, typicals, experience and business) is the Control Rod Platform Plan, an owner-held document with ten tabs (Overview, Build or borrow, Architecture, Security and compliance, Domain model, Flows, Typicals, Large-project typicals, Experience, Business). It is not public; contributors work from the records here, which cite it by tab. If you are a collaborator and need it, ask the owner.
