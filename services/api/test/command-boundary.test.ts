import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { COMMANDS } from "../src/commands/catalog.js";
import { command } from "../src/commands/executor.js";
import { type Harness, startHarness } from "./harness.js";

/** The command boundary (workbench plan task 1.4; specification 10.1, WB-02). */
const src = fileURLToPath(new URL("../src/", import.meta.url));

function sources(dir = src): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) Object.assign(out, sources(p));
    else if (p.endsWith(".ts") && !p.endsWith(".d.ts")) out[relative(src, p).replaceAll("\\", "/")] = readFileSync(p, "utf8");
  }
  return out;
}

/**
 * The static rules. Pools are pinned to their roles when they connect, but the login behind them is
 * the owner, so these rules are part of the defense: only the executor reaches the writer, only the
 * database layer opens pools or transactions, and no source changes its role.
 */
export function boundaryViolations(files: Record<string, string>): string[] {
  const out: string[] = [];
  const allowed = { writer: ["commands/executor.ts"], tx: ["db/index.ts", "commands/executor.ts"], pool: ["db/index.ts", "db/writer.ts"] };
  for (const [path, text] of Object.entries(files)) {
    if (/from\s+["'][^"']*db\/writer(\.js)?["']/.test(text) && !allowed.writer.includes(path))
      out.push(`${path} imports the writer connection; only commands/executor.ts may`);
    if (/import\s*\{[^}]*\btx\b[^}]*\}\s*from\s*["'][^"']*db\/index(\.js)?["']/.test(text) && !allowed.tx.includes(path))
      out.push(`${path} imports tx; writes go through command() and reads through readTx()`);
    if (/new\s+pg\.Pool\s*\(/.test(text) && !allowed.pool.includes(path))
      out.push(`${path} opens a connection pool; only the database layer may`);
    if (/\b(reset\s+role|set\s+(local\s+)?role|set\s+session\s+authorization)\b/i.test(text))
      out.push(`${path} changes its database role`);
  }
  return out.sort();
}

/** Every `command(db, "name", ...)` call in source, with its file. */
function commandCalls(files: Record<string, string>): Map<string, string[]> {
  const calls = new Map<string, string[]>();
  for (const [path, text] of Object.entries(files))
    for (const m of text.matchAll(/\b(?:command|grantTx)\(\s*\w+(?:\.\w+)*\s*,\s*"([a-z][a-z-]*\.[a-z-]+)"/g))
      calls.set(m[1]!, [...(calls.get(m[1]!) ?? []), path]);
  return calls;
}

describe("static boundary", () => {
  it("holds across the source tree", () => {
    expect(boundaryViolations(sources())).toEqual([]);
  });

  it("fails on each kind of violation", () => {
    expect(boundaryViolations({
      "routes/sneaky.ts": 'import { openWriter } from "../db/writer.js";\nimport { tx } from "../db/index.js";\nconst p = new pg.Pool({});\nawait c.query("reset role");',
    })).toEqual([
      "routes/sneaky.ts changes its database role",
      "routes/sneaky.ts imports the writer connection; only commands/executor.ts may",
      "routes/sneaky.ts imports tx; writes go through command() and reads through readTx()",
      "routes/sneaky.ts opens a connection pool; only the database layer may",
    ]);
  });

  it("names every command in the catalog, and the catalog lists only commands in use", () => {
    const calls = commandCalls(sources());
    expect([...calls.keys()].sort()).toEqual(Object.keys(COMMANDS).sort());
  });
});

describe("database roles", () => {
  let h: Harness;
  beforeAll(async () => {
    h = await startHarness();
  }, 120_000);
  afterAll(async () => h?.stop());

  it("refuses every write through the application's reader pool", async () => {
    expect((await h.db.query("select current_user as u")).rows[0].u).toBe("controlrod_reader");
    await expect(h.db.query("insert into captures (id, body, created_at) values ('cap_r', '{}', now())")).rejects.toThrow(/permission denied/);
    await expect(h.db.query("update settings set value = value")).rejects.toThrow(/permission denied/);
    await expect(h.db.query("delete from sessions")).rejects.toThrow(/permission denied/);
    await expect(h.db.query("select * from packages for update")).rejects.toThrow(/permission denied/);
    await expect(h.db.query("create table sneaky (x int)")).rejects.toThrow(/permission denied/);
    // Reads still work.
    expect((await h.db.query("select count(*)::int as n from packages")).rows[0].n).toBeGreaterThanOrEqual(0);
  });

  it("writes only through a named command, which the database can see", async () => {
    const seen = await command(h.db, "runtime.report-status", async (c) => {
      await c.query("insert into settings (key, value) values ('runtime_status', '{}') on conflict (key) do update set value = excluded.value");
      return (await c.query("select current_user as u, current_setting('controlrod.command') as cmd")).rows[0];
    });
    expect(seen).toEqual({ u: "controlrod_writer", cmd: "runtime.report-status" });
    await expect(command(h.db, "not.a-command" as never, async () => undefined)).rejects.toThrow(/unknown command/);
  });

  it("keeps the writer away from the migration record", async () => {
    await expect(command(h.db, "runtime.report-status", (c) => c.query("delete from schema_migrations"))).rejects.toThrow(/permission denied/);
  });
});

describe("faults are not refusals", () => {
  it("reports a database fault in the preparation guard as a fault, not as a stale preparation", async () => {
    const pg = (await import("pg")).default;
    const { staleUnlessDatabaseFault } = await import("../src/preparation/lifecycle.js");
    const { Refusal } = await import("../src/work.js");
    const fault = new pg.DatabaseError("permission denied for table packages", 0, "error");
    expect(staleUnlessDatabaseFault(fault)).toBe(fault);
    const stale = staleUnlessDatabaseFault(new Error("Release manifest changed or is missing"));
    expect(stale).toBeInstanceOf(Refusal);
    expect(stale).toMatchObject({ status: 409, code: "preparation-stale" });
  });
});
