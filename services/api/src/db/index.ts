import pg from "pg";
import { PREPARATION_PROTOCOL } from "./migrations/006-compatibility.js";
import { migrate } from "./migrate.js";

export type Db = pg.Pool;
export type Tx = pg.PoolClient;

/** Opens a pool and applies the schema. */
export async function openDb(connectionString: string): Promise<Db> {
  const pool = new pg.Pool({ connectionString, max: 10 });
  try {
    await migrate(pool);
    const { backfillCredentials } = await import("../tenancy.js");
    await tx(pool, backfillCredentials);
  } catch (error) {
    await pool.end();
    throw error;
  }
  return pool;
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
