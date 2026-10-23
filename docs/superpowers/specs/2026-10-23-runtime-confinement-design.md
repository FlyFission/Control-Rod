# Preparation runtime confinement specification

Status: investigation and inactive policy proposal. Parent: [platform buildout](2026-10-23-platform-buildout-design.md), PB-05/06 and GP-15/18. No preparation role is dispatched by the current RunRole contract.

The current daemon removes CONTROLROD variables but otherwise inherits environment/HOME. Claude's recorded sandbox is `none`; Codex's workspace sandbox retains the owner configuration. These are not sufficient preparation-role boundaries.

## Target behavior

Requirements and technical preparers read only assigned immutable inputs/repository snapshots and write only per-run proposal outputs. They cannot read owner HOME, unrelated files/processes, arbitrary environment secrets or provider credentials, mutate repositories, reach arbitrary networks, change lane/role, settle human blockers, confirm, release or accept. Their model transport may reach only the approved provider through a bounded credential broker. Their tool execution has no direct model/Internet egress.

The trusted model client and the untrusted agent-executable tool process must be separate capability domains. Mounting a real CLI credential into an agent-readable HOME, or passing it in an environment inherited by shell tools, fails this specification. A CLI allowlist is not proof of isolation. No native option is assumed to exist until checked against the installed version and exercised.

## Interfaces to close before activation

- `RuntimeProfile`: runtime/version/binary digest, supported role/lane, model transport, tool transport, filesystem grants, environment keys, home policy, egress profile and proof digests.
- `PreparationGrant`: run/package/preparation IDs, base content digest, role, lane, immutable input digests, allowed proposal output, expiry and stop token. It confers no human decision right.
- `ConfinedToolRequest`: grant ID, operation, normalized relative path or pinned command/tool ID and arguments. No host path, shell fragment, arbitrary executable, credential or network destination from model text.
- `ToolBroker.execute`: validate live grant/lease/role/lane, construct the OS boundary, capture bounded output and append actual tool/version/input/output trace. Recheck stop and base digest at completion.
- `CredentialBroker`: owner-managed provider access outside tool namespaces; endpoint/model/method/body/response budgets explicit. Never serialize provider credentials into jobs, logs, traces or proposals.
- `RuntimeProof`: actual installed native runtime plus negative filesystem/env/home/process/network/credential/role/lane attempts. A synthetic child alone cannot set the profile to proved.

The proposed policy is retained at `.nuclear/changes/platform-buildout/proposals/preparation-runtime.json`; it is not an active floor. Its intended `policies/` target and eventual `tests/redteam/` cases require the human signature in AGENTS.md rule 2. The earlier authorization covers kernel tasks 6–9, not these surfaces.

## Observed evidence and decision

On this host, bubblewrap 0.9.0 and user/mount/network namespaces are available. The reproducible spike `python3 spikes/runtime-confinement/probe.py` passed eight synthetic canary checks: readable immutable input, denied input write, permitted output, hidden host secret, scrubbed environment, isolated HOME, inaccessible host network service and hidden host process. Installed native versions observed: Claude Code 2.1.308 and Codex CLI 0.163.0.

This proves a candidate OS boundary for a Python child on this host. It does not prove authenticated Claude/Codex execution, credential isolation or model egress. Do not copy the spike into the production launcher and call the task complete. Keep assisted preparation on hold until the interfaces/proofs above close.

## Ordered implementation plan

1. Freeze native capability reports from installed help/config and primary provider docs. Test whether each native client can delegate every agent-executable tool to the broker while disabling builtins; retain a binary/version digest. If either cannot, keep that runtime unsupported rather than claiming prompt confinement.
2. Implement `daemon/internal/confinement/{profile,grant,broker,linux}.go` behind inactive profiles. Use explicit argv, minimal mounts/environment, immutable source snapshots and one writable proposal directory. Fail on unsupported OS or missing boundary primitives. Add real negative subprocess tests before wiring adapters.
3. Implement bounded credential/model transport with provider secrets outside tool namespaces. Write canary tests before reading real credentials. Prove that tool calls cannot read broker secrets or make unauthorized provider requests. Keep real credential values out of evidence.
4. Present the concrete policy/profile and red-team patch for the required human signature. Apply to `policies/preparation-runtime.json` and `tests/redteam/preparation/` only after that scoped authorization. Maintain permissive shipped source; the OS tool remains an external system dependency.
5. Wire native adapters individually and run negative tests through actual installed clients. Record provider/model requested/reported, grant IDs and effective capabilities in ExecutionTrace. Do not inherit the owner's config/HOME as an implicit exception.
6. Enable only proved role/lane/runtime combinations; then execute task 11 proposal-only preparation. Missing proof remains an actionable hold.

Each step must leave exact commands/results and a reviewable commit in the parent ledger. No policy activation, secret read, new network grant or assisted dispatch is performed by this investigation.
