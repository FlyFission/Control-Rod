import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Harness, ORIGIN, VirtualAuthenticator, signIn, startHarness } from "./harness.js";

// Found by the live break pass (apps/web/e2e/live/break.spec.ts, "quick add takes control-chars
// text literally"): a capture carrying U+0000 reached PostgreSQL and came back as a 500.
let h: Harness;
let cookie: string;
beforeAll(async () => {
  h = await startHarness();
  cookie = await signIn(h.app, new VirtualAuthenticator());
});
afterAll(() => h.stop());

describe("text with a null character", () => {
  it("is refused with a 400 that says why, and nothing is stored", async () => {
    const r = await h.app.inject({ method: "POST", url: "/captures", headers: { cookie, origin: ORIGIN }, payload: { text: "before\u0000after", source: "web" } });
    expect(r.statusCode).toBe(400);
    expect(r.json().message).toMatch(/null character/);
    const list = await h.app.inject({ method: "GET", url: "/captures", headers: { cookie } });
    expect(list.json().some((c: { text?: string }) => (c.text ?? "").startsWith("before"))).toBe(false);
  });

  it("other control characters are kept as typed", async () => {
    const r = await h.app.inject({ method: "POST", url: "/captures", headers: { cookie, origin: ORIGIN }, payload: { text: "tab\there\u0007bell\u001b[31m", source: "web" } });
    expect(r.statusCode, r.body).toBe(201);
  });
});
