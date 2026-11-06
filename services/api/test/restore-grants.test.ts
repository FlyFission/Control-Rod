import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Db, closeDb, openDb } from "../src/db/index.js";
import { type Harness, ORIGIN, TEST_ROLE_SECRETS, VirtualAuthenticator, signIn, startHarness } from "./harness.js";

/**
 * Opening a database restored with --no-privileges (review thread on #19). The recovery drill in
 * docs/owner-pilot.md dumps and restores without privileges, so the copy keeps migration 011's
 * record but none of its grants. Opening it must grant again, through openDb as the app does.
 */
let h: Harness;
let reopened: Db | undefined;
const key = new VirtualAuthenticator();

beforeAll(async () => {
  h = await startHarness();
  const cookie = await signIn(h.app, key);
  const made = await h.app.inject({ method: "POST", url: "/captures", headers: { cookie, origin: ORIGIN }, payload: { text: "Kept across the restore", lane: "internal" } });
  expect(made.statusCode, made.body).toBe(201);
}, 120_000);
afterAll(async () => {
  if (reopened) await closeDb(reopened);
  await h?.stop();
});

describe("a restore without privileges", () => {
  it("is usable again once opened, without rerunning any migration", async () => {
    // What pg_restore --no-privileges leaves: the roles exist on the server, the copy grants them nothing.
    await h.admin.query(`
      revoke all on all tables in schema public from controlrod_reader, controlrod_writer;
      revoke all on all sequences in schema public from controlrod_reader, controlrod_writer;
      revoke usage on schema public from controlrod_reader, controlrod_writer;
      alter default privileges in schema public revoke all on tables from controlrod_reader, controlrod_writer;
      alter default privileges in schema public revoke all on sequences from controlrod_reader, controlrod_writer;`);
    await expect(h.db.query("select count(*) from captures")).rejects.toThrow(/permission denied/);
    const migrations = (await h.admin.query("select count(*)::int as n from schema_migrations")).rows[0].n;

    reopened = await openDb(String(h.admin.options.connectionString), { secrets: TEST_ROLE_SECRETS });
    expect((await reopened.query("select count(*)::int as n from captures")).rows[0].n).toBe(1);
    expect((await h.admin.query("select count(*)::int as n from schema_migrations")).rows[0].n).toBe(migrations);
    // The reader is still only a reader: the grants came back as 011 defines them, no wider.
    await expect(reopened.query("delete from captures")).rejects.toThrow(/permission denied/);
  });
});
