import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
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
