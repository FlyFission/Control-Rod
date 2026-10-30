import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { COMMANDS } from "../src/commands/catalog.js";
import { command } from "../src/commands/executor.js";
import { WRITER_READ_ONLY_TABLES } from "../src/db/migrations/011-roles.js";
import { READER, RoleSetupError, WRITER, provisionRoles, roleUrl, verifyRoles } from "../src/db/roles.js";
import { type Harness, TEST_ROLE_SECRETS, startHarness } from "./harness.js";

/** The command boundary (workbench plan task 1.4; specification 10.1, WB-02; review SEC-01 to SEC-09). */
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
 * Static rules, a second line behind the database: the logins are the boundary (the reader and
 * writer belong to no role, so nothing can switch them), and these rules keep code from routing
 * around the executor in ways the database would still allow, such as opening its own pools.
 */
export function boundaryViolations(files: Record<string, string>): string[] {
  const out: string[] = [];
  const writerOk = ["commands/executor.ts"];
  const txOk = ["db/index.ts", "commands/executor.ts"];
  const poolOk = ["db/index.ts", "db/writer.ts", "db/roles.ts"];
  const writerModule = /["'][^"']*db\/writer(\.js)?["']/;
  for (const [path, text] of Object.entries(files)) {
    const importsWriter = [...text.matchAll(/(?:from\s*|import\s*\(\s*|require\s*\(\s*)(["'][^"']+["'])/g)].some((m) => writerModule.test(m[1]!));
    if (importsWriter && !writerOk.includes(path)) out.push(`${path} imports the writer connection; only commands/executor.ts may`);
    const importsTx = /import\s*\{[^}]*\btx\b[^}]*\}\s*from\s*["'][^"']*db\/index(\.js)?["']/.test(text)
      || /import\s*\*\s*as\s+\w+\s+from\s*["'][^"']*db\/index(\.js)?["']/.test(text)
      || /import\s*\(\s*["'][^"']*db\/index(\.js)?["']\s*\)[\s\S]{0,80}\btx\b/.test(text);
    if (importsTx && !txOk.includes(path)) out.push(`${path} imports tx; writes go through command() and reads through readTx()`);
    if (/new\s+(pg\.)?(Pool|Client)\s*\(/.test(text) && !poolOk.includes(path)) out.push(`${path} opens a database connection; only the database layer may`);
    if (/\b(reset\s+role|set\s+(local\s+|session\s+)?role|set\s+session\s+authorization)\b/i.test(text) || /set_config\s*\(\s*'(role|session_authorization)'/i.test(text))
      out.push(`${path} changes its database role`);
    if (/\.query\(\s*["'`]\s*(begin|commit|rollback|start\s+transaction)\b/i.test(text) && !txOk.includes(path) && path !== "db/migrate.ts")
      out.push(`${path} controls a transaction itself`);
  }
  return out.sort();
}

/** Every `command(db, "name", ...)` or `grantTx(db, "name", ...)` call in source, with its file. */
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

  it.each([
    ["named writer import", 'import { openWriter } from "../db/writer.js";', /imports the writer/],
    ["namespace writer import", 'import * as w from "../db/writer.js";', /imports the writer/],
    ["dynamic writer import", 'const w = await import("../db/writer.js");', /imports the writer/],
    ["named tx import", 'import { tx } from "../db/index.js";', /imports tx/],
    ["namespace db import", 'import * as dbx from "../db/index.js";', /imports tx/],
    ["pg.Pool", "const p = new pg.Pool({});", /opens a database connection/],
    ["bare Pool", "const p = new Pool({});", /opens a database connection/],
    ["pg.Client", "const p = new pg.Client({});", /opens a database connection/],
    ["reset role", 'await c.query("reset role");', /changes its database role/],
    ["set_config role", "await c.query(\"select set_config('role','controlrod_writer',false)\");", /changes its database role/],
    ["raw begin", 'await c.query("begin");', /controls a transaction/],
  ])("fails on a %s", (_label, code, message) => {
    const found = boundaryViolations({ "routes/sneaky.ts": code });
    expect(found.some((f) => message.test(f)), JSON.stringify(found)).toBe(true);
  });

  it("names every command in the catalog, and the catalog lists only commands in use", () => {
    expect([...commandCalls(sources()).keys()].sort()).toEqual(Object.keys(COMMANDS).sort());
  });
});

describe("database logins", () => {
  let h: Harness;
  beforeAll(async () => {
    h = await startHarness();
  }, 120_000);
  afterAll(async () => h?.stop());

  it("logs the application in as the reader, which cannot write", async () => {
    expect((await h.db.query("select session_user as s, current_user as u")).rows[0]).toEqual({ s: READER, u: READER });
    await expect(h.db.query("insert into captures (id, body, created_at) values ('cap_r', '{}', now())")).rejects.toThrow(/permission denied/);
    await expect(h.db.query("update settings set value = value")).rejects.toThrow(/permission denied/);
    await expect(h.db.query("delete from sessions")).rejects.toThrow(/permission denied/);
    await expect(h.db.query("select * from packages for update")).rejects.toThrow(/permission denied/);
    await expect(h.db.query("create table sneaky (x int)")).rejects.toThrow(/permission denied/);
    expect((await h.db.query("select count(*)::int as n from packages")).rows[0].n).toBeGreaterThanOrEqual(0);
  });

  it("SEC-01: the reader cannot switch to the writer or the owner, by any spelling", async () => {
    const c = await h.db.connect();
    try {
      await expect(c.query("select set_config('role', 'controlrod_writer', false)")).rejects.toThrow(/permission denied to set role/);
      await expect(c.query("set role controlrod_writer")).rejects.toThrow(/permission denied to set role/);
      await expect(c.query("set role controlrod")).rejects.toThrow(/permission denied to set role/);
      await expect(c.query("set session authorization controlrod_writer")).rejects.toThrow(/permission denied/);
      await c.query("reset role");
      expect((await c.query("select current_user as u")).rows[0].u).toBe(READER);
      await expect(c.query("insert into captures (id, body, created_at) values ('cap_r2', '{}', now())")).rejects.toThrow(/permission denied/);
    } finally {
      c.release();
    }
  });

  it("SEC-02: a connection string that smuggles a role option cannot escalate the reader", async () => {
    const url = new URL(roleUrl(h.admin.options.connectionString as string, READER, TEST_ROLE_SECRETS.reader));
    url.searchParams.set("options", "-c role=controlrod_writer");
    const smuggled = new pg.Pool({ connectionString: url.toString(), max: 1 });
    try {
      await expect(smuggled.query("select 1")).rejects.toThrow(/permission denied to set role/);
    } finally {
      await smuggled.end();
    }
  });

  it("writes only through a named command, logged in as the writer, which the database can see", async () => {
    const seen = await command(h.db, "runtime.report-status", async (c) => {
      await c.query("insert into settings (key, value) values ('runtime_status', '{}') on conflict (key) do update set value = excluded.value");
      return (await c.query("select session_user as s, current_user as u, current_setting('controlrod.command') as cmd")).rows[0];
    });
    expect(seen).toEqual({ s: WRITER, u: WRITER, cmd: "runtime.report-status" });
    await expect(command(h.db, "not.a-command" as never, async () => undefined)).rejects.toThrow(/unknown command/);
  });

  it("SEC-03: a command's client is unusable after the command and cannot control its transaction", async () => {
    // Returning the client fails outright: resolving the result touches the revoked view.
    await expect(command(h.db, "runtime.report-status", async (c) => c)).rejects.toThrow(/no longer usable/);
    let leaked: { query: (q: string) => unknown } | undefined;
    await command(h.db, "runtime.report-status", async (c) => { leaked = c as never; });
    expect(() => leaked!.query("insert into settings (key, value) values ('x', 'y')")).toThrow(/no longer usable/);
    await expect(command(h.db, "runtime.report-status", (c) => c.query("commit"))).rejects.toThrow(/may not run: commit/);
    await expect(command(h.db, "runtime.report-status", (c) => c.query("begin"))).rejects.toThrow(/may not run: begin/);
    await expect(command(h.db, "runtime.report-status", (c) => c.query("select set_config('role', 'controlrod', false)"))).rejects.toThrow(/may not run/);
    await expect(command(h.db, "runtime.report-status", async (c) => c.release())).rejects.toThrow(/cannot release/);
  });

  it("SEC-04: the writer cannot change the migration record or the lifecycle rules, and can change every other table", async () => {
    for (const t of WRITER_READ_ONLY_TABLES)
      await expect(command(h.db, "runtime.report-status", (c) => c.query(`delete from ${t}`))).rejects.toThrow(/permission denied/);
    const tables = (await h.admin.query<{ t: string; ok: boolean }>(
      `select tablename as t, has_table_privilege('${WRITER}', format('%I', tablename), 'insert,update,delete') as ok
         from pg_tables where schemaname = 'public' order by 1`)).rows;
    expect(tables.filter((r) => !r.ok).map((r) => r.t).sort()).toEqual([...WRITER_READ_ONLY_TABLES].sort());
  });

  it("SEC-06: startup verification refuses a role stronger than it should be", async () => {
    await verifyRoles(h.admin);
    await h.admin.query(`grant ${WRITER} to ${READER}`);
    try {
      await expect(verifyRoles(h.admin)).rejects.toThrow(/controlrod_reader is a member of controlrod_writer/);
    } finally {
      await h.admin.query(`revoke ${WRITER} from ${READER}`);
    }
    await h.admin.query(`alter role ${WRITER} createrole`);
    try {
      await expect(verifyRoles(h.admin)).rejects.toThrow(/controlrod_writer has powers/);
    } finally {
      await h.admin.query(`alter role ${WRITER} nocreaterole`);
    }
    const publicCreate = (await h.admin.query("select has_schema_privilege('public', 'public', 'create') as ok")).rows[0].ok;
    expect(publicCreate).toBe(false);
  });

  it("SEC-07: a connection that cannot create roles is told what an administrator must do", async () => {
    await h.admin.query("do $$ begin create role cr_limited_owner login password 'limited'; exception when duplicate_object then null; end $$");
    const limited = new pg.Pool({ connectionString: roleUrl(h.admin.options.connectionString as string, "cr_limited_owner", "limited"), max: 1 });
    try {
      await expect(provisionRoles(limited, TEST_ROLE_SECRETS)).rejects.toThrow(RoleSetupError);
      await expect(provisionRoles(limited, TEST_ROLE_SECRETS)).rejects.toThrow(/CONTROLROD_DB_READER_URL/);
    } finally {
      await limited.end();
    }
  });
});

describe("faults are not refusals", () => {
  it("reports a database fault in the preparation guard as a fault, not as a stale preparation", async () => {
    const { staleUnlessDatabaseFault } = await import("../src/preparation/lifecycle.js");
    const { Refusal } = await import("../src/work.js");
    const fault = new pg.DatabaseError("permission denied for table packages", 0, "error");
    expect(staleUnlessDatabaseFault(fault)).toBe(fault);
    const stale = staleUnlessDatabaseFault(new Error("Release manifest changed or is missing"));
    expect(stale).toBeInstanceOf(Refusal);
    expect(stale).toMatchObject({ status: 409, code: "preparation-stale" });
  });
});
