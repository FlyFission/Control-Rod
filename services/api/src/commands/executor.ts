import type pg from "pg";
import { type Db, type Tx, tx } from "../db/index.js";
import { openWriter } from "../db/writer.js";
import { COMMANDS, type CommandName } from "./catalog.js";

/**
 * The command executor (specification 10.1). Every controlled write runs here, in one transaction
 * on the writer connection, named by a catalog entry. The application's ordinary pool is the
 * reader, which the database refuses to let write.
 */
const writers = new WeakMap<Db, pg.Pool>();

/** Attaches a writer pool to a reader pool. Called once by `openDb`. */
export function attachWriter(reader: Db, connectionString: string): void {
  writers.set(reader, openWriter(connectionString));
}

export async function closeWriter(reader: Db): Promise<void> {
  const w = writers.get(reader);
  writers.delete(reader);
  await w?.end();
}

/** Runs one named command in a writer transaction. The command name is visible to the database. */
export async function command<T>(reader: Db, name: CommandName, fn: (c: Tx) => Promise<T>): Promise<T> {
  if (!(name in COMMANDS)) throw new Error(`unknown command ${name}`);
  const writer = writers.get(reader);
  if (!writer) throw new Error("no writer attached to this database");
  return tx(writer, async (c) => {
    await c.query("select set_config('controlrod.command', $1, true)", [name]);
    return fn(c);
  });
}
