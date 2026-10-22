# ADR 0005: TypeSpec emitting JSON Schema and OpenAPI

- Status: Accepted
- Date: 2026-10-22

## Decision
TypeSpec in `spec/` is the single source. It emits JSON Schema 2020-12 for records and OpenAPI 3.1 for APIs, including the daemon link (JSON over HTTPS with mutual TLS). Generated output is committed and CI fails on drift.

## Conditions
TypeSpec's versioning and streaming packages are 0.x and stay pinned. Engineering values are decimal strings with units; the digest functions refuse JSON numbers that are not integers. Every record model is closed (`unevaluatedProperties: false`), so a field the contract does not name is rejected rather than stored; a smuggled `approved_by_agent` flag was accepted before this rule and is now red-team case RT-015.

## Alternatives considered
Protobuf as a second target (its TypeSpec emitter is a preview), hand-written JSON Schema.
