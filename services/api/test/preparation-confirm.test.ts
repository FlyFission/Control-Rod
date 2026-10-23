import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  startHarness,
  signIn,
  VirtualAuthenticator,
  ORIGIN,
  daemonHeaders,
  type Harness,
} from "./harness.js";
import { packageFixture } from "./preparation-fixtures.js";
import { preparationContent } from "../src/preparation/store.js";
let h: Harness, cookie: string;
const passkey = new VirtualAuthenticator();
beforeAll(async () => {
  h = await startHarness({ guidedPreparation: true });
  cookie = await signIn(h.app, passkey);
}, 120_000);
afterAll(async () => h?.stop());
const owner = (
  method: "GET" | "POST" | "PUT",
  url: string,
  payload?: unknown,
  headers: Record<string, string> = {},
) =>
  h.app.inject({
    method,
    url,
    headers: { cookie, origin: ORIGIN, ...headers },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });
async function fresh() {
  const p = { ...packageFixture(), id: `WP-${randomUUID()}` };
  await h.db.query(
    "insert into packages(id,revision,status,body) values($1,0,'draft',$2)",
    [p.id, p],
  );
  const r = await owner("POST", `/packages/${p.id}/preparation`, {
    package_revision: 0,
    idempotency_key: "request-1",
  });
  return { id: p.id, url: `/packages/${p.id}/preparation`, view: r.json() };
}
async function options(url: string, digest: unknown) {
  const r = await owner("POST", url + "/confirm/options", {
    expected_requirements_digest: digest,
  });
  expect(r.statusCode, r.body).toBe(200);
  return r.json();
}
describe("signed human requirements confirmation", () => {
  it("confirms requirements without releasing or queuing, preserves technical-only edits and invalidates changed need", async () => {
    const { id, url, view } = await fresh();
    const o = await options(url, view.requirements_digest);
    const signed = passkey.assert(o.options);
    const r = await owner("POST", url + "/confirm", { assertion: signed });
    expect(r.statusCode, r.body).toBe(201);
    let current = (await owner("GET", url)).json();
    expect(current.confirmed).toBe(true);
    expect(
      (await h.db.query("select * from runs where package_id=$1", [id]))
        .rowCount,
    ).toBe(0);
    expect(
      (await owner("POST", url + "/confirm", { assertion: signed })).statusCode,
    ).toBe(403);
    const content = preparationContent(current.snapshot);
    content.technical_plan.summary = "Technical-only clarification";
    current = (
      await owner("PUT", url, content, {
        "if-match": `"${current.content_digest.value}"`,
      })
    ).json();
    expect(current.confirmed).toBe(true);
    content.context.problem = "Changed controlled need";
    current = (
      await owner("PUT", url, content, {
        "if-match": `"${current.content_digest.value}"`,
      })
    ).json();
    expect(current.confirmed).toBe(false);
  });
  it("refuses stale displayed subjects and stale signed challenges after a concurrent requirements edit", async () => {
    const { url, view } = await fresh(),
      o = await options(url, view.requirements_digest);
    const a = preparationContent(view.snapshot);
    a.context.problem = "changed";
    await owner("PUT", url, a, {
      "if-match": `"${view.content_digest.value}"`,
    });
    expect(
      (
        await owner("POST", url + "/confirm/options", {
          expected_requirements_digest: view.requirements_digest,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await owner("POST", url + "/confirm", {
          assertion: passkey.assert(o.options),
        })
      ).statusCode,
    ).toBe(409);
  });
  it("refuses expired, wrong-purpose and non-human assertions", async () => {
    const { url, view } = await fresh(),
      o = await options(url, view.requirements_digest);
    await h.db.query(
      "update challenges set expires_at=now()-interval '1 minute' where purpose='preparation-confirmation'",
    );
    expect(
      (
        await owner("POST", url + "/confirm", {
          assertion: passkey.assert(o.options),
        })
      ).statusCode,
    ).toBe(403);
    const login = await owner("POST", "/auth/login/options");
    expect(
      (
        await owner("POST", url + "/confirm", {
          assertion: passkey.assert(login.json().options),
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await h.app.inject({
          method: "POST",
          url: url + "/confirm/options",
          headers: daemonHeaders,
          payload: { expected_requirements_digest: view.requirements_digest },
        })
      ).statusCode,
    ).toBe(403);
  });
  it("holds confirmation on unresolved human requirements and rejects forged confirmed fields", async () => {
    const { url, view } = await fresh(),
      a = preparationContent(view.snapshot);
    a.questions.push({
      id: "Q1",
      kind: "question",
      text: "Which input?",
      owner: "requester",
      blocking: true,
      state: "open",
      resolution_refs: [],
    });
    const v = (
      await owner("PUT", url, a, {
        "if-match": `"${view.content_digest.value}"`,
      })
    ).json();
    expect(
      (
        await owner("POST", url + "/confirm/options", {
          expected_requirements_digest: v.requirements_digest,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await owner("POST", url + "/confirm", {
          assertion: {},
          confirmed: true,
        })
      ).statusCode,
    ).toBe(400);
  });
  it("rejects malformed assertions without a server error", async () => {
    const { url } = await fresh();
    for (const assertion of [
      {},
      { response: {} },
      { response: { clientDataJSON: "not-json" } },
    ])
      expect(
        (await owner("POST", url + "/confirm", { assertion })).statusCode,
      ).toBe(403);
  });

  it("rejects a signature redirected to another package or bound to another session user", async () => {
    const a = await fresh(),
      b = await fresh();
    let o = await options(a.url, a.view.requirements_digest);
    expect(
      (
        await owner("POST", b.url + "/confirm", {
          assertion: passkey.assert(o.options),
        })
      ).statusCode,
    ).toBe(409);
    o = await options(a.url, a.view.requirements_digest);
    await h.db.query("update credentials set user_name='different-user'");
    try {
      expect(
        (
          await owner("POST", a.url + "/confirm", {
            assertion: passkey.assert(o.options),
          })
        ).statusCode,
      ).toBe(403);
    } finally {
      await h.db.query("update credentials set user_name='owner'");
    }
  });
});
