# Ship: run attestation for counted checks

Release decision: **draft pull request for owner review; no merge is authorized by this record.**

- **Proposed:** merge after review. Pull requests #76, #77, and #78 are on main (`e539a35`). This branch merges that main and keeps migration `023` after `020`–`022`. The pull request stays a draft until the owner re-reviews. Server edits use #77's attempt id: the pre-check stores `checker_attempt_id` at start, the daemon signs it as `check_id`, and a failed attestation is a checker attempt with outcome `error` and `counts_as` `inconclusive`.
- **Not claimed:** that the macOS Keychain was executed on Ben's Mac; that `secret-tool` was used against a Linux session bus; that a real Claude Code or Codex binary was launched; that an egress proxy enforced an endpoint; that the in-run probe ran (`probe_result` is `not-run`); that a cgo Security.framework build was executed.
- **Owner decisions requested:** approve or return the pull request. Enroll the daemon public key with `daemon.enroll-key` before a Claude or Codex pre-check is expected to count. Retire a replaced key with `daemon.retire-key`.

Rollback: revert the merge. Down migration `023` drops `attestation_nonces` and `daemon_signing_keys` and must run before `022`. A counted completion with no attestation does not count. There is no production switch that restores the old behavior.

Monitoring after merge: `run.attestation-failed` is not a separate event. Watch `package.checker-attempt` rows whose outcome is `error`, `attestation_verified` is false, and `counts_as` is `inconclusive`. A burst of those on checks that should have counted means the enrolled key, the executable digest, or the attempt id is not the one the daemon signed. A retired key that still verifies means `daemon.retire-key` did not reach this server.

`docs/commands/inventory.md` was already stale against `tools/generate_command_inventory.py` before this change. This change adds the `admin.daemon-enroll-key` and `admin.daemon-retire-key` rows and does not regenerate the rest.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Spoofed checks do not count. Author launch bytes are unchanged. Daemon and server tests are clean. The spec change is additive. The kernel is not edited. The owner retains the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
