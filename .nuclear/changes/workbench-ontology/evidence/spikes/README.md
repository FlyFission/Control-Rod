# Spike evidence (Authorization A)

Spikes S-0 to S-6 from the [workbench plan](../../../../../docs/superpowers/plans/2026-10-29-workbench-buildout.md) and [specification section 34](../../../../../docs/superpowers/specs/2026-10-29-workbench-ontology-design.md). Each spike is a disposable script under `spikes/runtime-confinement/`, run on 2026-10-30 on the owner's WSL2 host with the owner's go ahead. Raw JSON output sits beside each record. Every record ends with `activation: HOLD`: a passing spike answers a question; it does not turn on a confined lane.

| Spike | Question | Answer on this host | Record |
|---|---|---|---|
| S-0 | Can model transport be separated from every tool, builtin bypasses disabled? | Yes for Claude Code (11 of 11 checks; weakened control fails the two checks it should). Not established for Codex. | [s0-capability-separation.md](s0-capability-separation.md) |
| S-1 | Does sandbox-runtime confine each pinned CLI with broker only egress? | Yes on WSL2 for both CLIs (12 of 12 checks). Not adopted: superseded by S-6. | [s1-srt-driver.md](s1-srt-driver.md) |
| S-2 | Do subscription logins work through the model broker? | Yes for Claude Code (8 of 8 checks). Not adopted: superseded by S-6. | [s2-model-broker.md](s2-model-broker.md) |
| S-3 | Do permission hooks fire in print mode? | Yes; PreToolUse and PermissionRequest both fire, and the tool is refused. | [s3-hooks-print-mode.md](s3-hooks-print-mode.md) |
| S-4 | Which structured multi turn interface is stable until ACP? | Claude Code stream-json input and output holds two turns in one process. | [s4-structured-sessions.md](s4-structured-sessions.md) |
| S-5 | Does Codex's own sandbox start inside the outer driver? | Yes, inside bare bubblewrap and inside srt, enforcing in both, once the `/tmp` exclusions are set. | [s5-nesting.md](s5-nesting.md) |
| S-6 | Do the CLIs' own command sandboxes protect the user's normal login? | Yes for both CLIs with the settings Control Rod writes; **not** with their defaults, which let commands read login files. Normal login, real prompts. | [s6-native-sandboxes.md](s6-native-sandboxes.md) |

## Chosen design

The owner chose the simplest secure design on 2026-10-30: each CLI keeps its ordinary login, and Control Rod sandboxes only the commands the agent runs, using each CLI's built-in sandbox with the settings in [S-6](s6-native-sandboxes.md). Control Rod never reads, stores, relays or masks a token. The relay (S-2) and credential masking (S-1) were working experiments and are not adopted. S-0's finding still holds and is what the built-in sandboxes provide: the model client runs outside, commands run inside without credentials or network.

## Pinned inputs

| Input | Version | SHA-256 |
|---|---|---|
| Claude Code native binary | 2.1.314 | `4487042b4c4f5d88d4568f68ae98aae0b1ffae58864cf57fb868641bc5f84594` |
| Codex native binary (linux x64 musl) | codex-cli 0.166.0 | `b8a11fedf24b2dfb59a70c9e52b030f9a508dcd49cd2dd0d41956f4c785156b8` |
| @anthropic-ai/sandbox-runtime | 0.0.81 (npm integrity `sha512-bjHDu87gjIR7+Oxy9jPiK3v8CvSELCzfpXa3fjqfSKdvlZET2iF51xcXILWPayTpowB3xtZeQVf2JR916nVW/w==`) | `dist/cli.js` `2a3cc1c7c6ee703860ea548594d55de1bdf760a642786cac74506dd96ac7fcb1` |
| bubblewrap | 0.9.0 | `/usr/bin/bwrap` `e318903862396f96de3df57264e0158682b952fd3fb53ac23d876413e7b30f71` |
| Kernel | 6.6.114.1-microsoft-standard-WSL2 | |
| socat, ripgrep, libwrap0 (srt dependencies, extracted without root) | Ubuntu noble 1.8.0.0-4ubuntu0.1, 14.1.0-1, 7.6.q-33 | `.deb` SHA-256 `46e85428…696fe`, `c5ae63c7…6101a4`, `36118b86…96d2ce` |

## Credential handling

Three spikes (S-1, S-2, S-6) used the owner's real logins for one tiny prompt each ("Reply with exactly the word OK"). No token value was printed, logged or written: the scripts report only statuses and booleans, scan their own temporary files for the token values afterwards, and these records were scanned for the Claude access and refresh tokens and the Codex access, refresh and id tokens before commit (no hits). S-1 masked the Codex login file read only inside its boundary, so Codex's attempt to refresh there failed; the login itself was unharmed and Codex refreshed normally later that day.

## Required links

[Verification](../../verification.md), [plan](../../plan.md), [ship](../../ship.md).

## Exit criteria

Each spike has a record with its question, pinned inputs, raw output, answer, limits and what it unblocks.

## Source-lineage note

Original Control Rod experiments; tool behaviour observed on one host at the versions above.
