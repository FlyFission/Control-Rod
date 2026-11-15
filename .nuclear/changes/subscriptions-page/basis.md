# Basis: Settings subscriptions page

**Change slug:** `subscriptions-page`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-15
**Decision this basis supports:** whether the settings page may show provider CLI probes, checker tiers, and vendor-family badges without taking a token.

## Mission / need

Milestone 10 of the multi-provider plan. Settings > Subscriptions shows the provider CLIs the daemon actually registers, the probe the daemon already ran, the static checker list, and vendor-family badges where the UI names who authored or checked. Control Rod does not ask for an API key or a token (ADR 0021).

M1 through M4 are on main: the adapter seam, checker attempts, checker workspace, and run attestation. This change does not edit the kernel.

## What changes

- The daemon builds a subscription report from the runtime probe it already ran. It lists Claude Code and Codex, the adapters that exist. The fake runtime is not listed. An API-key-only CLI is not listed. Auth is signed-in, signed-out, or unknown. Unknown is used when the CLI has no status command, when the CLI is not installed, or when the probe did not reach the status command. The status command's output is not stored.
- Qualification in that report is the milestone record: WSL2 qualifies Claude Code and Codex author launches only; macOS qualifies those author launches only when `CONTROLROD_SEATBELT_QUALIFIED` is exactly `1`; native Linux is not qualified; checker launches are not qualified. `QualifiedPlatform` is unchanged, so macOS and native Linux launches stay refused.
- The checker list is the daemon's model registry (`models.json`). Safety needs 2 checkers from different vendor families. Material and general service need 1. A local model cannot be the deciding checker on Safety or Material.
- `GET /subscriptions` returns the last report, the tier record, and pins. A probe id other than `claude` or `codex`, and any object that carries a token field, is dropped.
- The web page is read-only. Runs, checker attempts, and the agent card show a vendor-family badge for Anthropic and OpenAI. Other provider names get no badge.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The page and `GET /subscriptions` show only probes the daemon reported for registered provider CLIs. No token field is rendered or stored. Unit tests for the probe and the page pass, and the page's axe scan reports no violations. Existing launch behavior is unchanged.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
