# ADR 0006: Postgres everywhere, embedded on laptops

- Status: Accepted, pending Gate R test
- Date: 2026-10-22

## Decision
Postgres in every topology, with row-level security on `org_id` and FORCE ROW LEVEL SECURITY for a non-superuser application role. Laptops run real embedded Postgres 17 or later, built by us so bundled OpenSSL and ICU are ours to patch. PGlite is used only for browser demos and tests.

## Alternatives considered
PGlite on laptops: one connection, superuser by default, and no reliable LISTEN for multiple processes.
