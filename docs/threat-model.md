# Threat model (draft, Phase 0)

Control Rod's central promise is that an agent cannot make its own work count. This model lists who might break that promise, how, and what stops them. Each threat maps to red-team cases in `tests/redteam/catalog.yaml`.

## Assets

- Decisions: releases, verdicts, apply clearances, policy changes
- Evidence: execution traces, verification records, custody, signatures, the transparency log
- Trust surfaces: work packages, acceptance criteria, verification tools, agent baselines, policies
- Restricted data in its data lane
- Signing keys

## Actors

- An agent acting within its permissions but optimizing toward "done"
- An agent manipulated by content it reads (prompt injection through inputs, repos or tool output)
- A careless or hurried person
- An operator with database access
- An outside attacker reaching the control plane or a daemon

## Threats and controls

| Threat | Control |
| --- | --- |
| Agent edits its acceptance criteria, policy or baseline | Trust surfaces mounted read-only in the sandbox; kernel refuses changes from agent principals |
| Agent claims done without evidence | Claims are arbitrated; acceptance needs a verification record and the required signature |
| Agent grades its own work | Verifier baseline must differ from author; custody recorded by the runner; decisive evidence from the verifier |
| Agent types a number instead of computing it | Values must trace to execution traces; floats refused in records |
| Agent works against a stale revision | Locked fields hashed per revision; claims against old revisions refused |
| Agent approves itself through another path (chat, phone, auto-approve flags) | Only passkey signatures over record digests count; auto-approve modes blocked |
| Restricted data leaves its lane | Sandbox egress proxy with fail-closed decider; runtimes limited by lane; Cedar floors |
| Secrets leak into a run | Explicit minimal environment; credential masking; short-lived run credentials |
| Operator rewrites history | Tessera log with outside witness and timestamps; signatures with keys outside the database |
| Broken policy silently stops forbidding | Kernel denies on any evaluation error; analysis gates on floor changes |
| Replayed approval | Per-request IDs; signatures bound to record digests |

## Out of scope

A malicious administrator with signing keys, a compromised host operating system, a compromised model provider, and physical attacks. Control Rod makes these detectable where it can, through the transparency log and witnesses, but cannot prevent them.
