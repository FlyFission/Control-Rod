# Risk: the controlrod command

## Selected mode

- **Mode:** Standard

- Execution owner: Claude Code under the owner's 2026-11-24 request.
- Decision owner: Ben Huffer. No trust surface is touched: no `policies/`, `tests/redteam/`, `.github/`, `spec/`, kernel decision function or ADR.
- Scope: `scripts/cr.mjs`, `scripts/lib/{instance,link,update}.mjs`, `scripts/test/controlrod-cli.test.mjs`, `services/api/src/{server,pg-start-error}.ts` and its test, root `package.json` (Commander), README and getting-started.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | An update leaves a half-updated, unbuildable copy. | Nothing changes until every check passes; any failed step resets to the old commit (`git reset --keep`) and rebuilds it; a still-unbuilt checkout is recorded in `.git/controlrod-update.json` and finished by the next update (tests). | A failed update that leaves HEAD on the new commit with no record. |
| R-02 | An update loses the person's edits. | Uncommitted tracked edits go to `git stash` with a message; the output says `git stash pop`; untracked files are left in place; a failed stash restarts the copy and changes nothing (tests). | Any edit gone with no stash entry. |
| R-03 | `stop` or `update` signals a process that is not Control Rod. | The record's pid is signalled only while its command line is a `cr.mjs` launcher; a stale record is dropped; without a record, only the parent of the port's listener, and only if it is a launcher (tests). | A signal to a process that is not a launcher. |
| R-04 | Freeing shared memory removes something in use. | Never automatic: only `doctor --fix`, on the person's request, frees this user's 56-byte unattached segments whose creating pid is gone; parsed by the `ipcs -ma` header; macOS only (tests on real `ipcs` output). | A segment removed that has an attachment or a live creator. |
| R-05 | `link` overwrites another program's `controlrod` or garbles a shell startup file. | It replaces only a file carrying its own marker; it appends one marked line, once, and only when the folder is not on PATH (tests). | A foreign file replaced or a line added twice. |
| R-06 | Stopping drops running work. | `stop` sends SIGTERM, the same path as Ctrl+C (daemon drains first); only `--now` sends the second signal. | Work lost under a plain `stop`. |
| R-07 | The command cannot run when dependencies are missing. | The shim needs only `sh` and Node; `cr.mjs` installs dependencies before loading Commander when `node_modules` is absent. | `controlrod` crashing on a fresh clone. |

## Exit criteria

CC-01 to CC-05 are implemented and tested, the decisive checks have failed-first (mutation) evidence, and the end-to-end run in verification passes.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
