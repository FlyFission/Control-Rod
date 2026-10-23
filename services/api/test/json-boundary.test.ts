import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { Db } from "../src/db/index.js";

// This route uses the actual application parser; no database is needed to exercise it.
const app = buildApp({ db: {} as Db, root: ".", sweepSeconds: 0,
  auth: { rpID: "localhost", rpName: "test", origins: ["http://localhost:7300"], daemonTokenHash: "unused" } });
app.post("/profile-test", async req => req.body);
afterAll(() => app.close());
const vectors = JSON.parse(readFileSync(new URL("../../../spec/vectors/canonical-digest.json", import.meta.url), "utf8"));
describe("raw control-plane JSON profile", () => {
  for (const v of vectors.invalid) it(`refuses ${v.name} before object conversion`, async () => {
    const reply = await app.inject({ method: "POST", url: "/profile-test", headers: {
      origin: "http://localhost:7300", "content-type": "application/json" }, payload: v.input });
    expect(reply.statusCode, reply.body).toBe(400);
  });
  for (const v of vectors.valid) it(`accepts ${v.name}`, async () => {
    const reply = await app.inject({ method: "POST", url: "/profile-test", headers: {
      origin: "http://localhost:7300", "content-type": "application/json" }, payload: v.input });
    expect(reply.statusCode, reply.body).toBe(200);
  });
  it("refuses malformed UTF-8 instead of replacing it", async () => {
    const reply = await app.inject({ method: "POST", url: "/profile-test", headers: {
      origin: "http://localhost:7300", "content-type": "application/json" }, payload: Buffer.from([0x22,0xff,0x22]) });
    expect(reply.statusCode).toBe(400);
  });
});
