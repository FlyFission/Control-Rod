import { createHash } from "node:crypto";
import type { Db } from "./index.js";
import { SCHEMA } from "./schema.js";
import { PREPARATION_SQL } from "./migrations/001-preparation.js";
import { CONFIRMATION_SQL } from "./migrations/002-confirmation.js";
import { RELEASE_SQL } from "./migrations/003-release.js";
import { BASIS_SQL } from "./migrations/004-basis.js";
import { RESULTS_SQL } from "./migrations/005-results.js";
import { COMPATIBILITY_SQL } from "./migrations/006-compatibility.js";
import { DEPENDENCY_INPUT_SQL } from "./migrations/007-dependency-inputs.js";
import { GRANT_SQL } from "./migrations/008-preparation-grants.js";
import { TENANCY_SQL } from "./migrations/009-tenancy.js";
import { WORKBENCH_SQL } from "./migrations/010-workbench.js";
import { ROLES_SQL } from "./migrations/011-roles.js";
import { ADMINISTRATION_SQL } from "./migrations/012-administration.js";
import { DEPENDENCIES_SQL } from "./migrations/013-dependencies.js";
import { RUN_EVENTS_SQL } from "./migrations/014-run-events.js";
import { SCRAM_SQL } from "./migrations/015-scram.js";
import { CHAIN_SEALS_SQL } from "./migrations/016-chain-seals.js";
import { USAGE_ONCE_SQL } from "./migrations/017-usage-once.js";
import { SESSION_CREDENTIALS_SQL } from "./migrations/018-session-credentials.js";
import { WORKBENCH_LINKS_SQL } from "./migrations/019-workbench-links.js";
import { CHECKER_ATTEMPTS_SQL } from "./migrations/020-checker-attempts.js";
import { CHECKER_QUEUED_DIGESTS_SQL } from "./migrations/021-checker-queued-digests.js";
import { CHECKER_NO_TRUNCATE_SQL } from "./migrations/022-checker-no-truncate.js";
import { RUN_ATTESTATION_SQL } from "./migrations/023-run-attestation.js";
import { CONTEXT_PROFILE_SQL } from "./migrations/024-context-profile.js";
import { DEPENDENCY_PROVENANCE_SQL } from "./migrations/025-dependency-provenance.js";
import { DEFAULT_WORKFLOW_SQL } from "./migrations/026-default-workflow.js";
import { WORK_LANES_SQL } from "./migrations/027-work-lanes.js";
export const MIGRATIONS = [
  { version: "000-legacy-baseline", sql: SCHEMA },
  { version: "001-preparation", sql: PREPARATION_SQL },
  { version: "002-confirmation", sql: CONFIRMATION_SQL },
  { version: "003-release", sql: RELEASE_SQL },
  { version: "004-basis", sql: BASIS_SQL },
  { version: "005-results", sql: RESULTS_SQL },
  { version: "006-compatibility", sql: COMPATIBILITY_SQL },
  { version: "007-dependency-inputs", sql: DEPENDENCY_INPUT_SQL },
  { version: "008-preparation-grants", sql: GRANT_SQL },
  { version: "009-tenancy", sql: TENANCY_SQL },
  { version: "010-workbench", sql: WORKBENCH_SQL },
  { version: "011-roles", sql: ROLES_SQL },
  { version: "012-administration", sql: ADMINISTRATION_SQL },
  { version: "013-dependencies", sql: DEPENDENCIES_SQL },
  { version: "014-run-events", sql: RUN_EVENTS_SQL },
  { version: "015-scram", sql: SCRAM_SQL },
  { version: "016-chain-seals", sql: CHAIN_SEALS_SQL },
  { version: "017-usage-once", sql: USAGE_ONCE_SQL },
  { version: "018-session-credentials", sql: SESSION_CREDENTIALS_SQL },
  { version: "019-workbench-links", sql: WORKBENCH_LINKS_SQL },
  { version: "020-checker-attempts", sql: CHECKER_ATTEMPTS_SQL },
  { version: "021-checker-queued-digests", sql: CHECKER_QUEUED_DIGESTS_SQL },
  { version: "022-checker-no-truncate", sql: CHECKER_NO_TRUNCATE_SQL },
  { version: "023-run-attestation", sql: RUN_ATTESTATION_SQL },
  { version: "024-context-profile", sql: CONTEXT_PROFILE_SQL },
  { version: "025-dependency-provenance", sql: DEPENDENCY_PROVENANCE_SQL },
  { version: "026-default-workflow", sql: DEFAULT_WORKFLOW_SQL },
  { version: "027-work-lanes", sql: WORK_LANES_SQL },
] as const;

/** Transactional, ordered and checksum-locked. Unknown newer migrations refuse startup. */
export async function migrate(
  db: Db,
  migrations: readonly { version: string; sql: string }[] = MIGRATIONS,
): Promise<void> {
  const c = await db.connect();
  let broken = false;
  const connectionError = () => {
    broken = true;
  };
  c.on("error", connectionError);
  try {
    await c.query("begin");
    await c.query(
      "select pg_advisory_xact_lock(hashtext('controlrod-schema-migrations'))",
    );
    await c.query(
      "create table if not exists schema_migrations(version text primary key, checksum text not null, applied_at timestamptz not null default now())",
    );
    const applied = (
      await c.query<{ version: string; checksum: string }>(
        "select version,checksum from schema_migrations order by version",
      )
    ).rows;
    if (
      new Set(migrations.map((m) => m.version)).size !== migrations.length ||
      migrations.some(
        (m, i) => i > 0 && m.version <= migrations[i - 1]!.version,
      )
    )
      throw new Error("Migration registry must be unique and ordered");
    for (let i = 0; i < applied.length; i++)
      if (applied[i]!.version !== migrations[i]?.version)
        throw new Error(
          "Unknown/newer or noncontiguous database migrations; refusing startup",
        );
    for (const m of migrations) {
      const checksum = createHash("sha256").update(m.sql).digest("hex");
      const previous = applied.find((a) => a.version === m.version);
      if (previous) {
        if (previous.checksum !== checksum)
          throw new Error(`Migration checksum drift: ${m.version}`);
        continue;
      }
      await c.query(m.sql);
      await c.query(
        "insert into schema_migrations(version,checksum) values($1,$2)",
        [m.version, checksum],
      );
    }
    await c.query("commit");
  } catch (e) {
    if ((e as { severity?: string })?.severity === "FATAL") broken = true;
    if (!broken) await c.query("rollback").catch(() => (broken = true));
    throw e;
  } finally {
    c.off("error", connectionError);
    c.release(broken);
  }
}
