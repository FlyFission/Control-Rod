import type { Tx } from "./db/index.js";

/**
 * The marking graph lock (specification 11.3; see services/api/src/markings.ts). Commands that may
 * change markings hold it exclusively and commands that disclose content by lane hold it shared,
 * both taken by the command executor before anything else, so the lock order is the same everywhere.
 * The two key advisory lock form lets a marking writer confirm the lock is held.
 */
const CLASS = 7300;
const OBJECT = 1;

export async function takeMarkingWrite(c: Tx): Promise<void> {
  await c.query("select pg_advisory_xact_lock($1::int, $2::int)", [CLASS, OBJECT]);
}

export async function takeMarkingRead(c: Tx): Promise<void> {
  await c.query("select pg_advisory_xact_lock_shared($1::int, $2::int)", [CLASS, OBJECT]);
}

/** Refuses a marking change made outside a command that took the lock first, which could deadlock. */
export async function assertMarkingWrite(c: Tx): Promise<void> {
  const r = await c.query(
    `select 1 from pg_locks where locktype = 'advisory' and pid = pg_backend_pid() and granted
        and classid = $1 and objid = $2 and objsubid = 2 and mode = 'ExclusiveLock'`, [CLASS, OBJECT]);
  if (!r.rowCount) throw new Error("a marking change must run in a command whose catalog entry declares markings: \"write\"");
}
