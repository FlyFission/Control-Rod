# Handoff

Ben is handing the multi-provider work to another tool. The approved design is [multi-provider-design-plan.md](multi-provider-design-plan.md), converted from the design canvas. This note is the status and the rules for what comes next. It does not change behavior.

## Status

These milestones are on `main`:

| Milestone | What | Pull request | On main |
|---|---|---|---|
| M1 | Adapter seam | [#76](https://github.com/FlyFission/Control-Rod/pull/76) | yes |
| M3 | Attempts and sticky fails | [#77](https://github.com/FlyFission/Control-Rod/pull/77) | yes |
| M2 | Checker hardening | [#78](https://github.com/FlyFission/Control-Rod/pull/78) | yes |
| M4 | Run attestation | [#79](https://github.com/FlyFission/Control-Rod/pull/79) | yes, merge `c1c2482` |

M10, Settings > Subscriptions, is this pull request, [#80](https://github.com/FlyFission/Control-Rod/pull/80). CI was green and the review fixes are applied. Merge it when it is green.

The last Claude `-p` parsing fix, `b4ae354` ("Keep Claude -p from swallowing the next flag."), got no final adversarial review. Re-review it.

## Accepted M0 decisions

- Real home plus targeted isolation for Claude and Codex (option A in the plan).
- Safety needs 2-of-2 checkers from different vendor families. Other grades need 1.
- Local Ollama models cannot be the deciding checker on Safety or Material.
- API-key-only CLIs are excluded for now.
- The daemon signing key is in the OS keychain: macOS Keychain via Security.framework, Linux `secret-tool` via stdin.
- No production unattested switch.

## Remaining milestones

In plan order. Spec and acceptance are the phased-rollout row. The "Needs" line is the work still in front of that row.

### M5. macOS and native Linux qualification for Claude Code and Codex, author and checker

- **Signature:** Ben (qualification record).
- **Acceptance:** The ADR 0021 suite and the adversarial suite pass on Ben's Mac Studio and on Linux.
- **Needs:** Qualify on Ben's Mac Studio. Real Claude and Codex runs go through the adapters. Claude uses `--safe-mode` with headless `-p`. A macOS Seatbelt profile for the checker, then set `CONTROLROD_SEATBELT_QUALIFIED=1`. Keychain signing key, then `daemon.enroll-key`.

### M6. Kernel provider separation

Vendor and family, pairwise, quorum and tier from the signed policy, attestation required.

- **Signature:** Ben (protected). This needs Ben's signature.
- **Acceptance:** Kernel tests for each rule, plus red-team catalog entries.

### M7. Grok Build adapter

- **Signature:** Ben (qualification). Needs Ben's qualification sign-off.
- **Acceptance:** Passes the adversarial suite on WSL2 and macOS, with the run-owned config and the auth.json deny verified.

### M8. Antigravity adapter

Checker role, inside an OS wrapper with a per-run `brain/`.

- **Signature:** Ben (qualification). Needs Ben's qualification sign-off.
- **Acceptance:** File-tool writes blocked by mounts. Transcript isolation proven. Vendor from the pinned model.

### M9. Static checker list and consensus seats

Reusing the review panel.

- **Signature:** Ben (policy). Needs Ben's policy approval.
- **Acceptance:** Missing seats are inconclusive. Pairwise family is enforced. The tier floor holds.

### M11. OpenCode in a Control Rod wrapper, plus local Ollama checkers

- **Signature:** Ben (qualification). Needs Ben's qualification sign-off.
- **Acceptance:** Zero writable tools for checkers. Locality and endpoint recorded.

## Hard rules

- `kernel/` is protected. No edits without sign-off.
- Control Rod must never read or copy auth tokens (ADR 0021).
- No token or API-key fields in the UI.
- Never modify the user's CLI configs.
- Author launch goldens stay unchanged unless a change to them is intended.

## Working process

Each pull request was adversarially reviewed by a different-vendor CLI on Ben's Mac (Codex, Claude, agy, local Ollama).

Codex:

```sh
CODEX_HOME=<tmp dir with symlinked ~/.codex/auth.json> codex exec --sandbox read-only --skip-git-repo-check - < prompt.md
```

The default Codex config routes to an out-of-credit Ollama cloud model, hence the temp home.

agy:

```sh
agy -p "$(cat prompt.md)"
```

The prompt is a review header, then `--- DIFF ---`, then the pull request diff from `https://patch-diff.githubusercontent.com/raw/FlyFission/Control-Rod/pull/N.diff`.

Fix the findings. Address Copilot and Codex review comments on GitHub. Resolve the threads. This repo requires conversations resolved, with `gh api graphql` `resolveReviewThread`. Merge when CI is green: go, rust, typescript, python, sbom, licenses, and change-records.
