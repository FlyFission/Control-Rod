import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { hashToken } from "../src/auth.js";
import { packageFixture } from "./preparation-fixtures.js";
import { preparationContent } from "../src/preparation/store.js";
import {
  startHarness,
  signIn,
  VirtualAuthenticator,
  ORIGIN,
  RP_ID,
  DAEMON_TOKEN,
  daemonHeaders,
  type Harness,
} from "./harness.js";
let h: Harness, cookie: string;
beforeAll(async () => {
  h = await startHarness({ guidedPreparation: true });
  cookie = await signIn(h.app, new VirtualAuthenticator());
}, 120_000);
afterAll(async () => h?.stop());
const owner = (
  method: "GET" | "POST" | "PUT",
  url: string,
  payload?: unknown,
  extra: Record<string, string> = {},
) =>
  h.app.inject({
    method,
    url,
    headers: { cookie, origin: ORIGIN, ...extra },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });
async function fresh() {
  const p = { ...packageFixture(), id: `WP-${randomUUID()}` };
  await h.admin.query(
    "insert into packages(id,revision,status,body) values($1,0,'draft',$2)",
    [p.id, p],
  );
  return p;
}
const enroll = (id: string) =>
  owner("POST", `/packages/${id}/preparation`, {
    package_revision: 0,
    idempotency_key: "retry-key",
  });

describe("human manual preparation API", () => {
  it("defaults enrollment off, but never permits legacy downgrade of an enrolled package", async () => {
    const p = await fresh();
    const off = buildApp({
      db: h.db,
      root: ".",
      sweepSeconds: 0,
      auth: {
        rpID: RP_ID,
        rpName: "test",
        origins: [ORIGIN],
        daemonTokenHash: hashToken(DAEMON_TOKEN),
      },
    });
    try {
      expect(
        (
          await off.inject({
            method: "POST",
            url: `/packages/${p.id}/preparation`,
            headers: { cookie, origin: ORIGIN },
            payload: { package_revision: 0, idempotency_key: "retry-key" },
          })
        ).statusCode,
      ).toBe(403);
      expect((await enroll(p.id)).statusCode).toBe(200);
      expect(
        (
          await off.inject({
            method: "POST",
            url: `/packages/${p.id}/decisions/options`,
            headers: { cookie, origin: ORIGIN },
            payload: { kind: "release", package_revision: 0 },
          })
        ).statusCode,
      ).toBe(409);
    } finally {
      await off.close();
    }
  });
  it("requires a person, returns a strong ETag, resumes edited context and paginates immutable history", async () => {
    const p = await fresh(),
      url = `/packages/${p.id}/preparation`;
    expect(
      (
        await h.app.inject({
          method: "POST",
          url,
          headers: daemonHeaders,
          payload: { package_revision: 0, idempotency_key: "retry-key" },
        })
      ).statusCode,
    ).toBe(403);
    expect((await h.app.inject({ method: "GET", url })).statusCode).toBe(401);
    const r = await enroll(p.id);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.headers.etag).toBe(`"${r.json().content_digest.value}"`);
    const content = preparationContent(r.json().snapshot);
    content.context.problem = "Persist this answer";
    expect((await owner("PUT", url, content)).statusCode).toBe(428);
    const saved = await owner("PUT", url, content, {
      "if-match": String(r.headers.etag),
    });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(
      (await owner("PUT", url, content, { "if-match": String(r.headers.etag) }))
        .statusCode,
    ).toBe(409);
    expect((await owner("GET", url)).json().snapshot.context.problem).toBe(
      "Persist this answer",
    );
    const page = (await owner("GET", url + "/history?limit=1")).json();
    expect(page.revisions).toHaveLength(1);
    expect(page.next_before).toBe(1);
    expect(
      (await owner("GET", url + "/history?before=1&limit=1")).json()
        .revisions[0].snapshot.revision,
    ).toBe(0);
    expect((await owner("GET", url + "/history?limit=0")).statusCode).toBe(400);
  });
  it("refuses parallel legacy edits and release for enrolled work, even with forged fields", async () => {
    const p = await fresh();
    await enroll(p.id);
    expect(
      (
        await owner("PUT", `/packages/${p.id}`, {
          ...p,
          rigor_mode: "quick",
          data_lane: "public",
        })
      ).statusCode,
    ).toBe(409);
    const release = await owner("POST", `/packages/${p.id}/decisions/options`, {
      kind: "release",
      package_revision: 0,
    });
    expect(release.statusCode).toBe(409);
    expect(release.json().code).toBe("prepared-release-disabled");
    expect(
      (await owner("GET", `/packages/${p.id}`)).json().preparation_enrolled,
    ).toBe(true);
    const r = await owner("GET", `/packages/${p.id}/preparation`);
    expect(
      (
        await owner(
          "PUT",
          `/packages/${p.id}/preparation`,
          { ...preparationContent(r.json().snapshot), confirmed: true },
          { "if-match": String(r.headers.etag) },
        )
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await h.db.query(
          "select * from runs where package_id=$1 and role='author'",
          [p.id],
        )
      ).rowCount,
    ).toBe(0);
  });
  it("auto-enrolls every package from one capture and retains all capture links", async () => {
    const c = (
      await owner("POST", "/captures", {
        lane: "internal",
        text: "Prepare two controlled reports",
        source: "web",
      })
    ).json();
    const claim = await h.app.inject({
      method: "POST",
      url: "/runner/claim",
      headers: daemonHeaders,
      payload: { runtimes: ["fake"] },
    });
    expect(claim.statusCode, claim.body).toBe(200);
    const job = claim.json();
    expect(job.run.package_id).toBe(c.id);
    const a = { ...packageFixture(), id: "A" },
      b = { ...packageFixture(), id: "B" };
    const complete = await h.app.inject({
      method: "POST",
      url: `/runner/runs/${job.run.id}/complete`,
      headers: daemonHeaders,
      payload: {
        claim_token: job.claim.token,
        idempotency_key: "multi-package-completion",
        status: "succeeded",
        outputs: [
          {
            name: "packages/A.json",
            content_base64: Buffer.from(JSON.stringify(a)).toString("base64"),
          },
          {
            name: "packages/B.json",
            content_base64: Buffer.from(JSON.stringify(b)).toString("base64"),
          },
        ],
      },
    });
    expect(complete.statusCode, complete.body).toBe(200);
    const packages = (
      await h.db.query("select id from packages where capture_id=$1", [c.id])
    ).rows;
    expect(packages).toHaveLength(2);
    for (const p of packages)
      expect(
        (await owner("GET", `/packages/${p.id}/preparation`)).json().snapshot
          .basis[0].reference,
      ).toBe(`capture:${c.id}`);
    const captures = (await owner("GET", "/captures")).json();
    expect(
      captures.find((v: { id: string }) => v.id === c.id).package_ids,
    ).toHaveLength(2);
  });
});
