import { generateKeyPairSync } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Harness, VirtualAuthenticator, daemonHeaders, signIn, startHarness } from "./harness.js";

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => h?.stop());

function publicKey(): string {
  const der = generateKeyPairSync("ed25519").publicKey.export({ format: "der", type: "spki" }) as Buffer;
  return der.subarray(der.length - 32).toString("base64");
}
const enroll = (public_key: string, headers: Record<string, string> = daemonHeaders) =>
  h.app.inject({ method: "POST", url: "/runner/signing-key", headers, payload: { public_key } });

describe("the daemon's first signing key", () => {
  it("enrolls the first key once, and leaves any later key to an administrator", async () => {
    const first = publicKey();
    await signIn(h.app, new VirtualAuthenticator());
    const r = await enroll(first);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().status).toBe("enrolled");
    expect((await enroll(first)).json().status).toBe("already");
    expect((await enroll(publicKey())).json().status).toBe("needs-admin");
  });

  it("needs the daemon's token and a real key", async () => {
    expect((await enroll(publicKey(), {})).statusCode).toBe(401);
    expect((await enroll("c2hvcnQ=")).statusCode).toBe(400);
  });
});
