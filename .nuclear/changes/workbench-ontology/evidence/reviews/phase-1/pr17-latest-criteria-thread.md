# Phase 1: loading the latest criteria after a stale save (thread on PR #17)

Codex connector thread 4429561860 on `apps/web/src/pages/PackagePage.tsx`, still open after merge. Checked against `main` at `d25deae` on 2026-11-06.

| Thread | Decision | Change and evidence |
|---|---|---|
| Fetch the current draft before loading the latest criteria (P2) | Accepted, fixed | Confirmed: "Load the latest criteria" copied the page's cached package and tag, so when a save came back stale before the live refresh (or with the event stream down) it replaced the person's text with the same old criteria and the next save sent the same rejected tag. The button now reads the package from the server; only when that read succeeds does it replace the text, the base and the tag, and update the page's cached view. If the read fails, the text and the stale notice stay, with a line saying the latest could not be loaded. If the package is no longer a draft, editing closes. Tests in `apps/web/src/pages/criteria.test.tsx`: "loads the latest criteria from the server when the page has not refreshed yet, and saves with its tag" and "keeps the person's text when the latest criteria cannot be loaded". Both fail on `main` and pass here. |

Web suite: 27 files, 259 tests pass. Typecheck clean after `gen:api`.
