import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { type Harness, ORIGIN, VirtualAuthenticator, daemonHeaders, signIn, startHarness } from "./harness.js";

let harness: Harness;
let cookie: string;
const running = { running_commit: "a".repeat(40), checked_at: new Date().toISOString() };
const older = { ...running, latest_commit: "b".repeat(40), behind: 2 };
const current = { ...running, latest_commit: running.running_commit, behind: 0 };
const check = vi.fn(async () => current);

beforeAll(async () => {
  harness = await startHarness({ updateNotice: { read: async () => older, check } });
  cookie = await signIn(harness.app, new VirtualAuthenticator());
}, 120_000);
afterAll(async () => harness?.stop());

it("only shows the saved result to a signed-in person and only checks on an allowed POST", async () => {
  const read = (headers = {}) => harness.app.inject({ method: "GET", url: "/update-notice", headers });
  const recheck = (headers = {}) => harness.app.inject({ method: "POST", url: "/update-notice/check", headers });
  expect((await read()).statusCode).toBe(401);
  expect((await read(daemonHeaders)).statusCode).toBe(403);
  expect((await recheck({ origin: ORIGIN })).statusCode).toBe(401);
  expect((await recheck({ ...daemonHeaders, origin: ORIGIN })).statusCode).toBe(403);
  expect((await recheck({ cookie, origin: "https://example.test" })).statusCode).toBe(403);
  expect((await read({ cookie })).json()).toEqual(older);
  expect(check).not.toHaveBeenCalled();
  expect((await recheck({ cookie, origin: ORIGIN })).json()).toEqual(current);
  expect(check).toHaveBeenCalledTimes(1);
});
