# Ship: Practice agent: watch the whole loop on a bundled sample, with no account

Release decision: **pending**. Merging is the owner's decision. This session pushed nothing and opened no pull request.

- Rollback: revert the commits. No migration. A practice project already made stays as an ordinary project record marked `practice`; archiving it removes it from the board.
- Monitoring after merge: on a fresh machine with no agent signed in, Setup's Try a practice run asks for the passkey once, opens the Practice project and its card moves through planning, release, work, check and accept in about a minute of agent time.
- Limits: no blind review has run yet. The loop was tested with the daemon's golden files and mocked web calls. It has not run in a real browser against a running daemon. The board's no-agent notice still shows on a machine with no real agent, though the practice agents work. Guided preparation and prepared release were not tried on the practice project. `docs/commands/inventory.md` is stale on main for `daemon.enroll-first-key`, which this change does not touch.

## Signature

No trust surface is touched, so no sign-off is needed.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On a machine with no agent account, Try a practice run in Setup or in the first-run guide makes the practice project (signed with the passkey) and one card. The practice agents plan, author and pre-check it with no model and no process; the person releases and accepts with the passkey, and no pull request opens. The API refuses a practice agent on any other project and never gives one any other project's run. The fake runtime stays test-only. Daemon, API and web tests pass, and `pnpm spec` shows no drift.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
