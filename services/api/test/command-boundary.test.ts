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
    for (const m of text.matchAll(/\b(?:command|grantTx)\(\s*\w+(?:\.\w+)*\s*,\s*"([a-z][a-z-]*\.[a-z-]+)"|\bcatalog:\s*"([a-z][a-z-]*\.[a-z-]+)"/g))
      calls.set((m[1] ?? m[2])!, [...(calls.get((m[1] ?? m[2])!) ?? []), path]);
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
    // A returned or captured client is dead once its command ends.
    const returned = await command(h.db, "runtime.report-status", async (c) => c);
    expect(() => returned.query("insert into settings (key, value) values ('x', 'y')")).toThrow(/no longer usable/);
    let leaked: { query: (q: string) => unknown } | undefined;
    await command(h.db, "runtime.report-status", async (c) => { leaked = c as never; });
    expect(() => leaked!.query("insert into settings (key, value) values ('x', 'y')")).toThrow(/no longer usable/);
    await expect(command(h.db, "runtime.report-status", (c) => c.query("commit"))).rejects.toThrow(/may not run a COMMIT statement/);
    await expect(command(h.db, "runtime.report-status", (c) => c.query("begin"))).rejects.toThrow(/may not run a BEGIN statement/);
    // Role changes are refused by the database: the writer login belongs to no role.
    await expect(command(h.db, "runtime.report-status", (c) => c.query("select set_config('role', 'controlrod', false)"))).rejects.toThrow(/permission denied to set role/);
    await expect(command(h.db, "runtime.report-status", async (c) => (c as unknown as { release: () => void }).release())).rejects.toThrow(/not a function/);
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

describe("review round 2", () => {
  let h: Harness;
  beforeAll(async () => {
    h = await startHarness();
  }, 120_000);
  afterAll(async () => h?.stop());

  it("N-01: provisioning refuses a password that is not plain hex", async () => {
    await expect(provisionRoles(h.admin, { reader: "x'; alter role controlrod_reader superuser; --", writer: "2".repeat(48) })).rejects.toThrow(/48 hexadecimal/);
    await verifyRoles(h.admin);
  });

  it("N-02 to N-04: a command gets only plain SQL text through query(), one statement at a time with no transaction control", async () => {
    const tries: [string, (c: any) => unknown][] = [
      ["multi statement commit", (c) => c.query("select 1; commit")],
      ["commented commit", (c) => c.query("/* note */ commit")],
      ["line comment then rollback", (c) => c.query("-- note\nrollback")],
      ["query object", (c) => c.query({ text: "select 1" })],
      ["prepared statement", (c) => c.query({ name: "p1", text: "select 1" })],
      ["submittable", (c) => c.query({ submit() {} })],
      ["values not an array", (c) => c.query("select $1", "x")],
    ];
    for (const [label, attempt] of tries)
      await expect(command(h.db, "runtime.report-status", async (c) => attempt(c)), label).rejects.toThrow(/may not run|may only pass|cannot insert multiple commands/);
    const exposed = await command(h.db, "runtime.report-status", async (c) => Object.keys(c as object));
    expect(exposed).toEqual(["query"]);
  });

  it("N-05: the startup backfill runs with two active organizations once existing records are owned", async () => {
    const { backfillTenancy } = await import("../src/tenancy.js");
    const { tx } = await import("../src/db/index.js");
    await h.admin.query(`insert into organizations (body) values ('{"id":"org_two","name":"Two","status":"active"}')`);
    try {
      await tx(h.admin, backfillTenancy);
    } finally {
      await h.admin.query(`update organizations set body = jsonb_set(body, '{status}', '"suspended"') where id = 'org_two'`);
    }
  });

  it("N-07: secrets files are private regular files", async () => {
    const { mkdtempSync, statSync, symlinkSync, writeFileSync, chmodSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { privateFile } = await import("../src/db/roles.js");
    const dir = mkdtempSync(join(tmpdir(), "cr-secret-"));
    const wide = join(dir, "wide");
    writeFileSync(wide, "secret");
    chmodSync(wide, 0o644);
    expect(privateFile(wide, () => "unused")).toBe("secret");
    expect(statSync(wide).mode & 0o777).toBe(0o600);
    const fresh = join(dir, "fresh");
    expect(privateFile(fresh, () => "made")).toBe("made");
    expect(statSync(fresh).mode & 0o777).toBe(0o600);
    symlinkSync(wide, join(dir, "link"));
    expect(() => privateFile(join(dir, "link"), () => "x")).toThrow(/regular file/);
  });

  it("N-09: provisioning leaves a login that already works alone", async () => {
    const hash = async () => (await h.admin.query("select rolpassword from pg_authid where rolname = $1", [READER])).rows[0].rolpassword;
    const before = await hash();
    await provisionRoles(h.admin, TEST_ROLE_SECRETS);
    expect(await hash()).toBe(before);
  });

  it("N-10: startup refuses privileges wider than the grants", async () => {
    await h.admin.query(`grant insert on captures to ${READER}`);
    try {
      await expect(verifyRoles(h.admin, WRITER_READ_ONLY_TABLES)).rejects.toThrow(/controlrod_reader can write captures/);
    } finally {
      await h.admin.query(`revoke insert on captures from ${READER}`);
    }
    await verifyRoles(h.admin, WRITER_READ_ONLY_TABLES);
  });

  it("SEC-07: administrator issued logins open a database without provisioning", async () => {
    const { openDb, closeDb } = await import("../src/db/index.js");
    const name = `cr_issued_${Date.now()}`;
    await h.admin.query(`create database ${name}`);
    const at = (u: string) => { const x = new URL(u); x.pathname = `/${name}`; return x.toString(); };
    const ownerUrl = at(h.admin.options.connectionString as string);
    const db = await openDb(ownerUrl, { urls: {
      readerUrl: at(roleUrl(ownerUrl, READER, TEST_ROLE_SECRETS.reader)),
      writerUrl: at(roleUrl(ownerUrl, WRITER, TEST_ROLE_SECRETS.writer)),
    } });
    try {
      expect((await db.query("select current_user as u")).rows[0].u).toBe(READER);
    } finally {
      await closeDb(db);
    }
  });
});

describe("review round 3", () => {
  let h: Harness;
  beforeAll(async () => {
    h = await startHarness();
  }, 120_000);
  afterAll(async () => h?.stop());

  it("N-03: one statement per command query, enforced by PostgreSQL, and no leading transaction control", async () => {
    const { firstWord } = await import("../src/commands/executor.js");
    expect(firstWord("  /* a /* nested */ b */ -- x\n  commit")).toBe("commit");
    expect(firstWord("--x\rCOMMIT")).toBe("commit");
    expect(firstWord("PREPARE/**/TRANSACTION 'x'")).toBe("prepare");
    expect(firstWord("\f\v ;; select 1")).toBe("select");
    for (const sql of ["select '--'; commit", "select E'\\''; commit; --'", "select 1 as a$t$; commit; select 1 as b$t$", "select 1; select 2"])
      await expect(command(h.db, "runtime.report-status", (c) => c.query(sql)), sql).rejects.toThrow(/cannot insert multiple commands into a prepared statement/);
    for (const sql of ["/* note */ -- more\n commit", ";COMMIT", " ; ; /* x */ ;rollback", "\n;\tend", "--x\rCOMMIT", "PREPARE/**/TRANSACTION 'x'", "start transaction"])
      await expect(command(h.db, "runtime.report-status", (c) => c.query(sql)), sql).rejects.toThrow(/may not run/);
    const ok = await command(h.db, "runtime.report-status", async (c) => (await c.query("select 'a;b' as v")).rows[0].v);
    expect(ok).toBe("a;b");
  });

  it("N-09: an existing login with another password is reset only by the installation that owns the cluster", async (ctx) => {
    const other = { reader: "3".repeat(48), writer: "4".repeat(48) };
    // A trust authenticated test cluster accepts any password, so a mismatch cannot occur there.
    const wrong = new pg.Pool({ connectionString: roleUrl(h.admin.options.connectionString as string, READER, "5".repeat(48)), max: 1 });
    const trusts = await wrong.query("select 1").then(() => true, () => false);
    await wrong.end();
    if (trusts) ctx.skip();
    await expect(provisionRoles(h.admin, other)).rejects.toThrow(/another Control Rod installation/);
    await provisionRoles(h.admin, other, { ownsCluster: true });
    try {
      const probe = new pg.Pool({ connectionString: roleUrl(h.admin.options.connectionString as string, READER, other.reader), max: 1 });
      expect((await probe.query("select current_user as u")).rows[0].u).toBe(READER);
      await probe.end();
    } finally {
      await provisionRoles(h.admin, TEST_ROLE_SECRETS, { ownsCluster: true });
    }
  });

  it("N-10: the audit catches column grants and callable security definer functions", async () => {
    await h.admin.query(`grant update (value) on settings to ${READER}`);
    try {
      await expect(verifyRoles(h.admin, WRITER_READ_ONLY_TABLES)).rejects.toThrow(/controlrod_reader can write settings/);
    } finally {
      await h.admin.query(`revoke update (value) on settings from ${READER}`);
    }
    await h.admin.query("create schema if not exists cr_side");
    await h.admin.query("create or replace function cr_side.escalate() returns int language sql security definer as 'select 1'");
    try {
      await expect(verifyRoles(h.admin, WRITER_READ_ONLY_TABLES)).rejects.toThrow(/can call security definer function cr_side.escalate/);
    } finally {
      await h.admin.query("drop schema cr_side cascade");
    }
    await verifyRoles(h.admin, WRITER_READ_ONLY_TABLES);
  });

  it("N-07: the home folder is kept private", async () => {
    const { mkdtempSync, mkdirSync, statSync, symlinkSync, chmodSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { privateDir } = await import("../src/db/roles.js");
    const base = mkdtempSync(join(tmpdir(), "cr-home-"));
    const home = join(base, "home");
    mkdirSync(home);
    chmodSync(home, 0o777);
    privateDir(home);
    expect(statSync(home).mode & 0o777).toBe(0o700);
    symlinkSync(home, join(base, "link"));
    expect(() => privateDir(join(base, "link"))).toThrow(/must be a directory/);
  });
});
