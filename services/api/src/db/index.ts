import pg from "pg";
import { SCHEMA } from "./schema.js";

export type Db = pg.Pool;
export type Tx = pg.PoolClient;

/** Opens a pool and applies the schema. */
export async function openDb(connectionString: string): Promise<Db> {
  const pool = new pg.Pool({ connectionString, max: 10 });
  await pool.query(SCHEMA);
  return pool;
}

/** Runs `fn` in one serializable-enough transaction (row locks are taken explicitly). */
export async function tx<T>(db: Db, fn: (c: Tx) => Promise<T>): Promise<T> {
  const c = await db.connect();
  try {
    await c.query("begin");
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
