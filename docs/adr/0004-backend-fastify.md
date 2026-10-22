# ADR 0004: Plain Fastify for the control plane

- Status: Accepted
- Date: 2026-10-22

## Context
NestJS was first chosen, then reversed after the adversarial review: it adds a second schema system beside the generated JSON Schemas, and its Fastify and auth integrations were beta.

## Decision
The control plane is Fastify on Node.js LTS, validating every request against TypeSpec-generated JSON Schemas with Ajv (draft 2020-12, strict mode).

## Consequences
Structure comes from our own module conventions rather than a framework. Ported Paperclip modules (MIT, Express-based) need light adaptation.
