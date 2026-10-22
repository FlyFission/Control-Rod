import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { hashToken } from "../src/auth.js";
import { DAEMON_TOKEN, ORIGIN, RP_ID, type Harness, startHarness } from "./harness.js";

/** Exercise the real static plugin: the ordinary API harness does not enable webDir. */
describe("built web serving", () => {
  let h: Harness;
  let app: FastifyInstance;
  let dir: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "cr-static-"));
    const webDir = join(dir, "web");
    mkdirSync(join(webDir, "assets"), { recursive: true });
    writeFileSync(join(webDir, "index.html"), "<!doctype html><title>Control Rod fixture</title>");
    writeFileSync(join(webDir, "assets", "app.js"), "console.log('fixture');");
    writeFileSync(join(dir, "outside.txt"), "outside the static root");
    h = await startHarness();
    app = buildApp({
      db: h.db,
      root: resolve(fileURLToPath(new URL("../../../", import.meta.url))),
      auth: { rpID: RP_ID, rpName: "Control Rod", origins: [ORIGIN], daemonTokenHash: hashToken(DAEMON_TOKEN) },
      webDir,
      sweepSeconds: 0,
    });
    await app.ready();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await h?.stop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("serves the shell and a deep browser navigation", async () => {
    for (const url of ["/", "/packages/example"]) {
      const res = await app.inject({ url, headers: { accept: "text/html" } });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("text/html");
      expect(res.body).toContain("Control Rod fixture");
    }
  });

  it("serves built assets and refuses files outside the configured root", async () => {
    const asset = await app.inject({ url: "/assets/app.js" });
    expect(asset.statusCode).toBe(200);
    expect(asset.body).toBe("console.log('fixture');");
    for (const url of ["/assets/missing.js", "/%2e%2e/outside.txt"]) {
      const res = await app.inject({ url });
      expect(res.statusCode).toBe(404);
      expect(res.body).not.toContain("outside the static root");
    }
  });

  it("keeps JSON API and artifact navigation behind the person guard", async () => {
    const api = await app.inject({ url: "/packages", headers: { accept: "application/json" } });
    expect(api.statusCode).toBe(401);
    expect(api.json().code).toBe("signed-out");
    const artifact = await app.inject({ url: "/packages/example/outputs/report.svg", headers: { accept: "text/html" } });
    expect(artifact.statusCode).toBe(401);
    expect(artifact.body).not.toContain("Control Rod fixture");
  });
});
