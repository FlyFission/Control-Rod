import { afterAll, beforeAll, expect, it } from "vitest";
import { startHarness } from "./harness.js";
import { tx } from "../src/db/index.js";
let h: Awaited<ReturnType<typeof startHarness>>;
beforeAll(async () => {
  h = await startHarness();
}, 120_000);
afterAll(async () => h?.stop());
it("preserves the fatal database deadline error and safely discards its client", async () => {
  const fatal = await tx(h.admin, async (c) => {
    await c.query("set local transaction_timeout='100ms'");
    await c.query("select pg_sleep(1)");
  }).catch((e) => e);
  expect(fatal.code).toBe("25P04");
  expect((await h.db.query("select 1 as ok")).rows[0].ok).toBe(1);
});
