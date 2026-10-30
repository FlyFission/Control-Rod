import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { preparedHarness } from "./preparation-flow.js";
import {
  grantRun,
  grantConfig,
  grantHeaders,
} from "./preparation-grant-fixture.js";
import { issuePreparationGrant } from "../src/preparation/grants.js";
let f: Awaited<ReturnType<typeof preparedHarness>>;
beforeAll(async () => {
  f = await preparedHarness();
}, 120_000);
afterAll(async () => f?.h.stop());
async function create(leaseMs = 60_000) {
  const s = await grantRun(f, { leaseMs });
  return {
    ...s,
    ...(await issuePreparationGrant(f.h.db, grantConfig, s.run.id, s.token)),
  };
}
const begin = (v: any, intent: object) =>
  f.h.app.inject({
    method: "POST",
    url: `/runner/preparation-grants/${v.grant.id}/begin`,
    headers: grantHeaders(v.token),
    payload: intent,
  });
const finish = (v: any, p: any, result: object) =>
  f.h.app.inject({
    method: "POST",
    url: `/runner/preparation-grants/${v.grant.id}/finalize`,
    headers: grantHeaders(v.token),
    payload: { use_id: p.use_id, use_token: p.use_token, result },
  });
const proposal = (s: string) => ({
  kind: "write-proposal",
  content_base64: Buffer.from(s).toString("base64"),
});
describe("grant concurrency and final database deadlines", () => {
  it("admits exactly one proposal across two distinct concurrent valid write permits", async () => {
    const v = await create(),
      a = await begin(v, { kind: "write-proposal" }),
      b = await begin(v, { kind: "write-proposal" });
    expect(a.statusCode, a.body).toBe(200);
    expect(b.statusCode, b.body).toBe(200);
    const results = await Promise.all([
      finish(v, a.json(), proposal("one")),
      finish(v, b.json(), proposal("two")),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const rows = (
      await f.h.db.query(
        "select use_id,bytes from preparation_grant_proposals where grant_id=$1",
        [v.grant.id],
      )
    ).rows;
    expect(rows).toHaveLength(1);
    const winner = results.find((r) => r.statusCode === 200)!.json();
    expect(rows[0].use_id).toBe(winner.use_id);
    expect(
      (
        await f.h.db.query(
          "select 1 from preparation_grant_receipts where grant_id=$1",
          [v.grant.id],
        )
      ).rowCount,
    ).toBe(1);
  });
  it("rolls back an audit-blocked finalization and releases its package lock", async () => {
    const v = await create(),
      p = await begin(v, { kind: "write-proposal" });
    expect(p.statusCode, p.body).toBe(200);
    const holder = await f.h.admin.connect();
    await holder.query("begin");
    await holder.query("lock table events in exclusive mode");
    try {
      const response = await finish(v, p.json(), proposal("not acknowledged"));
      expect(response.statusCode, response.body).toBe(409);
      expect(response.json().code).toBe("grant-busy");
      const observer = await f.h.admin.connect();
      try {
        await observer.query("begin");
        await observer.query(
          "select id from packages where id=$1 for update nowait",
          [v.p.id],
        );
        await observer.query("rollback");
      } finally {
        observer.release();
      }
      expect(
        (
          await f.h.db.query(
            "select 1 from preparation_grant_proposals where grant_id=$1",
            [v.grant.id],
          )
        ).rowCount,
      ).toBe(0);
    } finally {
      await holder.query("rollback");
      holder.release();
    }
    expect(
      (await finish(v, p.json(), proposal("after audit recovers"))).statusCode,
    ).toBe(200);
  });
  it.each(["begin", "first-finalize", "completed-replay"])(
    "enforces a deferred deadline after ordinary %s checks",
    async (mode) => {
      const v = await create(2_000);
      let permit: any;
      if (mode !== "begin") {
        const p = await begin(v, { kind: "write-proposal" });
        expect(p.statusCode, p.body).toBe(200);
        permit = p.json();
      }
      const result = proposal("retained authoritative custody");
      if (mode === "completed-replay")
        expect((await finish(v, permit, result)).statusCode).toBe(200);
      const before = (
        await f.h.db.query(
          "select last_value from preparation_grant_guards_id_seq",
        )
      ).rows[0].last_value;
      await f.h.admin.query(
        `create function grant_probe_delay() returns trigger language plpgsql as $$ declare remaining double precision; begin select greatest(0,extract(epoch from(expires_at-clock_timestamp()))) into remaining from preparation_grants where id=NEW.grant_id; perform pg_sleep(remaining+0.02); return NEW; end $$`,
      );
      await f.h.admin.query(
        "create trigger grant_probe_delay before insert on preparation_grant_guards for each row execute function grant_probe_delay()",
      );
      try {
        const response =
          mode === "begin"
            ? await begin(v, { kind: "inspect" })
            : await finish(v, permit, result);
        expect(response.statusCode, response.body).toBe(409);
        expect(response.json().code).toBe("grant-stale");
        const after = (
          await f.h.db.query(
            "select last_value from preparation_grant_guards_id_seq",
          )
        ).rows[0].last_value;
        expect(Number(after)).toBe(Number(before) + 1);
        const count = (
          await f.h.db.query(
            "select 1 from preparation_grant_proposals where grant_id=$1",
            [v.grant.id],
          )
        ).rowCount;
        expect(count).toBe(mode === "completed-replay" ? 1 : 0);
      } finally {
        await f.h.admin.query(
          "drop trigger grant_probe_delay on preparation_grant_guards",
        );
        await f.h.admin.query("drop function grant_probe_delay()");
      }
    },
  );
  it("bounds lifetime acknowledgments and does not renew the budget on retry", async () => {
    const v = await create();
    let exhausted = false;
    for (let i = 0; i < v.grant.max_operations; i++) {
      const p = await begin(v, { kind: "inspect" });
      if (p.statusCode === 409) {
        exhausted = true;
        break;
      }
      expect(p.statusCode, p.body).toBe(200);
      const r = await finish(v, p.json(), { kind: "inspect" });
      if (r.statusCode === 409) {
        exhausted = true;
        break;
      }
      expect(r.statusCode, r.body).toBe(200);
    }
    expect(exhausted).toBe(true);
    const state = (
      await f.h.db.query(
        "select operations from preparation_grant_state where grant_id=$1",
        [v.grant.id],
      )
    ).rows[0];
    expect(state.operations).toBe(v.grant.max_operations);
    expect((await begin(v, { kind: "inspect" })).statusCode).toBe(409);
  });
});

it("bounds the whole authority transaction and relinquishes its row locks", async () => {
  const v = await create();
  const { grantTx } = await import("../src/preparation/grant-state.js");
  await expect(
    grantTx(f.h.db, "grant.begin-use", async (c) => {
      await c.query("select id from packages where id=$1 for update", [v.p.id]);
      await c.query("select pg_sleep(3)");
      await c.query("select pg_sleep(3)");
    }),
  ).rejects.toMatchObject({ code: "grant-busy" });
  const observer = await f.h.admin.connect();
  try {
    await observer.query("begin");
    await observer.query(
      "select id from packages where id=$1 for update nowait",
      [v.p.id],
    );
    await observer.query("rollback");
  } finally {
    observer.release();
  }
}, 10_000);
