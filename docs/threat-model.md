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

## Controller grant boundary (inactive preparation dispatch)

A new narrow credential class authorizes only intent-bound grant begin/finalize calls. Browser sessions and the general daemon token do not substitute for it; only a person may revoke through the owner route. No public grant issuance or preparer run creation/dispatch is present. The initial projection grants stored preparation/capture/attachment context only; external sources and technical-preparer issuance remain held.

Scope/claim/assignment/preparation fences, controller-retained proposal bytes, a unique proposal slot, finite operation/pending limits and every-ack deferred database guards address the tested protocol attacks. PostgreSQL 17+ enforces the authority transaction budget; no remote file/model I/O occurs inside those transactions. A finalized original response may arrive after stop, and audit records authorization rather than model consumption. Exact retries recheck current authority; lost acknowledgment never proves rollback of controller custody.

The preceding Phase 0 table includes intended controls. Native credential/tool/model-egress isolation, outside witnessing and whole-system prompt-injection resistance are not established by this grant component. Runtime preparation stays held pending real authority-adapter/native transport, approved profiles and protected activation. The current evidence packet distinguishes tested admission/custody from those remaining gates.

Disclosure activation gate: an unconfirmed draft `data_lane` is not owner authorization to disclose. A future trusted coordinator must establish classification and runtime permission before preparer issuance; current SQL fixtures do not prove that gate. No public issuer or native preparer dispatch is connected.
