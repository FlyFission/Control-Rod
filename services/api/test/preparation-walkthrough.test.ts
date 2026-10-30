import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, it } from "vitest";
import { preparedHarness } from "./preparation-flow.js";
import { ORIGIN } from "./harness.js";
let f: Awaited<ReturnType<typeof preparedHarness>>;
beforeAll(async () => {
  f = await preparedHarness();
}, 120_000);
afterAll(async () => f?.h.stop());
it("rehearses requirements, release, independent-role results and acceptance for a known JSON bugfix", async () => {
  const root = resolve(fileURLToPath(new URL("../../../", import.meta.url))),
    path = "spec/vectors/canonical-digest.json";
  const commit = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const pin = createHash("sha256")
    .update(readFileSync(resolve(root, path)))
    .digest("hex");
  const p = await f.draft(
    [
      {
        kind: "repository",
        reference: "repository:control-rod",
        revision: commit,
        commit,
        path,
        digest: { algorithm: "sha256", value: pin },
      },
    ],
    (d) => {
      d.request_kind = "bugfix";
      d.package_contract.mode = "software";
      d.package_contract.objective =
        "Reject ambiguous JSON before control-plane mutations";
      d.context = {
        problem:
          "Repeated JSON keys must not silently change a controlled request",
        repro: "Send a captures request with two text keys",
        expected: "Refuse before inserting a capture",
        actual:
          "The earlier recorded RED baseline accepted the last duplicate value",
        environment: "This repository's Fastify API and generated contracts",
      };
      d.requirements[0]!.statement =
        "Ambiguous JSON cannot create controlled state";
      d.criteria[0]!.statement =
        "A repeated JSON key is refused and creates no capture";
      d.technical_plan.summary =
        "Validate raw canonical-profile tokens before framework object conversion";
      d.technical_plan.checks[0]!.method =
        "HTTP refusal plus database row-count comparison";
      d.technical_plan.checks[0]!.expected_result =
        "Refusal with unchanged capture count";
    },
  );
  await f.release(p.id);
  const author = (await f.claim()).json();
  expect((await f.complete(author)).json().status).toBe("succeeded");
  const checker = (await f.claim(["claude"])).json();
  const before = (await f.h.db.query("select count(*) as n from captures"))
    .rows[0].n;
  const refused = await f.h.app.inject({
    method: "POST",
    url: "/captures",
    headers: {
      cookie: f.cookie,
      origin: ORIGIN,
      "content-type": "application/json",
    },
    payload: '{"text":"first","text":"second"}',
  });
  const after = (await f.h.db.query("select count(*) as n from captures"))
    .rows[0].n;
  expect(refused.statusCode, refused.body).toBe(400);
  expect(after).toBe(before);
  const proof = {
    scope:
      "fixture replay of a known fixed bug; virtual owner passkey and simulated daemon",
    source: { commit, path, sha256: pin },
    observation: {
      response_status: refused.statusCode,
      captures_before: before,
      captures_after: after,
    },
  };
  const bytes = Buffer.from(JSON.stringify(proof, null, 2));
  const checked = await f.complete(checker, {
    verification: { outcome: "pass", findings: [] },
    outputs: [
      {
        name: "json-refusal-evidence.json",
        content_base64: bytes.toString("base64"),
      },
    ],
    criterion_results: {
      package_id: p.id,
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
              evidence_refs: ["checker:json-refusal-evidence.json"],
            },
          ],
        },
      ],
    },
  });
  expect(checked.json().status, checked.body).toBe("succeeded");
  const options = await f.owner("POST", `/packages/${p.id}/decisions/options`, {
    kind: "accept",
    package_revision: 0,
  });
  expect(options.statusCode, options.body).toBe(200);
  const accepted = await f.owner("POST", `/packages/${p.id}/decisions`, {
    kind: "accept",
    package_revision: 0,
    assertion: f.passkey.assert(options.json().options),
  });
  expect(accepted.statusCode, accepted.body).toBe(201);
  if (process.env.CONTROLROD_WALKTHROUGH_REPORT)
    writeFileSync(
      process.env.CONTROLROD_WALKTHROUGH_REPORT,
      JSON.stringify(
        {
          ...proof,
          final_state: (await f.owner("GET", `/packages/${p.id}`)).json()
            .package.status,
          results_recorded: true,
        },
        null,
        2,
      ),
    );
});

it("migrations 009 and 010 preserve the full preparation history (review R14)", async () => {
  const { assertMigrationsPreserveHistory } = await import("./migration-preservation.js");
  await assertMigrationsPreserveHistory(f.h.db, ["packages", "decisions", "preparation_snapshots", "preparation_confirmations", "preparation_release_manifests", "preparation_criterion_results"]);
});
