# Trace: the controlrod command

| Requirement | Code | Tests | Disposition |
|---|---|---|---|
| CC-01 `controlrod` works from any folder after one `pnpm cr link`; never replaces a foreign file; PATH line added once. | `scripts/lib/link.mjs` | `controlrod-cli.test.mjs` link tests | implemented and tested |
| CC-02 `update` fast-forwards main, installs and builds with the new code, restarts the way it ran, rolls back on failure, finishes an unbuilt checkout, stashes edits, refuses other branches and own commits before stopping anything. | `scripts/lib/update.mjs`, `updateCommand` | update tests | implemented and tested |
| CC-03 `stop`/`status`/`restart`/`start --background`/`open`/`logs` find the launcher by record or port and stop it like Ctrl+C. | `scripts/lib/instance.mjs`, `cr.mjs` | instance tests; end-to-end run | implemented and tested |
| CC-04 A failed database start shows PostgreSQL's own error and advice. | `services/api/src/pg-start-error.ts`, `server.ts` | `services/api/test/pg-start-error.test.ts` | implemented and tested |
| CC-05 Dead PostgreSQL shared memory is reported by `doctor` and freed by `start` or `doctor --fix` on macOS. | `parseSegments`, `freeDeadDatabaseMemory` | parse test on real macOS output | implemented and tested |

## Exit criteria

CC-01 to CC-05 are implemented and tested, the decisive checks have failed-first (mutation) evidence, and the end-to-end run in verification passes.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
