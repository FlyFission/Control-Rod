import pg from "pg";

/**
 * The writer connection, logged in as controlrod_writer. Only `commands/executor.ts` may import this
 * module; a test enforces it (specification 10.1). Every other module reads through the reader.
 */
export function openWriter(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString, max: 10 });
}
