import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { tx } from "../src/db/index.js";
import { afterCommit, bus, pendingEvents } from "../src/events.js";
import { startHarness, type Harness } from "./harness.js";

/** Work after a commit (API-27): a committed transaction is never reported as failed. */
let harness: Harness;

beforeAll(async () => {
  harness = await startHarness();
}, 120_000);
afterAll(async () => harness?.stop());

it("runs every after-commit step and announces events even when one step throws, and returns the committed result", async () => {
  const ran: string[] = [];
  const heard = vi.fn();
  bus.on("event", heard);
  const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    const out = await tx(harness.admin, async (c) => {
      await c.query("create table if not exists after_commit_probe (n int)");
      await c.query("insert into after_commit_probe values (1)");
      afterCommit(c, () => {
        throw new Error("boom");
      });
      afterCommit(c, () => void ran.push("second"));
      pendingEvents(c).push({ seq: -1 } as never);
      return "committed";
    });
    expect(out).toBe("committed");
    expect(ran).toEqual(["second"]);
    expect(heard).toHaveBeenCalledWith({ seq: -1 });
    expect((await harness.admin.query("select count(*)::int as n from after_commit_probe")).rows[0]).toEqual({ n: 1 });
    expect(quiet).toHaveBeenCalledOnce();
  } finally {
    bus.off("event", heard);
    quiet.mockRestore();
  }
});
