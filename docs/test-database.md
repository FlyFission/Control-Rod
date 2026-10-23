# Test database setup

`pnpm --filter @control-rod/api test` runs the real database suite through `tools/test-api.mjs`. No database application behavior is mocked. The controller grant protocol needs PostgreSQL17+ for a server-enforced total transaction timeout.

Selection order:

1. `TEST_DATABASE_URL`: use the caller's isolated test server; it must support PG17 grant tests and database creation/deletion. Never point it at production.
2. `CONTROLROD_TEST_PG_DIR`: explicitly selected PG17+ server/client binary directory; unusable tools refuse.
3. Usable PG17+ host binaries, then usable pinned embedded PG17 binaries.
4. On non-root Linux, build checksum-pinned PostgreSQL17.10 in the user's private `~/.cache/controlrod-test-postgres/` directory. This requires `curl`, `tar`, a C compiler, `make`, Perl, Flex, Bison and M4; missing prerequisites fail with a retained build log. It installs no system packages. The first build downloads source and takes longer; subsequent runs validate the cached program hashes and reuse it. Concurrent source bootstraps fail on an exclusive build lock; inspect stale locks rather than deleting another running build.

The source URL and SHA-256 match the existing packet provenance and the [official published checksum](https://ftp.postgresql.org/pub/source/v17.10/postgresql-17.10.tar.bz2.sha256). Extraction/build occurs only after verification. ICU, TLS and optional compression/XML/LDAP features are disabled in this test-only build to avoid distribution-specific library dependencies. Test clusters bind loopback, use disposable data and are stopped/removed by the harness. This is not a production PostgreSQL configuration or supply-chain attestation.

When a host/source-built tool directory is selected, matching `pg_dump` is supplied automatically and the backup/restore rehearsal runs with the ordinary suite. `CONTROLROD_TEST_PG_BIN` remains an explicit override for the directory containing `pg_dump` and `pg_restore`. A caller relying on working embedded binaries can supply matching client tools explicitly. Direct `vitest` invocation bypasses this bootstrap and requires working tools/libraries or `TEST_DATABASE_URL`.

A changed cached build refuses reuse. Inspect its manifest/log and remove only that user-owned cache directory before rebuilding; do not change the expected source hash to accept unknown bytes. Windows/macOS/root environments need a working existing server/binary path; this fallback is Linux-only.
