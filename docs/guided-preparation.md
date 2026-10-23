# Manual guided preparation

This branch adds a local manual preparation slice. Enable new enrollment with `CONTROLROD_GUIDED_PREPARATION=1` before starting the API. It defaults off. Existing enrolled packages remain controlled when enrollment is off; switching the flag cannot restore legacy release.

Intake enrolls every new draft package when enabled. Existing drafts have a **Start guided preparation** button. Review the captured problem, classify the request, edit requirements and criteria, record questions and their owners, and write the technical plan and verification mappings. Save before recording an answer; answers retain the authenticated human actor and rationale. Changes append revisions. A stale save keeps local work and requires explicit comparison/reload; the API never silently merges it.

Requirement and criterion identifiers are stable and cannot be reused after retirement. Criteria update the draft package atomically. Existing draft editing refuses enrolled packages so the package and companion cannot diverge. Historical snapshots remain readable with their original digests.

Requirements can now be confirmed as a separate passkey action after their blockers are resolved; this does not release work. Release remains held for every enrolled package. Prepared release, execution and criterion-result admission are subsequent steps in the [execution plan](superpowers/plans/2026-10-23-platform-buildout.md). Mapping checks is not executed verification. Automated preparation and runtime confinement are not implemented by this manual slice.

The migration registry checks recorded SQL checksums and refuses unknown future migrations. Backup before upgrades. This is not a proven backup/restore or old-binary downgrade procedure; that rehearsal is a separate pilot gate. Source and built-server migrations use the same compiled SQL modules.

The manifest-release slice has a separate `CONTROLROD_PREPARED_RELEASE=1` flag, also off by default. It binds the current package, preparation snapshot, requirements confirmation and ordered controlled basis through the existing passkey release decision. At this intermediate build step, enrolled run claims remain held until stale-basis and result-admission tasks are completed. Only owner-local package basis references are supported by the initial release verifier; other source kinds remain explicit holds.
