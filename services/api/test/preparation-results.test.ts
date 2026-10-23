import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { preparedHarness } from "./preparation-flow.js";
import { daemonHeaders } from "./harness.js";
let f: Awaited<ReturnType<typeof preparedHarness>>;
beforeAll(async () => {
  f = await preparedHarness();
}, 120_000);
afterAll(async () => f?.h.stop());
async function author() {
  const p = await f.draft();
  await f.release(p.id);
  const job = (await f.claim()).json();
  expect((await f.complete(job)).json().status).toBe("succeeded");
  const checked = await f.claim(["claude"]);
  expect(checked.statusCode, checked.body).toBe(200);
  return { ...p, checker: checked.json() };
}
function submission(p: { id: string; checker: any }, outcome = "pass") {
  return {
    package_id: p.id,
    package_revision: 0,
    release_manifest_digest: p.checker.run.preparation_manifest_digest,
    results: [
      {
        criterion_id: "AC-1",
        outcome,
        check_results: [
          {
            check_id: "CHECK-1",
            outcome,
            evidence_refs: outcome === "open" ? [] : ["checker:checks.md"],
          },
        ],
        finding_refs: [],
      },
    ],
  };
}
async function check(
  p: { checker: any },
  results: unknown,
  outcome = "pass",
  outputs?: unknown[],
) {
  return f.complete(p.checker, {
    verification: { outcome, findings: [] },
    ...(results === undefined ? {} : { criterion_results: results }),
    outputs: outputs ?? [
      {
        name: "checks.md",
        content_base64: Buffer.from(
          "Independent review log: report exists",
        ).toString("base64"),
      },
    ],
  });
}
async function decide(id: string, kind: string, reason?: string) {
  const o = await f.owner("POST", `/packages/${id}/decisions/options`, {
    kind,
    package_revision: 0,
  });
  if (o.statusCode !== 200) return o;
  return f.owner("POST", `/packages/${id}/decisions`, {
    kind,
    package_revision: 0,
    ...(reason ? { reason } : {}),
    assertion: f.passkey.assert(o.json().options),
  });
}
describe("typed criterion verification admission", () => {
  it("binds complete results to the actual verification record and admits signed acceptance with retained checker evidence", async () => {
    const p = await author(),
      r = await check(p, submission(p));
    expect(r.json(), r.body).toMatchObject({ status: "succeeded" });
    const v = (await f.owner("GET", `/packages/${p.id}`)).json();
    expect(v.criterion_results.results).toHaveLength(1);
    expect(v.preparation_verification_complete).toBe(true);
    const evidence = await f.owner(
      "GET",
      `/packages/${p.id}/verification-evidence/${p.checker.run.id}/checks.md`,
    );
    expect(evidence.statusCode, evidence.body).toBe(200);
    expect(evidence.body).toContain("Independent review log");
    expect(evidence.headers["content-security-policy"]).toContain("sandbox");
    expect(
      (
        await f.h.app.inject({
          method: "GET",
          url: `/packages/${p.id}/verification-evidence/${p.checker.run.id}/checks.md`,
          headers: daemonHeaders,
        })
      ).statusCode,
    ).toBe(403);
    expect((await decide(p.id, "accept")).statusCode).toBe(201);
  });
  it("refuses missing criterion results without publishing a verification record", async () => {
    const p = await author(),
      r = await check(p, undefined);
    expect(r.json().refusal.code).toBe("criterion-results-required");
    expect(
      (
        await f.h.db.query("select * from verifications where run_id=$1", [
          p.checker.run.id,
        ])
      ).rowCount,
    ).toBe(0);
  });
  for (const kind of [
    "unknown criterion",
    "duplicate criterion",
    "unknown check",
    "missing evidence",
    "wrong manifest",
  ])
    it(`refuses ${kind}`, async () => {
      const p = await author(),
        s = submission(p);
      if (kind === "unknown criterion")
        s.results[0]!.criterion_id = "not-controlled";
      if (kind === "duplicate criterion") s.results.push(s.results[0]!);
      if (kind === "unknown check")
        s.results[0]!.check_results[0]!.check_id = "not-controlled";
      if (kind === "missing evidence")
        s.results[0]!.check_results[0]!.evidence_refs = ["checker:missing.md"];
      if (kind === "wrong manifest")
        s.release_manifest_digest = {
          algorithm: "sha256",
          value: "0".repeat(64),
        };
      const r = await check(p, s);
      expect(r.json().status).toBe("failed");
      expect(r.json().refusal.code).toMatch(/criterion|manifest/);
    });
  it("refuses ambiguous JSON artifact results before duplicate keys are lost", async () => {
    const p = await author(),
      s = JSON.stringify(submission(p));
    const raw = s.replace('"results":', '"results":[],"results":');
    const r = await check(p, undefined, "pass", [
      {
        name: "checks.md",
        content_base64: Buffer.from("Review log").toString("base64"),
      },
      {
        name: "criterion-results.json",
        content_base64: Buffer.from(raw).toString("base64"),
      },
    ]);
    expect(r.json().refusal.code).toBe("invalid-criterion-results");
  });
  it("does not let an author supply checker results and blocks acceptance after basis changes", async () => {
    const p = await f.draft();
    await f.release(p.id);
    const job = (await f.claim()).json();
    const r = await f.complete(job, { criterion_results: {} });
    expect(r.json().refusal.code).toBe("criterion-role");
    const checked = await author();
    expect((await check(checked, submission(checked))).json().status).toBe(
      "succeeded",
    );
    await f.adminQuery(
      "update packages set body=jsonb_set(body,'{objective}','\"Changed after checking\"') where id=$1",
      [checked.id],
    );
    expect((await decide(checked.id, "accept")).statusCode).toBe(409);
  });
  it("refuses acceptance when retained evidence is altered, even if its mutable row hash is changed too", async () => {
    const p = await author();
    expect((await check(p, submission(p))).json().status).toBe("succeeded");
    await f.adminQuery(
      "update outputs set bytes=$2,sha256=$3 where run_id=$1 and name='checks.md'",
      [
        p.checker.run.id,
        Buffer.from("Tampered"),
        createHash("sha256").update("Tampered").digest("hex"),
      ],
    );
    expect((await decide(p.id, "accept")).statusCode).toBe(409);
    const v = (await f.owner("GET", `/packages/${p.id}`)).json();
    expect(v.criterion_results_integrity).toBe("changed");
    expect(
      (
        await f.owner(
          "GET",
          `/packages/${p.id}/verification-evidence/${p.checker.run.id}/checks.md`,
        )
      ).statusCode,
    ).toBe(409);
    expect(
      (await decide(p.id, "return", "Restore a controlled verification basis"))
        .statusCode,
    ).toBe(201);
  });
  it("never waives an unexecuted required check, but permits a reasoned exception after completed failed checks", async () => {
    for (const execution of ["open", "fail"]) {
      const p = await f.draft();
      await f.release(p.id);
      for (let round = 1; round <= 3; round++) {
        const a = await f.claim();
        expect(a.statusCode, a.body).toBe(200);
        expect(a.json().run.package_id).toBe(p.id);
        expect((await f.complete(a.json())).json().status).toBe("succeeded");
        const c = await f.claim(["claude"]);
        expect(c.statusCode, c.body).toBe(200);
        const fixture = { ...p, checker: c.json() };
        const result = await check(
          fixture,
          submission(fixture, execution),
          execution === "open" ? "inconclusive" : "fail",
        );
        expect(result.json().status, result.body).toBe("succeeded");
      }
      const decision = await decide(
        p.id,
        "accept-with-findings",
        "Owner explicitly accepts the recorded findings",
      );
      expect(decision.statusCode, decision.body).toBe(
        execution === "open" ? 403 : 201,
      );
    }
  });
  it("excludes private preparation canaries from the checker while delivering controlled contracts and inputs", async () => {
    const canary = "PRIVATE-PREPARER-CANARY";
    const p = await f.draft(undefined, (d) => {
      d.context.implementation_notes = canary;
      d.questions.push({
        id: "Q-private",
        kind: "question",
        text: canary,
        owner: "owner",
        blocking: false,
        state: "open",
        resolution_refs: [],
      });
    });
    await f.release(p.id);
    const author = (await f.claim()).json();
    expect(
      author.inputs.some((v: { content_base64: string }) =>
        Buffer.from(v.content_base64, "base64").toString().includes(canary),
      ),
    ).toBe(true);
    expect((await f.complete(author)).json().status).toBe("succeeded");
    const checker = (await f.claim(["claude"])).json();
    expect(
      checker.inputs.some((v: { content_base64: string }) =>
        Buffer.from(v.content_base64, "base64").toString().includes(canary),
      ),
    ).toBe(false);
    expect(
      checker.inputs.some(
        (v: { name: string }) =>
          v.name === "schemas/CriterionResultSubmission.json",
      ),
    ).toBe(true);
    expect(
      (await check({ ...p, checker }, submission({ ...p, checker }))).json()
        .status,
    ).toBe("succeeded");
  });
});
