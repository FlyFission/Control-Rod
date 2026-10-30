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
 * Statements a command may not issue: the executor owns the transaction, and no command changes
 * its role or session. Checked on every statement in the text, after comments are removed.
 */
const FORBIDDEN = [
  /^(begin|start\s+transaction|commit|end|rollback|abort|savepoint|release|prepare\s+transaction|discard|listen|notify|copy)\b/i,
  /^(set|reset)\s+(local\s+|session\s+)?(role|session\s+authorization|all)\b/i,
];
const FORBIDDEN_ANYWHERE = /\bset_config\s*\(\s*'(role|session_authorization)'/i;

/**
 * Splits SQL into statements the way PostgreSQL reads it: semicolons and comment markers inside
 * single quoted strings, dollar quoted bodies and double quoted identifiers are text, not syntax.
 * Comments are dropped. Returns each statement, trimmed.
 */
export function statements(sql: string): string[] {
  const out: string[] = [];
  let cur = "";
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i]!, next = sql[i + 1];
    if (ch === "-" && next === "-") { while (i < sql.length && sql[i] !== "\n") i++; cur += " "; continue; }
    if (ch === "/" && next === "*") {
      let depth = 1; i += 2;
      while (i < sql.length && depth) { if (sql[i] === "/" && sql[i + 1] === "*") { depth++; i += 2; } else if (sql[i] === "*" && sql[i + 1] === "/") { depth--; i += 2; } else i++; }
      cur += " "; continue;
    }
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      while (j < sql.length) { if (sql[j] === ch) { if (sql[j + 1] === ch) { j += 2; continue; } break; } j++; }
      cur += sql.slice(i, j + 1); i = j + 1; continue;
    }
    if (ch === "$") {
      const tag = /^\$[A-Za-z_]?[A-Za-z0-9_]*\$/.exec(sql.slice(i))?.[0];
      if (tag) { const end = sql.indexOf(tag, i + tag.length); const stop = end < 0 ? sql.length : end + tag.length; cur += sql.slice(i, stop); i = stop; continue; }
    }
    if (ch === ";") { out.push(cur.trim()); cur = ""; i++; continue; }
    cur += ch; i++;
  }
  out.push(cur.trim());
  return out.filter((x) => x.length);
}

function refusal(name: string, text: string): string | null {
  for (const s of statements(text)) {
    if (FORBIDDEN.some((re) => re.test(s)) || FORBIDDEN_ANYWHERE.test(s)) return s.slice(0, 60);
  }
  return null;
}

/**
 * What a command receives: a query function and nothing else, for plain SQL text with values. It
 * stops working when the command ends. This catches mistakes in our own command code; the boundary
 * against everything else is the separate reader and writer logins.
 */
function guarded(client: Tx, name: string): { view: Tx; revoke: () => void } {
  let live = true;
  const query = (text: unknown, values?: unknown) => {
    if (!live) throw new Error(`command ${name} has finished; its database client is no longer usable`);
    if (typeof text !== "string") throw new Error(`command ${name} may only pass SQL text to query()`);
    if (values !== undefined && !Array.isArray(values)) throw new Error(`command ${name} may only pass an array of values`);
    const refused = refusal(name, text);
    if (refused !== null) throw new Error(`command ${name} may not run: ${refused}`);
    return values === undefined ? client.query(text) : client.query(text, values);
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
