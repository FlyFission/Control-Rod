import pg from "pg";
import { SCHEMA } from "../src/db/schema.js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "./harness.js";
import { packageFixture } from "./preparation-fixtures.js";
import {
  enrollPreparation,
  editPreparation,
  readPreparation,
  preparationHistory,
  resolvePreparation,
  preparationContent,
} from "../src/preparation/store.js";
import { migrate, MIGRATIONS } from "../src/db/migrate.js";
import { loadValidator } from "../src/schemas.js";
let h: Harness;
const cfg = { ajv: loadValidator() };
beforeAll(async () => {
  h = await startHarness();
}, 120_000);
afterAll(async () => h?.stop());
async function fresh() {
  const p = { ...packageFixture(), id: `WP-${randomUUID()}` };
  await h.admin.query(
    "insert into packages(id,revision,status,body) values($1,0,'draft',$2)",
    [p.id, p],
  );
  return p;
}
const etag = (v: { content_digest: { value: string } }) =>
  `"${v.content_digest.value}"`;

describe("immutable preparation storage", () => {
  it("enrolls exactly once under retries and concurrent requests, rejects key changes", async () => {
    const p = await fresh();
    const a = await Promise.all([
      enrollPreparation(h.db, cfg, "owner", p.id, {
        package_revision: 0,
        idempotency_key: "request-1",
      }),
      enrollPreparation(h.db, cfg, "owner", p.id, {
        package_revision: 0,
        idempotency_key: "request-1",
      }),
    ]);
    expect(a[0]!.snapshot.id).toBe(a[1]!.snapshot.id);
    expect((await preparationHistory(h.db, p.id)).revisions).toHaveLength(1);
    await expect(
      enrollPreparation(h.db, cfg, "owner", p.id, {
        package_revision: 0,
        idempotency_key: "request-2",
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (
        await h.db.query(
          "select * from events where body->>'type'='preparation.enrolled' and body->>'subject'=$1",
          [p.id],
        )
      ).rowCount,
    ).toBe(1);
  });
  it("allows one concurrent edit, preserves old bytes and rejects missing CAS", async () => {
    const p = await fresh(),
      v = await enrollPreparation(h.db, cfg, "owner", p.id, {
        package_revision: 0,
        idempotency_key: "request-1",
      });
    const a = preparationContent(v.snapshot);
    a.context.problem = "Updated need";
    await expect(
      editPreparation(h.db, cfg, "owner", p.id, a, undefined),
    ).rejects.toMatchObject({ status: 428 });
    const rs = await Promise.allSettled([
      editPreparation(h.db, cfg, "owner", p.id, a, etag(v)),
      editPreparation(h.db, cfg, "other", p.id, a, etag(v)),
    ]);
    expect(rs.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(rs.find((r) => r.status === "rejected")).toMatchObject({
      reason: { status: 409 },
    });
    const history = await preparationHistory(h.db, p.id);
    expect(history.revisions).toHaveLength(2);
    expect(history.revisions[1]!.snapshot).toEqual(v.snapshot);
    expect((await readPreparation(h.db, p.id)).snapshot.revision).toBe(1);
    await expect(
      h.admin.query(
        "update preparation_snapshots set body='{}' where preparation_id=$1",
        [v.snapshot.id],
      ),
    ).rejects.toThrow(/append-only/);
  });
  it("updates contract and criteria atomically, refuses ID reuse and forged resolutions", async () => {
    const p = await fresh();
    let v = await enrollPreparation(h.db, cfg, "owner", p.id, {
      package_revision: 0,
      idempotency_key: "request-1",
    });
    let a = preparationContent(v.snapshot);
    a.criteria[0]!.statement = "New controlled criterion";
    a.package_contract.objective = "Updated objective";
    v = await editPreparation(h.db, cfg, "owner", p.id, a, etag(v));
    const stored = (
      await h.db.query("select body from packages where id=$1", [p.id])
    ).rows[0].body;
    expect(stored.objective).toBe(a.package_contract.objective);
    expect(stored.acceptance_criteria).toEqual(["New controlled criterion"]);
    a = preparationContent(v.snapshot);
    const removed = a.requirements.pop()!;
    v = await editPreparation(h.db, cfg, "owner", p.id, a, etag(v));
    a = preparationContent(v.snapshot);
    a.requirements.push(removed);
    await expect(
      editPreparation(h.db, cfg, "owner", p.id, a, etag(v)),
    ).rejects.toMatchObject({ status: 409, code: "retired-id" });
    a = preparationContent(v.snapshot);
    a.resolutions.push({
      id: "forged",
      item_id: "q",
      actor: { kind: "human", id: "another" },
      rationale: "pretend",
      source_refs: [],
    });
    await expect(
      editPreparation(h.db, cfg, "owner", p.id, a, etag(v)),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("records actual human resolutions with CAS and event; never trusts actor supplied in content", async () => {
    const p = await fresh();
    let v = await enrollPreparation(h.db, cfg, "owner", p.id, {
      package_revision: 0,
      idempotency_key: "request-1",
    });
    const a = preparationContent(v.snapshot);
    a.questions.push({
      id: "Q1",
      kind: "question",
      text: "Source?",
      owner: "owner",
      blocking: true,
      state: "open",
      resolution_refs: [],
    });
    v = await editPreparation(h.db, cfg, "owner", p.id, a, etag(v));
    v = await resolvePreparation(
      h.db,
      cfg,
      "actual-user",
      p.id,
      {
        item_id: "Q1",
        rationale: "Use controlled package",
        source_refs: [v.snapshot.basis[0]!.reference],
      },
      etag(v),
    );
    expect(v.snapshot.resolutions[0]!.actor).toEqual({
      kind: "human",
      id: "actual-user",
    });
    expect(v.snapshot.questions[0]!.state).toBe("resolved");
  });
  it("rolls back snapshot/head/package if event append fails", async () => {
    const p = await fresh(),
      v = await enrollPreparation(h.db, cfg, "owner", p.id, {
        package_revision: 0,
        idempotency_key: "request-1",
      });
    const a = preparationContent(v.snapshot);
    a.context.problem = "rolled back";
    await h.admin.query(
      "create function reject_prep_event() returns trigger language plpgsql as $$ begin if new.body->>'type'='preparation.edited' then raise exception 'simulated event failure'; end if; return new; end $$; create trigger reject_prep_event before insert on events for each row execute function reject_prep_event()",
    );
    try {
      await expect(
        editPreparation(h.db, cfg, "owner", p.id, a, etag(v)),
      ).rejects.toThrow(/simulated event failure/);
    } finally {
      await h.admin.query(
        "drop trigger reject_prep_event on events; drop function reject_prep_event()",
      );
    }
    expect((await readPreparation(h.db, p.id)).snapshot).toEqual(v.snapshot);
    expect((await preparationHistory(h.db, p.id)).revisions).toHaveLength(1);
  });
  it("retains head and history through a new pool and migration run", async () => {
    const p = await fresh(),
      v = await enrollPreparation(h.db, cfg, "owner", p.id, {
        package_revision: 0,
        idempotency_key: "request-1",
      });
    const reopened = new pg.Pool(h.admin.options);
    try {
      await migrate(reopened);
      expect((await readPreparation(reopened, p.id)).snapshot).toEqual(
        v.snapshot,
      );
    } finally {
      await reopened.end();
    }
  });
  it("upgrades an existing legacy schema without altering package bytes", async () => {
    const schema = `upgrade_${randomUUID().replaceAll("-", "")}`;
    await h.admin.query(`create schema ${schema}`);
    const old = new pg.Pool({
      ...h.admin.options,
      options: `-c search_path=${schema}`,
    });
    try {
      await old.query(SCHEMA);
      const p = packageFixture();
      await old.query(
        "insert into packages(id,revision,status,body) values($1,0,'draft',$2)",
        [p.id, p],
      );
      await migrate(old);
      await migrate(old);
      expect(
        (await old.query("select body from packages where id=$1", [p.id]))
          .rows[0].body,
      ).toEqual(p);
    } finally {
      await old.end();
      await h.admin.query(`drop schema ${schema} cascade`);
    }
  });
  it("applies migrations once and refuses checksum drift and unknown future migrations", async () => {
    await migrate(h.admin);
    await migrate(h.admin);
    expect((await h.db.query("select * from schema_migrations")).rowCount).toBe(
      MIGRATIONS.length,
    );
    await expect(
      migrate(
        h.admin,
        MIGRATIONS.map((m, i) =>
          i === 0 ? { ...m, sql: m.sql + "\n-- drift" } : m,
        ),
      ),
    ).rejects.toThrow(/checksum/);
    await h.admin.query(
      "insert into schema_migrations(version,checksum) values('999-future','unknown')",
    );
    try {
      await expect(migrate(h.admin)).rejects.toThrow(/newer|unknown/);
    } finally {
      await h.admin.query(
        "delete from schema_migrations where version='999-future'",
      );
    }
  });
});
