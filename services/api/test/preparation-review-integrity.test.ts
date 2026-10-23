import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { preparedHarness } from "./preparation-flow.js";
import { digest } from "../src/kernel.js";
let f: Awaited<ReturnType<typeof preparedHarness>>;
beforeAll(async () => {
  f = await preparedHarness();
}, 120_000);
afterAll(async () => f?.h.stop());
async function finish(id: string) {
  const a = await f.claim();
  expect(a.statusCode, a.body).toBe(200);
  const author = a.json();
  expect(author.run.package_id).toBe(id);
  expect((await f.complete(author)).json().status).toBe("succeeded");
  const c = await f.claim(["claude"]);
  expect(c.statusCode, c.body).toBe(200);
  const checker = c.json();
  const r = await f.complete(checker, {
    verification: { outcome: "pass", findings: [] },
    outputs: [
      {
        name: "checks.md",
        content_base64: Buffer.from("Recorded checker evidence").toString(
          "base64",
        ),
      },
    ],
    criterion_results: {
      package_id: id,
      package_revision: 0,
      release_manifest_digest: checker.run.preparation_manifest_digest,
      results: [
        {
          criterion_id: "AC-1",
          outcome: "pass",
          finding_refs: [],
          check_results: [
            {
              check_id: "CHECK-1",
              outcome: "pass",
              evidence_refs: ["checker:checks.md"],
            },
          ],
        },
      ],
    },
  });
  expect(r.json().status, r.body).toBe("succeeded");
  return { author, checker };
}
async function accept(id: string) {
  const o = await f.owner("POST", `/packages/${id}/decisions/options`, {
    kind: "accept",
    package_revision: 0,
  });
  expect(o.statusCode, o.body).toBe(200);
  return f.owner("POST", `/packages/${id}/decisions`, {
    kind: "accept",
    package_revision: 0,
    assertion: f.passkey.assert(o.json().options),
  });
}
async function acceptedParent() {
  const p = await f.draft();
  await f.release(p.id);
  await finish(p.id);
  expect((await accept(p.id)).statusCode).toBe(201);
  return p;
}
async function confirm(id: string, url: string, requirements_digest: unknown) {
  const o = await f.owner("POST", url + "/confirm/options", {
    expected_requirements_digest: requirements_digest,
  });
  expect(o.statusCode, o.body).toBe(200);
  expect(
    (
      await f.owner("POST", url + "/confirm", {
        assertion: f.passkey.assert(o.json().options),
      })
    ).statusCode,
  ).toBe(201);
}
describe("final-review controlled input and output regressions", () => {
  it("refuses confirmation when a declared dependency has no complete basis pin", async () => {
    const parent = await acceptedParent();
    const p = await f.draft(
      undefined,
      (d) => {
        d.package_contract.design_inputs = [
          { doc: parent.id, revision: "0", use: "Controlled input" },
        ];
      },
      false,
    );
    expect(
      (
        await f.owner("POST", p.url + "/confirm/options", {
          expected_requirements_digest: p.view.requirements_digest,
        })
      ).statusCode,
    ).toBe(409);
  });
  it("refreshes exact declared dependency bytes into a signed basis and refuses a newer revision at claim", async () => {
    const parent = await acceptedParent();
    const p = await f.draft(
      undefined,
      (d) => {
        d.package_contract.design_inputs = [
          { doc: parent.id, revision: "0", use: "Controlled input" },
        ];
      },
      false,
    );
    const refreshed = await f.owner(
      "POST",
      p.url + "/basis/refresh",
      {},
      { "if-match": `"${p.view.content_digest.value}"` },
    );
    expect(refreshed.statusCode, refreshed.body).toBe(200);
    const v = refreshed.json();
    expect(
      v.snapshot.basis.find(
        (b: { reference: string }) => b.reference === `package:${parent.id}`,
      ).artifacts,
    ).toHaveLength(1);
    await confirm(p.id, p.url, v.requirements_digest);
    await f.release(p.id);
    const parentBody = (
      await f.h.db.query(
        "select body from packages where id=$1 and revision=0",
        [parent.id],
      )
    ).rows[0].body;
    await f.adminQuery(
      "insert into packages(id,revision,status,body) values($1,1,'accepted',$2)",
      [parent.id, { ...parentBody, revision: 1 }],
    );
    expect((await f.claim()).statusCode).toBe(204);
  });
  it("dispatches retained pinned dependency bytes instead of live dependency output lookup", async () => {
    const parent = await acceptedParent();
    const p = await f.draft(
      undefined,
      (d) => {
        d.package_contract.design_inputs = [
          { doc: parent.id, revision: "0", use: "Controlled input" },
        ];
      },
      false,
    );
    const refreshed = await f.owner(
      "POST",
      p.url + "/basis/refresh",
      {},
      { "if-match": `"${p.view.content_digest.value}"` },
    );
    expect(refreshed.statusCode, refreshed.body).toBe(200);
    await confirm(p.id, p.url, refreshed.json().requirements_digest);
    await f.release(p.id);
    const job = await f.claim();
    expect(job.statusCode, job.body).toBe(200);
    const input = job
      .json()
      .inputs.find(
        (v: { name: string }) => v.name === `deps/${parent.id}/report.md`,
      );
    expect(Buffer.from(input.content_base64, "base64").toString()).toBe(
      "Controlled report",
    );
  });
  it("rehashes and locks author deliverables before accepting an already signed review", async () => {
    const p = await f.draft();
    await f.release(p.id);
    const { author } = await finish(p.id);
    const o = await f.owner("POST", `/packages/${p.id}/decisions/options`, {
      kind: "accept",
      package_revision: 0,
    });
    expect(o.statusCode, o.body).toBe(200);
    await f.adminQuery("update outputs set bytes=$2 where run_id=$1", [
      author.run.id,
      Buffer.from("Corrupted author output"),
    ]);
    const accepted = await f.owner("POST", `/packages/${p.id}/decisions`, {
      kind: "accept",
      package_revision: 0,
      assertion: f.passkey.assert(o.json().options),
    });
    expect(accepted.statusCode, accepted.body).toBe(409);
    expect(
      (await f.owner("GET", `/packages/${p.id}`)).json().package.status,
    ).toBe("in-verification");
  });
});
