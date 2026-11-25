import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLI_TOKEN, DAEMON_TOKEN, type Harness, VirtualAuthenticator, signIn, startHarness } from "./harness.js";

let h: Harness;
const cli = { authorization: `Bearer ${CLI_TOKEN}` };

beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => h?.stop());

describe("the command-line token", () => {
  it("opens nothing before anyone has set Control Rod up", async () => {
    const r = await h.app.inject({ method: "GET", url: "/packages", headers: cli });
    expect(r.statusCode, r.body).toBe(401);
  });

  it("adds and lists cards as the installation's owner, with no browser and no passkey", async () => {
    await signIn(h.app, new VirtualAuthenticator());
    const add = await h.app.inject({ method: "POST", url: "/captures", headers: cli, payload: { text: "Add a line to the README", lane: "internal", source: "web" } });
    expect(add.statusCode, add.body).toBe(201);
    expect(add.json().source).toBe("cli");
    const list = await h.app.inject({ method: "GET", url: "/captures", headers: cli });
    expect(list.statusCode, list.body).toBe(200);
    expect(list.json().some((c: { id: string }) => c.id === add.json().id)).toBe(true);
    for (const url of ["/packages", "/workspace/projects"]) {
      expect((await h.app.inject({ method: "GET", url, headers: cli })).statusCode, url).toBe(200);
    }
  });

  it("opens no other route", async () => {
    for (const [method, url] of [["GET", "/admin"], ["GET", "/runs"], ["POST", "/workspace/projects"], ["POST", "/packages/P-1/accept"], ["POST", "/captures/C-1/classify"]] as const) {
      const r = await h.app.inject({ method, url, headers: cli, payload: {} });
      expect([401, 403, 404], `${method} ${url}: ${r.statusCode} ${r.body}`).toContain(r.statusCode);
    }
  });

  it("is refused when wrong, and the daemon's token never acts for a person", async () => {
    const wrong = await h.app.inject({ method: "POST", url: "/captures", headers: { authorization: "Bearer nope" }, payload: { text: "x" } });
    expect(wrong.statusCode).toBe(403);
    const daemon = await h.app.inject({ method: "GET", url: "/captures", headers: { authorization: `Bearer ${DAEMON_TOKEN}` } });
    expect(daemon.statusCode).toBe(403);
  });
});
