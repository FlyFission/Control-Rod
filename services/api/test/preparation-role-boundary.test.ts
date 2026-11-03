import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import {
  startHarness,
  daemonHeaders,
  VirtualAuthenticator,
  signIn,
  ORIGIN,
} from "./harness.js";
import { packageFixture } from "./preparation-fixtures.js";
let h: Awaited<ReturnType<typeof startHarness>>;
beforeAll(async () => {
  h = await startHarness();
}, 120_000);
afterAll(async () => h?.stop());
describe("preparation integration role boundary", () => {
  it.each(["unexpected-role", "intake"])(
    "does not dispatch inconsistent %s rows as legacy author work",
    async (role) => {
      const p = { ...packageFixture(), id: `WP-${randomUUID()}` };
      await h.admin.query(
        "insert into packages(id,revision,status,body) values($1,0,'draft',$2)",
        [p.id, p],
      );
      const run = {
        schema_version: "0.1.0",
        id: `RUN-${randomUUID()}`,
        package_id: p.id,
        package_revision: 0,
        role: "author",
        agent_baseline: "author",
        runtime: { kind: "subscription", provider: "fake", model: "default" },
        round: 1,
        status: "queued",
        queued_at: new Date().toISOString(),
      };
      await h.admin.query(
        "insert into runs(id,package_id,package_revision,role,round,status,body) values($1,$2,0,$3,1,'queued',$4)",
        [run.id, p.id, role, run],
      );
      const claim = await h.app.inject({
        method: "POST",
        url: "/runner/claim",
        headers: daemonHeaders,
        payload: { runtimes: ["fake"] },
      });
      expect(claim.statusCode, claim.body).toBe(204);
      const row = (
        await h.db.query(
          "select status,claim_token_hash from runs where id=$1",
          [run.id],
        )
      ).rows[0];
      expect(row.status).toBe("queued");
      expect(row.claim_token_hash).toBeNull();
    },
  );
});

describe("legacy mutators cannot adopt an unsupported role", () => {
  it.each(["log", "complete", "requeue"])(
    "refuses %s without changing custody",
    async (operation) => {
      const p = {
        ...packageFixture(),
        id: `WP-${randomUUID()}`,
        status: "in-verification",
      };
      await h.admin.query(
        "insert into packages(id,revision,status,body) values($1,0,$2,$3)",
        [p.id, p.status, p],
      );
      const token = "fixture-narrow-claim",
        lease = new Date(Date.now() + 60_000).toISOString();
      const state = operation === "requeue" ? "failed" : "running";
      const run = {
        schema_version: "0.1.0",
        id: `RUN-${randomUUID()}`,
        package_id: p.id,
        package_revision: 0,
        role: "author",
        agent_baseline: "author",
        runtime: { kind: "subscription", provider: "fake", model: "default" },
        round: 1,
        status: state,
        queued_at: new Date().toISOString(),
        lease_expires_at: lease,
      };
      await h.admin.query(
        "insert into runs(id,package_id,package_revision,role,round,status,body,claim_token_hash,lease_expires_at) values($1,$2,0,'unexpected-role',1,$3,$4,$5,$6)",
        [
          run.id,
          p.id,
          state,
          run,
          createHash("sha256").update(token).digest("hex"),
          lease,
        ],
      );
      let result;
      if (operation === "requeue") {
        const cookie = await signIn(h.app, new VirtualAuthenticator());
        result = await h.app.inject({
          method: "POST",
          url: `/packages/${p.id}/runs/${run.id}/requeue`,
          headers: { cookie, origin: ORIGIN },
        });
      } else
        result = await h.app.inject({
          method: "POST",
          url: `/runner/runs/${run.id}/${operation}`,
          headers: daemonHeaders,
          payload: {
            claim_token: token,
            ...(operation === "log"
              ? { lines: ["unapproved heartbeat"] }
              : {
                  idempotency_key: "unsupported-completion",
                  status: "failed",
                  outputs: [
                    {
                      name: "proposal.json",
                      content_base64:
                        Buffer.from("unapproved").toString("base64"),
                    },
                  ],
                }),
          },
        });
      expect(result.statusCode, result.body).toBe(409);
      expect(result.json().code).toBe("unsupported-run-role");
      const row = (
        await h.db.query(
          "select status,body,log,receipt from runs where id=$1",
          [run.id],
        )
      ).rows[0];
      expect(row.status).toBe(state);
      expect(row.body).toEqual(run);
      expect(row.log).toEqual([]);
      expect(row.receipt).toBeNull();
      expect(
        (await h.db.query("select 1 from outputs where run_id=$1", [run.id]))
          .rowCount,
      ).toBe(0);
    },
  );
});
