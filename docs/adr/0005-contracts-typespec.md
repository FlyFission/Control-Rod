# ADR 0005: TypeSpec emitting JSON Schema and OpenAPI

- Status: Accepted; Gate R spike partial, conditions tightened
- Date: 2026-10-22

## Decision
TypeSpec in `spec/` is the single source. It emits JSON Schema 2020-12 for records and OpenAPI 3.1 for APIs, including the daemon link (JSON over HTTPS with mutual TLS). Generated output is committed and CI fails on drift.

## Conditions
TypeSpec's versioning and streaming packages are 0.x and stay pinned. Engineering values are decimal strings with units. RFC 8785 leaves room for implementations to disagree, so every digest implementation enforces one profile and passes the shared vectors in `spec/vectors/canonical-digest.json`: integers only, within +/-(2^53 - 1); no duplicate keys; nesting at most 64; no unpaired surrogates or trailing data. Before this profile, Python kept digits past 2^53 while Go and Rust rounded them, and `{"approved":false,"approved":true}` hashed in Python and Rust but was refused in Go. Every record model is closed (`unevaluatedProperties: false`), so a field the contract does not name is rejected rather than stored; a smuggled `approved_by_agent` flag was accepted before this rule and is now red-team case RT-015.

## Spike evidence
One TypeSpec source emitted JSON Schema and OpenAPI 3.1, and a sample work package loaded in TypeScript, Python, Go and Rust with an identical RFC 8785 digest. Fastify rejected every bad payload, but only with our own Ajv2020 validator; its default Ajv refuses to start on 2020-12 schemas. The generated types are not validation: Go (oapi-codegen) accepted a bad enum, a wrong union variant and an unknown field; Rust (typify) accepted the wrong union variant and silently dropped the unknown field, so a padded record digested the same as the good one; Python (datamodel-codegen) turned a closed object into `extra='allow'` unless forced. The two emitters also disagree: `int64` and `decimal` are strings in JSON Schema and numbers in OpenAPI, and model unions are `anyOf` in one and `oneOf` with a discriminator in the other.

## Contract profile
1. **Validate before decode, in every language.** Every component validates raw JSON against the generated JSON Schema before any typed decode or digest. Generated types are a convenience for reading valid records, never a check.
2. **Types both emitters agree on.** Records use `int32`, strings, booleans, string-literal unions, arrays and closed models. No `int64`, `decimal`, `float` or unions of models; a value that needs one is a decimal string, and a variant is a model with a `kind` field. The current contracts already follow this; a CI check will enforce it.
3. Python models are generated with closed objects forced on (`extra='forbid'`).

## Alternatives considered
Protobuf as a second target (its TypeSpec emitter is a preview), hand-written JSON Schema.
