import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupCodeMatches } from "../src/app.js";
import { type Harness, ORIGIN, VirtualAuthenticator, startHarness } from "./harness.js";

/**
 * The first passkey needs the one-time setup code the server printed (API-34). Without it, anyone
 * who could reach the port before the owner (another account on the machine, a tunnel or proxy in
 * front of it) could register the founding passkey and own the installation.
 */
const CODE = "AB12-CD34-EF56-7890";
let h: Harness;
let done = 0;

beforeAll(async () => {
  h = await startHarness({ setupCode: CODE, onSetupDone: () => void done++ });
});
afterAll(async () => {
  await h?.stop();
});

const options = (payload: Record<string, unknown>) =>
  h.app.inject({ method: "POST", url: "/auth/register/options", headers: { origin: ORIGIN }, payload });

describe("first-run setup code", () => {
  it("says a code is needed before anyone is registered", async () => {
    expect((await h.app.inject({ method: "GET", url: "/auth/session" })).json()).toEqual({ registered: false, signed_in: false, setup_code_required: true });
  });

  it("refuses the first registration without the code or with a wrong one", async () => {
    for (const payload of [{ name: "stranger" }, { name: "stranger", setup_code: "AB12-CD34-EF56-7891" }, { name: "stranger", setup_code: 42 }]) {
      const r = await options(payload);
      expect(r.statusCode).toBe(403);
      expect(r.json().code).toBe("setup-code");
    }
  });

  it("registers the first passkey with the code, typed in any case and without dashes, and stops asking for it", async () => {
    const key = new VirtualAuthenticator();
    const o = await options({ name: "ben", setup_code: " ab12cd34ef567890 " });
    expect(o.statusCode, o.body).toBe(200);
    const reg = await h.app.inject({ method: "POST", url: "/auth/register/verify", headers: { origin: ORIGIN }, payload: key.register(o.json().options) });
    expect(reg.statusCode, reg.body).toBe(200);
    expect(done).toBe(1);
    expect((await h.app.inject({ method: "GET", url: "/auth/session" })).json()).toEqual({ registered: true, signed_in: false });
    // Once a passkey exists, the code opens nothing: the usual rule for a second passkey applies.
    const again = await options({ name: "stranger", setup_code: CODE });
    expect(again.statusCode).toBe(403);
    expect(again.json().code).toBe("forbidden");
  });

  it("compares the code in constant time on its normalized form", () => {
    expect(setupCodeMatches(CODE, "ab12-cd34-ef56-7890")).toBe(true);
    expect(setupCodeMatches(CODE, "AB12 CD34 EF56 7890")).toBe(true);
    expect(setupCodeMatches(CODE, "")).toBe(false);
    expect(setupCodeMatches(CODE, undefined)).toBe(false);
  });
});
