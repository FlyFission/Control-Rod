# Risk: Make the trust promise true: Balanced by default, a trusted-key check, an update-check switch

- R-01: new projects now stop for a signed accept, so a person who expected Light sees more passkey prompts. Light stays one click away in Setup, under What needs your passkey, with its words saying what it does. The DecisionBar already offers to let a step go after three signatures in a day.
- R-02: existing projects are not migrated. A project saved at Light keeps releasing and accepting on its own. The copy now says so for that project wherever it is shown, so nothing claims a signature that will not happen.
- R-03: copy shown where the board does not know which project a card will join (the empty board and guide with no active project) uses neutral words that point to the project's settings, rather than claim either way.
- R-04: `--trusted-key` could give false comfort if the reader takes the digest from the bundle itself. The docs say to get it from somewhere other than the file, and the option only tightens the check: without it, output is as before plus the key's digest.
- R-05: `CONTROLROD_UPDATE_CHECK=0` hides a newer version from the start-up notice. That is the person's choice, and Check again still works.
- Trust surface: none. No file under `.github/`, `kernel/`, `policies/`, `tests/redteam/`, `spec/` or `docs/adr/` changes. The signing policy's server-side enforcement is unchanged.

## Selected mode

- **Mode:** Standard
- Basis: a default value, copy, an additive CLI option and an opt-out switch; reversible by revert, no data or migration.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A new project is created at Balanced, so every routine accept is signed with the passkey. Every screen that describes how a card goes (New Work, the empty board, the first-run guide, Setup, the Agents roster, the workflow view, the one-time board offer) says what the project's settings really do, and Light says plainly that it starts and accepts on its own. `pnpm cr verify --trusted-key` fails clearly when the seal's key is not the trusted key. `CONTROLROD_UPDATE_CHECK=0` stops the API's update check at start, as it already does the daemon's. The README says what is checked offline with and without `--trusted-key`, what Control Rod contacts, and that its screenshots show sample data. Web and API typecheck and tests pass, and `tools/check_public_claims.py` passes.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
