import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { preparedHarness } from "./preparation-flow.js";
import { packageFixture } from "./preparation-fixtures.js";
import { MIGRATIONS, migrate } from "../src/db/migrate.js";
import { tx } from "../src/db/index.js";
let f: Awaited<ReturnType<typeof preparedHarness>>;
beforeAll(async () => {
  f = await preparedHarness();
}, 120_000);
afterAll(async () => f?.h.stop());
describe("manual pilot compatibility and missing-input holds", () => {
  it("refuses pre-protocol writers on every enrolled lifecycle table but permits legacy draft writes", async () => {
    const p = await f.draft();
    await f.release(p.id);
    await expect(
      f.h.db.query("update packages set status='in-work' where id=$1", [p.id]),
    ).rejects.toThrow(/protocol/);
    await expect(
      f.h.db.query("update runs set status='running' where package_id=$1", [
        p.id,
      ]),
    ).rejects.toThrow(/protocol/);
    await expect(
      f.h.db.query(
        "insert into outputs(run_id,package_id,package_revision,name,sha256,bytes) select id,package_id,package_revision,'old.bin','old',decode('00','hex') from runs where package_id=$1",
        [p.id],
      ),
    ).rejects.toThrow(/protocol/);
    await expect(
      f.h.db.query(
        "insert into verifications(run_id,package_id,package_revision,round,body) select id,package_id,package_revision,round,'{}'::jsonb from runs where package_id=$1 limit 1",
        [p.id],
      ),
    ).rejects.toThrow(/protocol/);
    await expect(
      f.h.db.query(
        "insert into decisions(id,package_id,package_revision,kind,body) values('D-unaware', $1,0,'release','{}'::jsonb)",
        [p.id],
      ),
    ).rejects.toThrow(/protocol/);
    const legacy = { ...packageFixture(), id: "WP-legacy-pilot" };
    await f.h.db.query(
      "insert into packages(id,revision,status,body) values($1,0,'draft',$2)",
      [legacy.id, legacy],
    );
    await f.h.db.query(
      "update packages set body=jsonb_set(body,'{objective}','\"Legacy draft still editable\"') where id=$1",
      [legacy.id],
    );
    await expect(migrate(f.h.db, MIGRATIONS.slice(0, -1))).rejects.toThrow(
      /newer|unknown/i,
    );
    const job = await f.claim();
    expect(job.statusCode, job.body).toBe(200);
    expect(job.json().run.package_id).toBe(p.id);
  });
  it("keeps HVAC preparation held with sourced-input questions and produces no invented calculation", async () => {
    const p = await f.draft(
      undefined,
      (d) => {
        d.request_kind = "capital-projects";
        d.package_contract.mode = "capital-projects";
        d.context.problem =
          "Prepare an HVAC design basis; decisive loads, weather basis and governing code inputs have not been supplied.";
        d.requirements[0]!.statement =
          "Trace decisive HVAC inputs to controlled sources before calculation";
        d.criteria[0]!.statement =
          "Missing decisive design inputs remain explicit holds";
        d.questions.push({
          id: "Q-HVAC-BASIS",
          kind: "question",
          text: "Supply controlled design loads, weather basis and governing code/revision.",
          owner: "Requester",
          blocking: true,
          state: "open",
          resolution_refs: [],
        });
        d.technical_plan.checks[0]!.method = "alternate-calculation";
        d.technical_plan.checks[0]!.expected_result =
          "Sourced inputs support an independent rerun; missing inputs remain holds.";
      },
      false,
    );
    expect(p.view.confirmed).toBe(false);
    expect(p.view.blockers).toContainEqual(
      expect.objectContaining({ code: "open-item", owner: "Requester" }),
    );
    const r = await f.owner("POST", `/packages/${p.id}/decisions/options`, {
      kind: "release",
      package_revision: 0,
    });
    expect(r.statusCode).toBe(409);
    expect(
      (await f.h.db.query("select * from runs where package_id=$1", [p.id]))
        .rowCount,
    ).toBe(0);
    expect(
      (await f.h.db.query("select * from outputs where package_id=$1", [p.id]))
        .rowCount,
    ).toBe(0);
  });
});
