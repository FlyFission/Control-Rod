# ADR 0021 review adjudication

Independent review by Codex (codex-cli 0.166.0, read only) of ADR 0021, spike S-6 and specification section 23, on 2026-10-30: [codex.md](codex.md). Fourteen findings: thirteen major, one minor. Verdict: the simple login experience is sound as a goal; the security boundary is not yet established; keep the decision conditional until full tool path qualification and fail closed enforcement exist.

Disposition: **accepted**. The ADR stays Proposed and conditional; its claims are narrowed to what S-6 shows; every finding becomes a condition in the ADR and a test in plan task 6.4. Nothing in the findings argues for returning to the relay: each gap applies equally to a relay design, because they concern what agent actions can reach, not where the login lives.

| ID | Disposition | Where it is handled |
|---|---|---|
| S6-01 Other credential locations | Accepted | ADR condition: denied read set covers resolved CLI homes plus common credential stores (`~/.ssh`, `~/.config/gh`, `~/.git-credentials`, `~/.netrc`, cloud CLI folders, keyrings); plan 6.4 decoys in each |
| S6-02 Environment credentials | Accepted | ADR condition: agent actions get an allowlisted environment; plan 6.4 canaries in provider, cloud and proxy variables |
| S6-03 Local sockets and descriptors | Accepted | ADR condition: no Unix sockets for agent actions (SSH agent, keyring, Docker) and socket variables cleared; plan 6.4 tests each |
| S6-04 Claude tool surface | Accepted | ADR condition: explicit tool allowlist; unqualified tools disabled (`WebFetch`, `WebSearch`, `Task`, `NotebookEdit` off until qualified); plan 6.4 tests every enabled tool |
| S6-05 MCP, plugins, hooks, settings | Accepted | ADR condition: Control Rod launches with no ambient MCP, plugins, hooks or user and project settings (`--strict-mcp-config`, `--setting-sources` limited to Control Rod's file; Codex equivalents); plan 6.4 adversarial configs |
| S6-06 Codex agent tools untested | Accepted | Plan 6.4: scripted full `codex exec` sessions forcing `apply_patch` outside the workspace, denied reads, web search and MCP; S-6 claims narrowed to the command wrapper |
| S6-07 Outside writes refused only by unanswered prompt | Accepted | ADR condition: an explicit write boundary (Edit deny outside the workspace; no additional directories); plan 6.4 |
| S6-08 Scorer counted unrelated errors as denial | **Fixed in S-6** | Positive control (unsandboxed probe must read and reach the internet), weakened negative controls, errno based verdicts with "unverifiable" for anything else, proxy refusal recognised only by its 403 message, nonzero exit when any qualification fails. Rerun: all seven qualification checks pass |
| S6-09 Narrow network evidence | Accepted | Plan 6.4: controlled listeners with receiver side observation for TCP, UDP, DNS, IPv6, loopback and LAN, with unsandboxed positive controls |
| S6-10 Narrow write evidence | Accepted | Plan 6.4: symlinks, hard links, traversal, alternate temp roots, WSL Windows mounts and interop bridges |
| S6-11 Effective policy integrity | Accepted | ADR condition: Control Rod derives the effective settings from its own inputs only, records their digest on the run, and refuses unsupported overrides; agents cannot write policy inputs |
| S6-12 Attestation too late | Accepted | ADR condition: qualification and preflight complete before any agent action; a failed in-run probe stops the run, not only its verdict |
| S6-13 Privileged consumers of workspace content | Accepted | ADR condition: project level CLI config, hooks and rules in the workspace are never loaded by Control Rod's launches; host side consumers stay under the git hardening of section 23 |
| S6-14 Overstated coverage; defaults as control | Accepted | S-6 record narrowed; negative control is now a deliberately weakened Control Rod policy, with vendor defaults kept only as an observation |

## Required links

[ADR 0021](../../../../../../docs/adr/0021-native-cli-sandboxes.md), [S-6](../../spikes/s6-native-sandboxes.md), [verification](../../../verification.md).

## Exit criteria

Every finding has a disposition and a place where it is handled.

## Source-lineage note

Review output retained verbatim in `codex.md`; dispositions written by the authoring session for the owner's review.
