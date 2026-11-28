# Basis: Polish and cleanup from the November review (batch 10)

**Change slug:** `polish-and-cleanup`
**Owner:** Ben Huffer
**Date:** 2026-11-28
**Status:** Built, for owner review.

## Mission / need

The 2026-11-28 review listed many small problems in the web app, the API, the daemon and the CLI. Most are P3. Each one is small, and together they make Control Rod harder to trust and to use. One is a security gap: before the first passkey exists, anyone who can reach the port can register it and own the installation (API-34). The design is our own; no donor code is used.

## Proposal

1. Web: a side panel opened over the page traps focus and returns it (WEB-9); Records pages back past 500 entries (WEB-15); a failed Inbox read shows a mark, never an empty inbox (WEB-16); model pickers read the shipped model registry (WEB-17); Inbox and Today say plainly what is open and why (WEB-18, WEB-19); plain wording for revisions, links and jargon (WEB-20, WEB-21, WEB-24); unused page wrappers and API calls removed (WEB-22); a note that CodexBar is macOS only (WEB-25); install advice says to restart (RUN-7); pages load on demand, so the first download is about half as large (RUN-12).
2. API: one-time setup code for the first passkey (API-34); long reasons refused, not cut (API-25); an after-commit hook that throws no longer reports a failed commit (API-27); a server error carries a reference to find in the log (API-33); a missing themes folder no longer breaks the admin page (API-35); a ceiling on open live streams; `GET /events?before=` for paging back. `spec/api.tsp` changes are additive.
3. Daemon: detection uses the agent's PATH, like preflight (DMN-27); probes cannot hang on an inherited pipe (DMN-26); Ollama no longer claims a network limit (DMN-24); a ceiling on every control-plane request (DMN-31).
4. CLI and tests: program lookups need no `which` (CLI-19); a slow first start is not killed while it is still working (CLI-18); one-line doctor wording (RUN-8); the update notice test no longer fails on a zombie process.
5. Docs: the site README says how the Pages site goes live (PKG-4); the getting-started steps name the setup code.

## Out of scope

The large refactors (API-23, WEB-23, WEB-27), the findings other batches cover, anything under `.github/`, and deleting branches.
## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Each finding in batch 10 of the 2026-11-28 review is fixed, already fixed on main, logged with a reason, or covered by another batch. The first passkey needs the setup code the server printed. Web, API and daemon typecheck and the related tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
