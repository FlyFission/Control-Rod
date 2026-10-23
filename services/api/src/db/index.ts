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
  } catch (error) {
    await pool.end();
    throw error;
  }
  return pool;
}

/** Runs `fn` in one serializable-enough transaction (row locks are taken explicitly). */
export async function tx<T>(db: Db, fn: (c: Tx) => Promise<T>): Promise<T> {
  const c = await db.connect();
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
    await c.query("rollback");
    const { pendingEvents } = await import("../events.js");
    pendingEvents(c).splice(0);
    throw e;
  } finally {
    c.release();
  }
}
