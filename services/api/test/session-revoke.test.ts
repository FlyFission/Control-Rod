import { createHash } from "node:crypto";
import type { FastifyReply } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startSession } from "../src/auth.js";
import { type Harness, ORIGIN, VirtualAuthenticator, addOwnPasskey, logIn, signIn, startHarness } from "./harness.js";

/**
 * Sessions and revoked passkeys (review thread on #21): a session names the passkey that started
 * it, revoking that passkey ends it, and a sign-in that loses the race to a revocation gets none.
 */
let h: Harness;
let ben: string;
const benKey = new VirtualAuthenticator();
const id = (k: VirtualAuthenticator) => k.credentialId.toString("base64url");
const post = (cookie: string, url: string, payload: unknown) => h.app.inject({ method: "POST", url, headers: { cookie, origin: ORIGIN }, payload: payload as object });
const signedIn = async (cookie: string) => (await h.app.inject({ method: "GET", url: "/admin", headers: { cookie } })).statusCode;
async function revoke(cookie: string, key: VirtualAuthenticator, credential_id: string) {
  const payload = { credential_id, reason: "lost" };
  const o = await post(cookie, "/admin/commands/credential.revoke/options", { payload });
  expect(o.statusCode, o.body).toBe(200);
  return post(cookie, "/admin/commands/credential.revoke", { payload, assertion: key.assert(o.json().options) });
}

beforeAll(async () => {
  h = await startHarness();
  ben = await signIn(h.app, benKey);
}, 120_000);
afterAll(async () => h?.stop());

describe("revoking a passkey", () => {
  it("ends the sessions that passkey started and leaves the others", async () => {
    const laptop = new VirtualAuthenticator();
    expect((await addOwnPasskey(h.app, ben, benKey, laptop)).statusCode).toBe(200);
    const onLaptop = await logIn(h.app, laptop);
    expect(await signedIn(onLaptop)).toBe(200);
    const row = await h.db.query("select credential_id from sessions where token_hash = $1",
      [createHash("sha256").update(decodeURIComponent(onLaptop.split("=")[1]!.split(";")[0]!)).digest("hex")]);
    expect(row.rows[0]?.credential_id).toBe(id(laptop));

    const r = await revoke(ben, benKey, id(laptop));
    expect(r.statusCode, r.body).toBe(200);
    expect(await signedIn(onLaptop)).toBe(401);
    expect(await signedIn(ben)).toBe(200);
  });

  it("gives no session to a sign-in whose passkey was revoked after its assertion was checked", async () => {
    const phone = new VirtualAuthenticator();
    expect((await addOwnPasskey(h.app, ben, benKey, phone)).statusCode).toBe(200);
    // The sign-in checked the assertion; the revocation commits before its session is created.
    expect((await revoke(ben, benKey, id(phone))).statusCode).toBe(200);
    const reply = { setCookie: () => reply } as unknown as FastifyReply;
    await expect(startSession(h.db, reply, "ben", id(phone))).rejects.toThrow(/not active/);
    expect((await h.db.query("select 1 from sessions where credential_id = $1", [id(phone)])).rowCount).toBe(0);
  });

  it("refuses a session naming a revoked passkey, and ends a Member's unnamed sessions from before", async () => {
    const tablet = new VirtualAuthenticator();
    expect((await addOwnPasskey(h.app, ben, benKey, tablet)).statusCode).toBe(200);
    const hash = (t: string) => createHash("sha256").update(t).digest("hex");
    // A session from before sessions named their passkey.
    await h.admin.query("insert into sessions (token_hash, user_name, expires_at) values ($1, 'ben', now() + interval '1 day')", [hash("legacy")]);
    expect(await signedIn("cr_session=legacy")).toBe(200);
    expect((await revoke(ben, benKey, id(tablet))).statusCode).toBe(200);
    expect(await signedIn("cr_session=legacy")).toBe(401);
    // Even a session row left naming the revoked passkey no longer signs anyone in.
    await h.admin.query("insert into sessions (token_hash, user_name, expires_at, credential_id) values ($1, 'ben', now() + interval '1 day', $2)", [hash("stale"), id(tablet)]);
    expect(await signedIn("cr_session=stale")).toBe(401);
  });
});
