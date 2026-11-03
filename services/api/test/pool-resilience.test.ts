import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { readTx } from "../src/db/index.js";
import { openWriter } from "../src/db/writer.js";
import { type Harness, startHarness } from "./harness.js";

/** The control plane survives the database dropping an idle connection (a restart, an administrator's shutdown). */
let h: Harness;

beforeAll(async () => {
  h = await startHarness();
}, 120_000);
afterAll(async () => h?.stop());

describe("idle connection drops", () => {
  it("are reported and survived by the application's pools, never thrown as uncaught", async () => {
    const dropped = Object.assign(new Error("terminating connection due to administrator command"), { code: "57P01" });
    // An EventEmitter with no error listener throws; the reader pool has one, so this returns.
    expect(() => (h.db as unknown as pg.Pool).emit("error", dropped)).not.toThrow();
    const writer = openWriter("postgres://nobody@127.0.0.1:1/none");
    try {
      expect(() => writer.emit("error", dropped)).not.toThrow();
    } finally {
      await writer.end();
    }
    // The pool still serves queries afterwards.
    expect((await h.db.query<{ one: number }>("select 1 as one")).rows[0]!.one).toBe(1);
  });
});

describe("a connection ended during a read transaction", () => {
  it("fails that read, is never returned to the pool, and does not take the process down", async () => {
    const uncaught: unknown[] = [];
    const record = (e: unknown) => uncaught.push(e);
    process.on("uncaughtException", record);
    try {
      const read = readTx(h.db, async (c) => {
        const pid = (await c.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0]!.pid;
        await h.admin.query("select pg_terminate_backend($1)", [pid]);
        await c.query("select 1");
      });
      await expect(read).rejects.toThrow();
      // Let any error event the dead socket emits arrive.
      await new Promise((r) => setTimeout(r, 200));
      expect(uncaught).toEqual([]);
      expect((await h.db.query<{ one: number }>("select 1 as one")).rows[0]!.one).toBe(1);
    } finally {
      process.off("uncaughtException", record);
    }
  });
});
