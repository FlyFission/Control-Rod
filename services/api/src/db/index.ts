import { randomBytes } from "node:crypto";
import pg from "pg";
import { survivesIdleDrops } from "./writer.js";
import { READER, type RoleSecrets, type RoleUrls, WRITER, assertLogin, provisionRoles, roleUrl, verifyRoles } from "./roles.js";
import { PREPARATION_PROTOCOL } from "./migrations/006-compatibility.js";
import { migrate } from "./migrate.js";

export type Db = pg.Pool;
export type Tx = pg.PoolClient;

/**
 * How the application's two logins are obtained: provisioned here with these passwords (a local
 * install, where the app owns the cluster), or given as connection strings an administrator issued.
 */
export interface DbRoles {
  secrets?: RoleSecrets;
  urls?: RoleUrls;
  /** This installation owns the cluster (its embedded database), so it may reset its own logins. */
  ownsCluster?: boolean;
}

/**
 * Opens the database for the application (specification 10.1). The schema is applied as the
 * connecting owner (the migrator). The returned pool is logged in as controlrod_reader and cannot
 * write; the command executor's pool is logged in as controlrod_writer. Startup refuses to continue
 * if either role is stronger than it should be or a pool is not logged in as its role.
 */
export async function openDb(connectionString: string, roles: DbRoles = {}): Promise<Db> {
  const owner = survivesIdleDrops(new pg.Pool({ connectionString, max: 2 }), "migration");
  let reader: Db | undefined;
  try {
    const secrets = roles.secrets ?? { reader: randomBytes(24).toString("hex"), writer: randomBytes(24).toString("hex") };
    if (!roles.urls) await provisionRoles(owner, secrets, { ownsCluster: roles.ownsCluster ?? false });
    await migrate(owner);
    const { ROLES_SQL, WRITER_READ_ONLY_TABLES } = await import("./migrations/011-roles.js");
    // Grants again on every start, not only when migration 011 first runs: a restore made with
    // --no-privileges (docs/owner-pilot.md) keeps 011's record but none of its grants, and the
    // reader and writer would otherwise be refused on every table. Every statement is idempotent.
    await owner.query(ROLES_SQL);
    await verifyRoles(owner, WRITER_READ_ONLY_TABLES);
    const urls = roles.urls ?? { readerUrl: roleUrl(connectionString, READER, secrets.reader), writerUrl: roleUrl(connectionString, WRITER, secrets.writer) };
    reader = survivesIdleDrops(new pg.Pool({ connectionString: urls.readerUrl, max: 10 }), "reader");
    await assertLogin(reader, READER);
    const { attachWriter, command } = await import("../commands/executor.js");
    await attachWriter(reader, urls.writerUrl);
    const { backfillTenancy } = await import("../tenancy.js");
    await command(reader, "migration.backfill-tenancy", backfillTenancy);
    return reader;
  } catch (error) {
    if (reader) await closeDb(reader).catch(() => undefined);
    throw error;
  } finally {
    await owner.end();
  }
}

/** Closes the application's pool and its attached writer. */
export async function closeDb(db: Db): Promise<void> {
  const { closeWriter } = await import("../commands/executor.js");
  await closeWriter(db);
  await db.end();
}

/** A consistent, read only snapshot on the reader: for reads that must see one moment, without locks. */
export async function readTx<T>(db: Db, fn: (c: Tx) => Promise<T>): Promise<T> {
  const c = await db.connect();
  // As in tx: a checked-out client needs its own error listener, or a connection the server ends
  // mid-read (a restart, a fatal deadline) emits an unhandled error and takes the process down.
  // A broken client is destroyed on release, never returned to the pool.
  let broken = false;
  const connectionError = () => {
    broken = true;
  };
  c.on("error", connectionError);
  try {
    await c.query("begin isolation level repeatable read read only");
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (e) {
    if ((e as { severity?: string })?.severity === "FATAL") broken = true;
    if (!broken) await c.query("rollback").catch(() => (broken = true));
    throw e;
  } finally {
    c.off("error", connectionError);
    c.release(broken);
  }
}

/** Runs `fn` in one serializable-enough transaction (row locks are taken explicitly). */
export async function tx<T>(db: Db, fn: (c: Tx) => Promise<T>): Promise<T> {
  const c = await db.connect();
  let broken = false;
  const connectionError = () => {
    broken = true;
  };
  // Checked-out clients need an error listener too: a fatal server deadline
  // closes the socket before a rollback can run. Preserve the original error.
  c.on("error", connectionError);
  try {
    await c.query("begin");
    await c.query(
      "select set_config('controlrod.preparation_protocol',$1,true)",
      [PREPARATION_PROTOCOL],
    );
    const out = await fn(c);
    await c.query("commit");
    const { bus, pendingEvents, afterCommits } = await import("../events.js");
    for (const fn of afterCommits(c).splice(0)) fn();
    for (const e of pendingEvents(c).splice(0)) bus.emit("event", e);
    return out;
  } catch (e) {
    if ((e as { severity?: string })?.severity === "FATAL") broken = true;
    if (!broken) {
      try {
        await c.query("rollback");
      } catch {
        broken = true;
      }
    }
    const { pendingEvents, afterCommits } = await import("../events.js");
    pendingEvents(c).splice(0);
    afterCommits(c).splice(0);
    throw e;
  } finally {
    c.off("error", connectionError);
    c.release(broken);
  }
}
