# Risk: Add and watch cards from a terminal

- **Who holds the token.** Anyone who can read the Control Rod home, which already holds the daemon token and database passwords. Runs cannot: the home is denied to every sandboxed run.
- **What it opens.** Listing and adding cards only. Accept, release, return, settings, signing and the admin view still need a browser session, and steps that need a passkey still need one.
- **Who it acts as.** The installation's first active member. On a shared server that is the person who set it up.
- **No trust surface is touched.**

## Selected mode

- **Mode:** Standard
- Basis: reversible by revert; no kernel, policy, spec or workflow change.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`controlrod card add` adds a card the way quick add does and `controlrod cards` lists cards by column, with no browser or passkey. The command-line token opens only the listed card routes, acts as the installation's first member, and is refused everywhere else. API, scripts tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
