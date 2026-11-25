# Basis: Antigravity CLI as a confined seat

**Change slug:** `agy-seat`
**Owner:** Ben Huffer
**Date:** 2026-11-25
**Decision this basis supports:** whether Antigravity CLI leaves `AwaitingConfinement` on macOS and takes author, intake and checker seats.

## Mission / need

The owner (2026-11-25): "Lets work on getting antigravity working as well as grok." ADR 0024 puts every agent people already use at one table; until now only Claude Code and Codex could run work, and `wave2-multi-cli-adapters` left Antigravity listed but refused until its confinement was built and qualified under its own record. This is that record.

## Measured facts (agy 1.5.16, macOS, the owner's Mac Studio, 2026-11-24/25)

Survey notes are outside the repository (they include the owner's paths); the results that decide this change are summarized here and in [verification](verification.md).

- Print mode (`agy -p`) always turns on Antigravity's terminal sandbox, a deny-default Seatbelt profile with a network proxy, with or without `--sandbox`, and even with `enableTerminalSandbox: false`. Its commands could not read `~/.gemini`, list it, read `~/.ssh` or `~/.grok/auth.json`, resolve any host (`curl` exit 6), write outside the workspace, or find the `gemini` Keychain item where the login lives (`security` exit 44).
- Its file tools (view, write, edit) are not inside that sandbox: without rules they read and create files anywhere. `permissions.deny` rules `read_file(<path>)` block a path and everything under it, for reads and for new files, after symlinks are resolved; `/**` forms match nothing. Deny wins over allow, so a folder holding the workspace cannot be denied. With the workspace under `/private/var/tmp` and every sibling on the path denied by name, the file tools reached only the workspace.
- The command allow list is not closed: commands outside it are either on a built-in safe list or reviewed by Antigravity's own models and may run (inside the sandbox). Deny rules are hard limits and do not end the run. In plan mode an action needing approval is refused and ends the run; plan mode allows the scratch write.
- Antigravity's sandbox cannot start inside another Seatbelt profile (every command fails with `sandbox_apply: Operation not permitted`), so Control Rod's outer checker mount cannot wrap it.
- User-level configuration (MCP servers, plugins, hooks, skills, rules, global GEMINI.md/AGENTS.md, permission grants, trusted folders) loads from the home folder and no print-mode flag turns it off. With `HOME` set to an empty folder holding only a link to the Keychain folder, the login works and none of it loads.
- The stream is `{"event": "init" | "step_update" | "result"}`; the model is named in `init`; the process exits 0 when it stops on a refused tool, so the result's `status` and `finished_reason` decide failure.
- A background command does not outlive the run.

## Scope

In scope: `daemon/internal/runner` (Antigravity adapter, the empty-gap rule of `AwaitingConfinement`, per-runtime workspace root, per-run home, the self-confined checker path, tests, captured stream), `daemon/internal/runner/models.json`, `services/api/src/{runtimes,run-attestation,app,work,subscriptions,checker-attempts}.ts` and their tests, and this packet. Out of scope: kernel, policies, red-team fixtures, workflows, spec, ADRs; Grok CLI, OpenCode and Ollama (still awaiting confinement); Antigravity in a repository checkout (refused here, its own change next).

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| Print mode always sandboxes commands. | Measured four ways, including with the sandbox switched off in settings. | A version where a print run's command reads `~/.gemini` or reaches a host. |
| `read_file(<dir>)` denies the folder for reads and new files. | Measured. | A version whose rule matching changes. |
| The Keychain item stays unreadable to commands. | `security` exit 44 inside the sandbox. | Any command reaching it. |
| macOS only. | Nothing was measured elsewhere. | Not applicable: other platforms stay refused. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Sandbox decision: [ADR 0021](../../../docs/adr/0021-native-cli-sandboxes.md). Seats: [ADR 0024](../../../docs/adr/0024-council-first.md).

## Exit criteria

Antigravity CLI runs author (outside a checkout), intake and pre-check work on macOS under its own terminal sandbox, with file-tool rules, a per-run home and plan-mode checks that Control Rod derives from the run's policy; it stays refused on every other platform and for checkout authoring; its pre-checks count with the Gemini models registered for it; the live qualification passes on a Mac; and the owner has made the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
