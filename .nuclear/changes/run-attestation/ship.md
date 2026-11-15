# Ship: run attestation for counted checks

Release decision: **draft pull request for owner review; no merge is authorized by this record.**

- **Proposed:** merge after review, and only after pull requests #76 and #78. This branch is cut from `cursor/checker-workspace-8f32`. The pull request is opened against `main` and says it stacks on #76 and #78. Server edits are additive beside pull request #77: migration `023-run-attestation`, `services/api/src/run-attestation.ts`, and a short hook in `applyCompletion` and `finishPreCheck`.
- **Not claimed:** that the macOS Keychain was executed on Ben's Mac; that `secret-tool` was used against a Linux session bus; that a real Claude Code or Codex binary was launched; that an egress proxy enforced an endpoint; that the in-run probe ran (`probe_result` is `not-run`).
- **Owner decisions requested:** approve or return the pull request. Enroll the daemon public key with `daemon.enroll-key` before a Claude or Codex pre-check is expected to count. The test switch `CONTROLROD_TEST_UNATTESTED_CHECKS` must stay unset in production.

Rollback: revert the merge. The new tables are `daemon_signing_keys` and `attestation_nonces`. Older completions that send no attestation are refused as counted checks once this server is current, except where the test switch is set.

`docs/commands/inventory.md` was already stale against `tools/generate_command_inventory.py` before this change. This change adds the `admin.daemon-enroll-key` row and does not regenerate the rest.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Spoofed checks do not count. Author launch bytes are unchanged. Daemon and server tests are clean. The spec change is additive. The kernel is not edited. The owner retains the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
