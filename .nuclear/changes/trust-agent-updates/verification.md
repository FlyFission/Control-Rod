# Verification: trust agent updates

Evidence status: **pass** for TU-01 and TU-02 on this host (Linux, Go 1.24.7).

| Evidence ID | Status | Claim and limit | Artifact |
|---|---|---|---|
| E-01 | pass | The real Codex 0.172.0 (npm, linux-x64) reports `mcp_lazy_stdio_startup` on with Control Rod's fixed switches and off with `--disable mcp_lazy_stdio_startup`. Linux binary, not the macOS one. | `evidence/codex-0.172.0-switch.log`, `daemon/internal/runner/testdata/codex-0.172.0-features.txt` |
| E-02 | pass | New and changed unit tests pass; the daemon suite passes except `TestAuthorEgressFilterStartsAndInjectsProxyEnvDuringRun`, which fails the same way on main in this cloud container (its HTTPS_PROXY). | `evidence/green-go.log` |

Not done here: a live run of a newer Antigravity or Grok build (owner decision: updates are trusted); macOS.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

TU-01 to TU-03 are implemented and tested, and the daemon tests pass apart from the known cloud-only egress test.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
