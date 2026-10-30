import { expect } from "vitest";
import { type Db, tx } from "../src/db/index.js";
import { migrate } from "../src/db/migrate.js";
import { TENANCY_DOWN_SQL, TENANCY_TABLES } from "../src/db/migrations/009-tenancy.js";
import { WORKBENCH_DOWN_SQL, WORKBENCH_TABLES } from "../src/db/migrations/010-workbench.js";
import { ROLES_DOWN_SQL } from "../src/db/migrations/011-roles.js";
import { verifyChain } from "../src/events.js";
import { backfillTenancy } from "../src/tenancy.js";

/** Tables that existed before migrations 009 and 010, except the event log, compared separately. */
async function legacyTables(db: Db): Promise<string[]> {
  const added = new Set<string>([...TENANCY_TABLES, ...WORKBENCH_TABLES.map((t) => t.name), "schema_migrations", "events"]);
  const r = await db.query<{ t: string }>(
    "select table_name as t from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name",
  );
  return r.rows.map((x) => x.t).filter((t) => !added.has(t));
}

/** Every row of every legacy table, byte for byte, plus the event log. */
async function snapshot(db: Db, tables: string[]) {
  const out: Record<string, string[]> = {};
  for (const t of tables) out[t] = (await db.query<{ r: string }>(`select to_jsonb(x)::text as r from ${t} x order by 1`)).rows.map((x) => x.r);
  out.events = (await db.query<{ r: string }>("select to_jsonb(x)::text as r from events x order by seq")).rows.map((x) => x.r);
  return out;
}

/**
 * Run with the owner (migrator) connection. Reverses migrations 011, 010 and 009 over the history a test built, reapplies them, and checks that
 * every legacy row and every event is unchanged and the chain verifies. `nonEmpty` names tables
 * that must hold rows, so the comparison can never pass on empty collections (review R14).
 */
export async function assertMigrationsPreserveHistory(db: Db, nonEmpty: string[]): Promise<void> {
  const tables = await legacyTables(db);
  const before = await snapshot(db, tables);
  for (const t of [...nonEmpty, "events"]) expect(before[t]?.length ?? 0, `${t} must hold history`).toBeGreaterThan(0);
  expect((await verifyChain(db)).ok).toBe(true);
  await db.query(ROLES_DOWN_SQL);
  await db.query(WORKBENCH_DOWN_SQL);
  await db.query(TENANCY_DOWN_SQL);
  expect(await snapshot(db, tables)).toEqual(before);
  await migrate(db);
  await tx(db, backfillTenancy);
  const after = await snapshot(db, tables);
  const { events: afterEvents = [], ...afterRows } = after;
  const { events: beforeEvents = [], ...beforeRows } = before;
  expect(afterRows).toEqual(beforeRows);
  // Credential records are completed in code after the migration; they append, never rewrite.
  expect(afterEvents.slice(0, beforeEvents.length)).toEqual(beforeEvents);
  expect((await verifyChain(db)).ok).toBe(true);
}
