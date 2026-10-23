import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  startHarness,
  signIn,
  VirtualAuthenticator,
  ORIGIN,
  type Harness,
} from "./harness.js";
import { packageFixture } from "./preparation-fixtures.js";
import { preparationContent } from "../src/preparation/store.js";
import { digest } from "../src/kernel.js";
let h: Harness, cookie: string;
const passkey = new VirtualAuthenticator();
beforeAll(async () => {
  h = await startHarness({ guidedPreparation: true, preparedRelease: true });
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
async function ready() {
  const p = { ...packageFixture(), id: `WP-${randomUUID()}` };
  await h.db.query(
    "insert into packages(id,revision,status,body) values($1,0,'draft',$2)",
    [p.id, p],
  );
  const url = `/packages/${p.id}/preparation`;
  let v = (
    await owner("POST", url, {
      package_revision: 0,
      idempotency_key: "request-1",
    })
  ).json();
  const a = preparationContent(v.snapshot);
  a.criteria[0]!.verification_check_ids = ["CHECK-1"];
  a.technical_plan = {
    summary: "Produce report and independently check",
    current_state_refs: [a.basis[0]!.reference],
    design_elements: [{ id: "DES-1", description: "Report" }],
    alternatives: ["Manual preparation"],
    tasks: [
      {
        id: "TASK-1",
        description: "Write report",
        design_element_ids: ["DES-1"],
        depends_on: [],
      },
    ],
    checks: [
      {
        id: "CHECK-1",
        criterion_ids: [a.criteria[0]!.id],
        method: "independent-review",
        required: true,
        expected_result: "Report exists",
      },
    ],
    rollout: "Owner checks before use",
    risks: ["Missing source holds work"],
  };
  const saved = await owner("PUT", url, a, {
    "if-match": `"${v.content_digest.value}"`,
  });
  expect(saved.statusCode, saved.body).toBe(200);
  v = saved.json();
  const o = await owner("POST", url + "/confirm/options", {
    expected_requirements_digest: v.requirements_digest,
  });
  expect(o.statusCode, o.body).toBe(200);
  expect(
    (
      await owner("POST", url + "/confirm", {
        assertion: passkey.assert(o.json().options),
      })
    ).statusCode,
  ).toBe(201);
  return { id: p.id, url };
}
async function releaseOptions(id: string) {
  const r = await owner("POST", `/packages/${id}/decisions/options`, {
    kind: "release",
    package_revision: 0,
  });
  expect(r.statusCode, r.body).toBe(200);
  return r.json();
}
const release = (id: string, assertion: unknown) =>
  owner("POST", `/packages/${id}/decisions`, {
    kind: "release",
    package_revision: 0,
    assertion,
  });
describe("prepared release through the existing authority", () => {
  it("persists the complete manifest and exactly one author under concurrent signed releases", async () => {
    const { id } = await ready(),
      a = await releaseOptions(id),
      b = await releaseOptions(id);
    const outcomes = await Promise.all([
      release(id, passkey.assert(a.options)),
      release(id, passkey.assert(b.options)),
    ]);
    expect(outcomes.filter((r) => r.statusCode === 201)).toHaveLength(1);
    expect(outcomes.filter((r) => r.statusCode >= 400)).toHaveLength(1);
    const manifests = (
      await h.db.query(
        "select * from preparation_release_manifests where package_id=$1",
        [id],
      )
    ).rows;
    expect(manifests).toHaveLength(1);
    const m = manifests[0];
    expect(m.body).toMatchObject({
      package_id: id,
      package_revision: 0,
      feature_version: "0.1.0",
      requirements_confirmation_id: expect.any(String),
      preparation_digest: { algorithm: "sha256" },
      basis_refs: expect.any(Array),
    });
    expect(m.digest).toBe(digest(m.body));
    const runs = (
      await h.db.query(
        "select body from runs where package_id=$1 and role='author'",
        [id],
      )
    ).rows;
    expect(runs).toHaveLength(1);
    expect(runs[0].body.preparation_manifest_digest.value).toBe(m.digest);
    await expect(
      h.db.query(
        "update preparation_release_manifests set body='{}' where package_id=$1",
        [id],
      ),
    ).rejects.toThrow(/append-only/);
  });
  it("invalidates pending release challenges on technical edits without discarding requirements confirmation", async () => {
    const { id, url } = await ready(),
      o = await releaseOptions(id),
      v = (await owner("GET", url)).json();
    const a = preparationContent(v.snapshot);
    a.technical_plan.summary += " technical edit";
    const edited = await owner("PUT", url, a, {
      "if-match": `"${v.content_digest.value}"`,
    });
    expect(edited.json().confirmed).toBe(true);
    expect((await release(id, passkey.assert(o.options))).statusCode).toBe(403);
    expect(
      (await h.db.query("select * from runs where package_id=$1", [id]))
        .rowCount,
    ).toBe(0);
  });
  it("refuses release before confirmation and preserves the exact legacy subject shape", async () => {
    const p = { ...packageFixture(), id: `WP-${randomUUID()}` };
    await h.db.query(
      "insert into packages(id,revision,status,body) values($1,0,'draft',$2)",
      [p.id, p],
    );
    const before = (await owner("GET", `/packages/${p.id}`)).json();
    expect(before.subject_digest.value).toBe(
      digest({ package: p, outputs: [], pre_check: null }),
    );
    await owner("POST", `/packages/${p.id}/preparation`, {
      package_revision: 0,
      idempotency_key: "request-1",
    });
    const refused = await owner("POST", `/packages/${p.id}/decisions/options`, {
      kind: "release",
      package_revision: 0,
    });
    expect(refused.statusCode).toBe(409);
    expect(
      (await owner("GET", `/packages/${p.id}`)).json().subject_digest.value,
    ).not.toBe(before.subject_digest.value);
  });
});
