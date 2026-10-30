import pg from "pg";
import { PREPARATION_PROTOCOL } from "./migrations/006-compatibility.js";
import { migrate } from "./migrate.js";

export type Db = pg.Pool;
export type Tx = pg.PoolClient;

/**
 * Applies the schema as the connecting owner (the migrator), then returns the application's pool,
 * which connects as controlrod_reader and cannot write. Writes go through the command executor,
 * whose writer pool is attached here (specification 10.1).
 */
export async function openDb(connectionString: string): Promise<Db> {
  const migrator = new pg.Pool({ connectionString, max: 2 });
  try {
    await migrate(migrator);
    const { backfillCredentials } = await import("../tenancy.js");
    await tx(migrator, backfillCredentials);
  } finally {
    await migrator.end();
  }
  const reader = new pg.Pool({ connectionString, max: 10, options: "-c role=controlrod_reader" });
  const { attachWriter } = await import("../commands/executor.js");
  attachWriter(reader, connectionString);
  return reader;
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
