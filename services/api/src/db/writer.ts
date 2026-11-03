import pg from "pg";

/**
 * The writer connection, logged in as controlrod_writer. Only `commands/executor.ts` may import this
 * module; a test enforces it (specification 10.1). Every other module reads through the reader.
 */
export function openWriter(connectionString: string): pg.Pool {
  return survivesIdleDrops(new pg.Pool({ connectionString, max: 10 }), "writer");
}

/**
 * A pool reports an idle connection the server dropped (a restart or an administrator's shutdown)
 * as an error event; without a listener Node treats it as uncaught and the process exits. The pool
 * discards that connection and opens a new one on next use, so it is noted and the work goes on.
 */
export function survivesIdleDrops(pool: pg.Pool, name: string): pg.Pool {
  pool.on("error", (e) => process.stderr.write(`[control-rod] the database dropped an idle ${name} connection (${e.message}); a new one opens on next use\n`));
  return pool;
}
