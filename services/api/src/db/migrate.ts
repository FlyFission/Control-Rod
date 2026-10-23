import { createHash } from "node:crypto";
import type { Db } from "./index.js";
import { SCHEMA } from "./schema.js";
import { PREPARATION_SQL } from "./migrations/001-preparation.js";
export const MIGRATIONS = [
  { version: "000-legacy-baseline", sql: SCHEMA },
  { version: "001-preparation", sql: PREPARATION_SQL },
] as const;

/** Transactional, ordered and checksum-locked. Unknown newer migrations refuse startup. */
export async function migrate(db: Db, migrations: readonly {version:string;sql:string}[] = MIGRATIONS): Promise<void> {
  const c = await db.connect();
  try {
    await c.query("begin");
    await c.query("select pg_advisory_xact_lock(hashtext('controlrod-schema-migrations'))");
    await c.query("create table if not exists schema_migrations(version text primary key, checksum text not null, applied_at timestamptz not null default now())");
    const applied = (await c.query<{version:string;checksum:string}>("select version,checksum from schema_migrations order by version")).rows;
    if (new Set(migrations.map(m=>m.version)).size !== migrations.length || migrations.some((m,i)=>i>0 && m.version <= migrations[i-1]!.version)) throw new Error("Migration registry must be unique and ordered");
    for (let i=0;i<applied.length;i++) if (applied[i]!.version !== migrations[i]?.version) throw new Error("Unknown/newer or noncontiguous database migrations; refusing startup");
    for (const m of migrations) {
      const checksum = createHash("sha256").update(m.sql).digest("hex");
      const previous = applied.find(a=>a.version===m.version);
      if (previous) { if (previous.checksum !== checksum) throw new Error(`Migration checksum drift: ${m.version}`); continue; }
      await c.query(m.sql);
      await c.query("insert into schema_migrations(version,checksum) values($1,$2)",[m.version,checksum]);
    }
    await c.query("commit");
  } catch(e) { await c.query("rollback"); throw e; }
  finally { c.release(); }
}
