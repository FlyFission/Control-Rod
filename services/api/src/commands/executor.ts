import type pg from "pg";
import { type Db, type Tx, tx } from "../db/index.js";
import { WRITER, assertLogin } from "../db/roles.js";
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
 * its role or session. Checked on the statement text the command passes to query().
 */
const FORBIDDEN = [
  /^\s*(begin|start\s+transaction|commit|end|rollback|abort|savepoint|release|prepare\s+transaction|discard)\b/i,
  /^\s*(set|reset)\s+(local\s+|session\s+)?(role|session\s+authorization|all)\b/i,
  /\bset_config\s*\(\s*'(role|session_authorization)'/i,
];

function statementText(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (arg && typeof arg === "object" && typeof (arg as { text?: unknown }).text === "string") return (arg as { text: string }).text;
  return "";
}

/**
 * A view of the writer client that works only while its command runs, exposes no release, and
 * refuses transaction control and role changes. Holding it after the command returns gets nothing.
 */
function guarded(client: Tx, name: string): { view: Tx; revoke: () => void } {
  let live = true;
  const view = new Proxy(client, {
    get(target, prop, receiver) {
      if (!live) throw new Error(`command ${name} has finished; its database client is no longer usable`);
      if (prop === "release" || prop === "connect") throw new Error(`command ${name} cannot ${String(prop)} the writer client`);
      if (prop === "query")
        return (...args: unknown[]) => {
          if (!live) throw new Error(`command ${name} has finished; its database client is no longer usable`);
          const text = statementText(args[0]);
          if (FORBIDDEN.some((re) => re.test(text))) throw new Error(`command ${name} may not run: ${text.slice(0, 60)}`);
          return (target.query as (...a: unknown[]) => unknown).apply(target, args);
        };
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
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
    }
  });
}
