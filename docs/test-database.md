# Test database setup

`pnpm --filter @control-rod/api test` runs the real database suite through `tools/test-api.mjs`. No database application behavior is mocked. The controller grant protocol needs PostgreSQL17+ for a server-enforced total transaction timeout.

Selection order:

1. `TEST_DATABASE_URL`: use the caller's isolated test server; it must support PG17 grant tests and database creation/deletion. Never point it at production.
2. `CONTROLROD_TEST_PG_SERVER=bundled`: the bundled embedded PG17, even where the host has a PostgreSQL of its own. CI uses this. As root the bundled server is always used, since a host server does not start as root.
3. `CONTROLROD_TEST_PG_DIR`: an explicitly selected folder of PG17+ server programs (`initdb`, `postgres`, `pg_ctl`); unusable programs refuse.
4. Usable PG17+ host server programs (the newest first), then the bundled embedded PG17, the same one `controlrod start` runs. It ships the server programs only, which is all the suite needs.
5. On non-root Linux, build checksum-pinned PostgreSQL17.10 in the user's private `~/.cache/controlrod-test-postgres/` directory. This requires `curl`, `tar`, `bzip2`, a C compiler (`cc`), `make`, Perl, Flex, Bison and M4. They are checked before anything is downloaded, and a missing one is named; a build that still fails keeps its log. It installs no system packages. The first build downloads source and takes longer; subsequent runs validate the cached program hashes and reuse it. Concurrent source bootstraps fail on an exclusive build lock; inspect stale locks rather than deleting another running build.

The source URL and SHA-256 match the existing packet provenance and the [official published checksum](https://ftp.postgresql.org/pub/source/v17.10/postgresql-17.10.tar.bz2.sha256). Extraction/build occurs only after verification. ICU, TLS and optional compression/XML/LDAP features are disabled in this test-only build to avoid distribution-specific library dependencies. Test clusters bind loopback, use disposable data and are stopped/removed by the harness. This is not a production PostgreSQL configuration or supply-chain attestation.

The backup and restore rehearsal (`test/preparation-recovery.test.ts`) also needs `pg_dump` and `pg_restore` of the same major version as the test server, since `pg_dump` refuses a server of another major version. They are taken from the selected server folder when it has them, otherwise from the host (`/usr/lib/postgresql/*/bin`, then `PATH`), matching that version; `CONTROLROD_TEST_PG_BIN` names their folder explicitly, and a folder of another major version is refused before any test runs. The rehearsal checks the version again against the running server before it starts. When none is found, the rehearsal alone is skipped and the bootstrap says so; every other test still runs. Set `CONTROLROD_TEST_REQUIRE_PG_CLIENT=1` to fail instead, as CI does. Direct `vitest` invocation bypasses this bootstrap and requires working tools/libraries or `TEST_DATABASE_URL`.

A changed cached build refuses reuse. Inspect its manifest/log and remove only that user-owned cache directory before rebuilding; do not change the expected source hash to accept unknown bytes. Windows/macOS/root environments need a working existing server/binary path; this fallback is Linux-only.
