import pg from "pg";

/**
 * The writer connection. Only `commands/executor.ts` may import this module; a test enforces it
 * (specification 10.1). Every other module reads through the reader pool, which cannot write.
 */
export function openWriter(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString, max: 10, options: "-c role=controlrod_writer" });
}
