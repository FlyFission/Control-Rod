import { tx } from "../src/db/index.js";
import { randomUUID } from "node:crypto";
import { expect } from "vitest";
import {
  startHarness,
  signIn,
  VirtualAuthenticator,
  ORIGIN,
  daemonHeaders,
} from "./harness.js";
import { packageFixture } from "./preparation-fixtures.js";
import { preparationContent } from "../src/preparation/store.js";
import type { AppOptions } from "../src/app.js";
import type {
  PreparationContent,
  PreparationView,
} from "../src/preparation/types.js";
export async function preparedHarness(options: Partial<AppOptions> = {}) {
  const h = await startHarness({
    guidedPreparation: true,
    preparedRelease: true,
    ...options,
  });
  const passkey = new VirtualAuthenticator();
  const cookie = await signIn(h.app, passkey);
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
  async function draft(
    basis?: PreparationContent["basis"],
    customize?: (content: PreparationContent) => void,
    confirm = true,
  ) {
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
    ).json<PreparationView>();
    const a = preparationContent(v.snapshot);
    if (basis) {
      a.basis = basis;
      a.requirements[0]!.source_refs = [basis[0]!.reference];
    }
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
      rollout: "Owner reviews before use",
      risks: ["Missing inputs hold"],
    };
    customize?.(a);
    const saved = await owner("PUT", url, a, {
      "if-match": `"${v.content_digest.value}"`,
    });
    expect(saved.statusCode, saved.body).toBe(200);
    v = saved.json();
    if (confirm) {
      const o = await owner("POST", url + "/confirm/options", {
        expected_requirements_digest: v.requirements_digest,
      });
      expect(o.statusCode, o.body).toBe(200);
      const c = await owner("POST", url + "/confirm", {
        assertion: passkey.assert(o.json().options),
      });
      expect(c.statusCode, c.body).toBe(201);
    }
    return {
      id: p.id,
      url,
      view: (await owner("GET", url)).json<PreparationView>(),
    };
  }
  async function release(id: string) {
    const o = await owner("POST", `/packages/${id}/decisions/options`, {
      kind: "release",
      package_revision: 0,
    });
    expect(o.statusCode, o.body).toBe(200);
    const r = await owner("POST", `/packages/${id}/decisions`, {
      kind: "release",
      package_revision: 0,
      assertion: passkey.assert(o.json().options),
    });
    expect(r.statusCode, r.body).toBe(201);
    return r.json();
  }
  const claim = (runtimes = ["fake"]) =>
    h.app.inject({
      method: "POST",
      url: "/runner/claim",
      headers: daemonHeaders,
      payload: { runtimes },
    });
  const complete = (job: any, extra: Record<string, unknown> = {}) =>
    h.app.inject({
      method: "POST",
      url: `/runner/runs/${job.run.id}/complete`,
      headers: daemonHeaders,
      payload: {
        claim_token: job.claim.token,
        idempotency_key: `completion-${job.run.id}`,
        status: "succeeded",
        outputs: [
          {
            name: "report.md",
            content_base64: Buffer.from("Controlled report").toString("base64"),
          },
        ],
        ...extra,
      },
    });
  const adminQuery = (sql: string, values?: unknown[]) =>
    tx(h.db, (c) => c.query(sql, values));
  return {
    h,
    cookie,
    owner,
    passkey,
    draft,
    release,
    claim,
    complete,
    adminQuery,
  };
}
