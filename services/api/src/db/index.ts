import { randomBytes } from "node:crypto";
import pg from "pg";
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
}

/**
 * Opens the database for the application (specification 10.1). The schema is applied as the
 * connecting owner (the migrator). The returned pool is logged in as controlrod_reader and cannot
 * write; the command executor's pool is logged in as controlrod_writer. Startup refuses to continue
 * if either role is stronger than it should be or a pool is not logged in as its role.
 */
export async function openDb(connectionString: string, roles: DbRoles = {}): Promise<Db> {
  const owner = new pg.Pool({ connectionString, max: 2 });
  let reader: Db | undefined;
  try {
    const secrets = roles.secrets ?? { reader: randomBytes(24).toString("hex"), writer: randomBytes(24).toString("hex") };
    if (!roles.urls) await provisionRoles(owner, secrets);
    await migrate(owner);
    await verifyRoles(owner);
    const urls = roles.urls ?? { readerUrl: roleUrl(connectionString, READER, secrets.reader), writerUrl: roleUrl(connectionString, WRITER, secrets.writer) };
    reader = new pg.Pool({ connectionString: urls.readerUrl, max: 10 });
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
  try {
    await c.query("begin isolation level repeatable read read only");
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (e) {
    await c.query("rollback").catch(() => undefined);
    throw e;
  } finally {
    c.release();
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
    const { bus, pendingEvents } = await import("../events.js");
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
    const { pendingEvents } = await import("../events.js");
    pendingEvents(c).splice(0);
    throw e;
  } finally {
    c.off("error", connectionError);
    c.release(broken);
  }
}
