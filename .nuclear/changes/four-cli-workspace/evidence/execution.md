# Desktop run workbench execution

## Implemented

Runs opens a selected attempt directly and remembers recent attempts within the signed-in tab. History remains accessible after a package revision advances. The transcript and file selection restore when a developer returns. Raw logs and recorded outputs open on demand. The server authorizes every exact-run read, bounds the transcript and file preview, and checks the output digest.

New Work shows the selected project, repository/ref, author and checker before submission. Optional overrides share one disclosure. Submission creates a capture for assisted intake. Managed release remains the launch entry point.

## Verification

The first execution was verified against the isolated 21 November source snapshot. The follow-up was integrated on top of board PR #117 at `75ab4c46`. Repository typechecking, 840 API tests, 704 web tests, all eight Chromium board checks and the complete Go suite passed against the integrated checkout. The board fixture covers four simultaneous attempts, duplicate titles, historical reload, lazy transcript and output reads, and keyboard focus return.

Codex Astra reviewed the implementation and identified two corrections. On completion the selected run now reads through the last page of events, and opening outputs early keeps working once the run succeeds. The plan also received independent Claude Fable and AGY reviews.

## Open work

- Runtime and checkout binding is tracked in #118. Exact changes require an authoritative per-attempt checkout and base commit. Recorded outputs already show an unavailable comparison state when there is no verified diff.
- The provider feasibility exercise observed successful Claude synthetic intake, signed release, author completion, queued stop and running stop on WSL2. Separate-checkout and checker qualification remain open. Codex standalone worked but its live intake failed inside the nested host sandbox. AGY transport worked while invocation and vendor binding remain open. OpenCode returned a provider authentication error. Both remain gated for daemon dispatch. See #123 and #125.
- The multi-attempt browser fixture does not exercise concurrent daemon checkout isolation. That is tracked in #119.

[Local browser fixture measurements](browser-metrics.json)
