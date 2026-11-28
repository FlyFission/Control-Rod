# Basis: Close the setup escape and harden the sandbox

**Change slug:** `sandbox-hardening`
**Owner:** Ben Huffer
**Date:** 2026-11-28
**Status:** Built, for owner review.

## Mission / need

The 2026-11-28 code review (batch 2) found that checkout setup, which PR #242 added, runs package managers on the host before an author round, outside any sandbox, with the daemon's whole environment. An earlier round's agent can write the checkout. So it could plant `.pnpmfile.cjs`, an `.npmrc` `git=` program, a `.venv/bin/python`, a `.python-version` path or a cargo config, and setup would run it with the user's provider keys and SSH agent in reach (DMN-1, P0). The skip was keyed on `node_modules`, which the agent controls (DMN-28). The same batch lists smaller sandbox gaps: the checker folder in /var/tmp had no owner check (DMN-2), run folders were never removed (DMN-9), agents shared the daemon's terminal (DMN-21), macOS ran the runtime by path after hashing it (DMN-17), the egress filter blocked Claude's and Antigravity's token refresh (DMN-6) and had no idle timeout or honest description (DMN-14), and two web links took any scheme (WEB-26).

## Proposal

1. Setup (DMN-1, DMN-28): compare the checkout with the bound commit through the hardened host Git. If any file that can name a program (`.npmrc`, `.pnpmfile*`, `.yarnrc*`, `bunfig.toml`, `uv.toml`, `.python-version*`, `rust-toolchain*`, `.tool-versions`, mise files, `.cargo/`, and `packageManager`, `devEngines`, `volta`, `tool.uv` fields) is not as committed, skip all of setup with one line. Never run a step whose folder (`node_modules`, `.venv`) already exists. Skip a changed JavaScript lockfile that names a Git or local package. Add `--config.ignore-pnpmfile=true`, `--no-env-file`, `--install-links=false`, `--no-install-workspace --no-install-local`. Run each step with an allowlisted environment that drops every secret-like name and every PATH entry from the checkout.
2. DMN-2: `ensurePrivateDir` refuses a link, a non-folder, another owner, or a mode other than 0700, for the checker root. The runtime stage folder also refuses another owner.
3. DMN-9: Handle removes the run folder the daemon made once the completion is in the outbox. A startup sweep removes stale ones under the daemon home.
4. DMN-21: `Setsid` for every agent process.
5. DMN-17: on macOS, Claude Code's single-file build starts from a staged, re-hashed copy.
6. DMN-6, DMN-14: add `platform.claude.com`, `console.anthropic.com` and `oauth2.googleapis.com`; close tunnels idle for 10 minutes; document the filter.
7. WEB-26: only https, or a path on this site for evidence, becomes a link.

## Out of scope

Running setup inside the agent's own confinement (see risk.md R-01). An empty `CARGO_HOME` (R-02). An upstream proxy setting and `--unshare-net` for the filter (R-05). A live regression test of Claude's home read denials (DMN-30, R-06).

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Checkout setup never runs a program named by a file the agent changed or planted, and its environment holds no provider key, token or SSH agent socket. The checker folder in /var/tmp is used only when it is a private folder of this user. Run folders are removed once the completion is in the outbox, and stale ones at start. Agent processes start in their own session. Claude Code on macOS starts from a verified copy. The egress filter allows the sign-in refresh hosts, closes idle tunnels and is documented as defence in depth. Checker evidence and pull request links open only https or this site. gofmt, go vet (Linux and darwin), go test, the web tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
