import { afterAll, beforeAll, expect, it } from "vitest";
import { startHarness } from "./harness.js";
let h: Awaited<ReturnType<typeof startHarness>>;
beforeAll(async () => {
  h = await startHarness();
}, 120_000);
afterAll(async () => h?.stop());
it("migrates the complete controller grant custody tables", async () => {
  for (const name of [
    "preparation_grants",
    "preparation_grant_inputs",
    "preparation_grant_state",
    "preparation_grant_uses",
    "preparation_grant_receipts",
    "preparation_grant_proposals",
    "preparation_grant_guards",
  ]) {
    expect(
      (await h.db.query("select to_regclass($1) as name", [name])).rows[0].name,
      name,
    ).toBe(name);
  }
});
