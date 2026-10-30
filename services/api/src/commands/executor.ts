import type pg from "pg";
import { type Db, type Tx, tx } from "../db/index.js";
import { WRITER, assertLogin } from "../db/roles.js";
import { pendingEvents } from "../events.js";
import { openWriter } from "../db/writer.js";
import { COMMANDS, type CommandName } from "./catalog.js";

/**
 * The command executor (specification 10.1). Every controlled write runs here, in one transaction on
 * the writer login, named by a catalog entry. The application's ordinary pool is the reader login,
 * which the database refuses to let write.
 */
const writers = new WeakMap<Db, pg.Pool>();

/** Attaches a writer pool to a reader pool, after proving it is logged in as the writer. */
export async function attachWriter(reader: Db, connectionString: string): Promise<void> {
  const writer = openWriter(connectionString);
  try {
    await assertLogin(writer, WRITER);
  } catch (e) {
    await writer.end();
    throw e;
  }
  writers.set(reader, writer);
}

export async function closeWriter(reader: Db): Promise<void> {
  const w = writers.get(reader);
  writers.delete(reader);
  await w?.end();
}

/**
 * Statements a command may not issue: the executor owns the transaction. Each command query is sent
 * through the extended protocol, where PostgreSQL itself refuses more than one statement, so only the
 * first word of that one statement needs checking. Role and session changes need no check here: the
 * writer login belongs to no role, so the database refuses them.
 */
const FORBIDDEN_FIRST_WORDS = new Set([
  "begin", "start", "commit", "end", "rollback", "abort", "savepoint", "release", "prepare", "discard", "listen", "notify", "copy",
]);

/**
 * The first word of a statement, skipping what PostgreSQL skips before it: its whitespace (space,
 * tab, newline, carriage return, form feed, vertical tab), line comments (ended by a newline or a
 * carriage return), nested block comments, and empty statements.
 */
export function firstWord(sql: string): string {
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i]!;
    if (" \t\n\r\f\v;".includes(ch)) { i++; continue; }
    if (sql.startsWith("--", i)) { while (i < sql.length && sql[i] !== "\n" && sql[i] !== "\r") i++; continue; }
    if (sql.startsWith("/*", i)) {
      let depth = 1; i += 2;
      while (i < sql.length && depth) { if (sql.startsWith("/*", i)) { depth++; i += 2; } else if (sql.startsWith("*/", i)) { depth--; i += 2; } else i++; }
      continue;
    }
    break;
  }
  return /^[A-Za-z_]+/.exec(sql.slice(i))?.[0].toLowerCase() ?? "";
}

/**
 * What a command receives: a query function and nothing else, for one plain SQL statement with
 * values. It stops working when the command ends. This catches mistakes in our own command code; the
 * boundary against everything else is the separate reader and writer logins.
 */
function guarded(client: Tx, name: string): { view: Tx; revoke: () => void } {
  let live = true;
  const query = (text: unknown, values?: unknown) => {
    if (!live) throw new Error(`command ${name} has finished; its database client is no longer usable`);
    if (typeof text !== "string") throw new Error(`command ${name} may only pass SQL text to query()`);
    if (values !== undefined && !Array.isArray(values)) throw new Error(`command ${name} may only pass an array of values`);
    const first = firstWord(text);
    if (FORBIDDEN_FIRST_WORDS.has(first)) throw new Error(`command ${name} may not run a ${first.toUpperCase()} statement`);
    // Extended protocol: one statement per query, enforced by PostgreSQL.
    return client.query({ text, values: (values as unknown[] | undefined) ?? [], queryMode: "extended" } as never);
  };
  // Only query() exists on the view; any other client method is simply absent.
  const view = { query } as unknown as Tx;
  return { view, revoke: () => { live = false; } };
}

/** Runs one named command in a writer transaction. The command name is visible to the database. */
export async function command<T>(reader: Db, name: CommandName, fn: (c: Tx) => Promise<T>): Promise<T> {
  if (!(name in COMMANDS)) throw new Error(`unknown command ${name}`);
  const writer = writers.get(reader);
  if (!writer) throw new Error("no writer attached to this database");
  return tx(writer, async (c) => {
    await c.query("select set_config('controlrod.command', $1, true)", [name]);
    const { view, revoke } = guarded(c, name);
    try {
      return await fn(view);
    } finally {
      revoke();
      // Events the command appended are announced by tx() after commit, from the real client.
      pendingEvents(c).push(...pendingEvents(view).splice(0));
    }
  });
}
