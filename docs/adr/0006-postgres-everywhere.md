# ADR 0006: Postgres everywhere, embedded on laptops

- Status: Accepted; Gate R spike passed with conditions
- Date: 2026-10-22

## Decision
Postgres in every topology, with row-level security on `org_id` and FORCE ROW LEVEL SECURITY for a non-superuser application role. Laptops run real embedded Postgres 17 or later, built by us so bundled OpenSSL and ICU are ours to patch. PGlite is used only for browser demos and tests.

## Spike evidence
Offline, embedded Postgres served Node (pg), Go (pgx) and Python (psycopg) at once with independent transactions, cross-language LISTEN/NOTIFY, and RLS isolation; seven bypass attempts failed, and FORCE RLS was required to stop the owning role reading every row. Startup was 1.4 to 5.3 s for initdb and under 0.5 s for start on a shared machine. The Rust `postgresql_embedded` crate with its `bundled` feature also ran offline. PGlite's socket server shared one session across clients and serialized their transactions, confirming it is unfit for multi-process laptops.

## Conditions
1. **Org identity is bound to the login role, never to a session setting alone.** A client that can run SQL can set `app.org_id` to any value, and the spike read another org's rows that way. Policies check role membership (`pg_has_role`) or a value only a trusted pooler can set, and agent-facing code never receives a raw SQL connection.
2. **LISTEN/NOTIFY carries no tenant data.** Postgres has no access control on channels, so notifications carry opaque IDs and the reader fetches the row through RLS.
3. **We build our own Postgres binaries.** The npm package ships OpenSSL 1.1.1 (end of life) and ICU 60 and tags every release beta; upstream crate packaging differs by release.
4. A red-team case covers each of conditions 1 and 2.

## Alternatives considered
PGlite on laptops: one shared session, serialized transactions, superuser by default, and no reliable LISTEN for multiple processes.
