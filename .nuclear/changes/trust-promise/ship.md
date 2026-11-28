# Ship: Make the trust promise true: Balanced by default, a trusted-key check, an update-check switch

Release decision: **pending**. Merge is the owner's decision.

- Rollback: revert the merge. No data or migration. Projects created at Balanced while this was in keep Balanced; the owner can change any of them in Setup.
- Existing projects: stored presets are not touched. A project saved at Light keeps releasing and accepting on its own, and the screens now say so for it. A project with no saved settings keeps signing every step.
- Monitoring after merge: create a project on the owner's Mac and confirm Setup shows Balanced as Current, a card starts on its own and stops at Ready to accept for a passkey, and New Work's header says so. Run `pnpm cr verify --trusted-key <digest>` on an exported proof with the right and a wrong digest.
- Limits: the web tests run in jsdom against a mocked API; the API suite was run for related files only. The council-loop SVG labels changed; the README screenshots themselves were not retaken.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A new project is created at Balanced, so every routine accept is signed with the passkey. Every screen that describes how a card goes (New Work, the empty board, the first-run guide, Setup, the Agents roster, the workflow view, the one-time board offer) says what the project's settings really do, and Light says plainly that it starts and accepts on its own. `pnpm cr verify --trusted-key` fails clearly when the seal's key is not the trusted key. `CONTROLROD_UPDATE_CHECK=0` stops the API's update check at start, as it already does the daemon's. The README says what is checked offline with and without `--trusted-key`, what Control Rod contacts, and that its screenshots show sample data. Web and API typecheck and tests pass, and `tools/check_public_claims.py` passes.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
