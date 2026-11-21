import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { type Harness, ORIGIN, VirtualAuthenticator, signIn, startHarness } from "./harness.js";

/** Draft compare and swap (workbench plan task 1.6; specification 10.2 "Edit draft"). */
let h: Harness;
let cookie: string;
const example = parse(readFileSync(new URL("../../../spec/examples/work-package.hvac-load-calc.yaml", import.meta.url), "utf8"));
const DRAFT = { ...example, id: "WP-CAS-1", revision: 0, status: "draft" };
const RELEASED = { ...example, id: "WP-CAS-2", revision: 0, status: "released" };

beforeAll(async () => {
  h = await startHarness();
  cookie = await signIn(h.app, new VirtualAuthenticator());
  for (const p of [DRAFT, RELEASED])
    await h.admin.query("insert into packages (id, revision, status, body) values ($1, 0, $2, $3)", [p.id, p.status, { ...p, status: "draft" }]);
}, 120_000);
afterAll(async () => h?.stop());

const view = async (id: string) => (await h.app.inject({ method: "GET", url: `/packages/${id}`, headers: { cookie } })).json();
const put = (id: string, body: unknown, ifMatch?: string) =>
  h.app.inject({ method: "PUT", url: `/packages/${id}`, headers: { cookie, origin: ORIGIN, ...(ifMatch ? { "if-match": ifMatch } : {}) }, payload: body as object });

describe("draft compare and swap", () => {
  it("offers a strong ETag for a draft", async () => {
    const v = await view(DRAFT.id);
    expect(v.draft_etag).toMatch(/^"[0-9a-f]{64}"$/);
  });

  it("refuses an edit with no If-Match (428) or a stale one (409)", async () => {
    const v = await view(DRAFT.id);
    const missing = await put(DRAFT.id, { ...v.package, title: "No tag" });
    expect(missing.statusCode).toBe(428);
    expect(missing.json().code).toBe("precondition-required");
    const stale = await put(DRAFT.id, { ...v.package, title: "Wrong tag" }, `"${"0".repeat(64)}"`);
    expect(stale.statusCode).toBe(409);
    expect(stale.json().code).toBe("stale");
  });

  it("applies an edit with the current tag, returns the new tag, and refuses the old one afterwards", async () => {
    const v = await view(DRAFT.id);
    const ok = await put(DRAFT.id, { ...v.package, title: "Edited once" }, v.draft_etag);
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json().title).toBe("Edited once");
    expect(ok.headers.etag).toBe((await view(DRAFT.id)).draft_etag);
    expect(ok.headers.etag).not.toBe(v.draft_etag);
    const again = await put(DRAFT.id, { ...v.package, title: "Lost update" }, v.draft_etag);
    expect(again.statusCode).toBe(409);
    expect((await view(DRAFT.id)).package.title).toBe("Edited once");
  });

  it("lets exactly one of two contending edits from the same draft land", async () => {
    const v = await view(DRAFT.id);
    const edits = async () => (await h.db.query("select count(*)::int as n from events where body->>'type' = 'package.edited' and body->>'subject' = $1", [DRAFT.id])).rows[0].n;
    const before = await edits();
    // Hold the package row so both edits queue (one on the row, the other behind it on the marking
    // graph lock every draft edit takes first), then release them together.
    const holder = await h.admin.connect();
    await holder.query("begin");
    await holder.query("select 1 from packages where id = $1 for update", [DRAFT.id]);
    const pending = [put(DRAFT.id, { ...v.package, title: "Edit A" }, v.draft_etag), put(DRAFT.id, { ...v.package, title: "Edit B" }, v.draft_etag)];
    for (let i = 0; i < 100; i++) {
      const waiting = (await h.admin.query("select count(*)::int as n from pg_stat_activity where wait_event_type = 'Lock' and (query like '%from packages where id%for update%' or query like '%pg_advisory_xact_lock%')")).rows[0].n;
      if (waiting >= 2) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect((await h.admin.query("select count(*)::int as n from pg_stat_activity where wait_event_type = 'Lock' and (query like '%from packages where id%for update%' or query like '%pg_advisory_xact_lock%')")).rows[0].n).toBe(2);
    await holder.query("commit");
    holder.release();
    const results = await Promise.all(pending);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(results.find((r) => r.statusCode === 409)!.json().code).toBe("stale");
    const winner = results.find((r) => r.statusCode === 200)!.json().title;
    expect((await view(DRAFT.id)).package.title).toBe(winner);
    expect(await edits()).toBe(before + 1);
  });

  it("refuses a record the contract does not allow, leaving the draft as it was", async () => {
    const v = await view(DRAFT.id);
    const r = await put(DRAFT.id, { ...v.package, approved_by_agent: true }, v.draft_etag);
    expect(r.statusCode).toBe(400);
    const after = await view(DRAFT.id);
    expect(after.package).toEqual(v.package);
    expect(after.draft_etag).toBe(v.draft_etag);
  });

  it("stores a draft's context profile, refuses an unknown one, and clears it when omitted", async () => {
    const v = await view(DRAFT.id);
    const nuclear = await put(DRAFT.id, { ...v.package, context_profile: "nuclear" }, v.draft_etag);
    expect(nuclear.statusCode, nuclear.body).toBe(200);
    expect(nuclear.json().context_profile).toBe("nuclear");
    const saved = await view(DRAFT.id);
    expect(saved.package.context_profile).toBe("nuclear");
    const bad = await put(DRAFT.id, { ...saved.package, context_profile: "heavy" }, saved.draft_etag);
    expect(bad.statusCode).toBe(400);
    expect((await view(DRAFT.id)).package.context_profile).toBe("nuclear");
    const { context_profile: _drop, ...rest } = saved.package;
    const cleared = await put(DRAFT.id, rest, saved.draft_etag);
    expect(cleared.statusCode, cleared.body).toBe(200);
    expect((await view(DRAFT.id)).package.context_profile).toBeUndefined();
  });

  it("offers no tag for a released package and refuses edits to it", async () => {
    const v = await view(RELEASED.id);
    expect(v.draft_etag).toBeUndefined();
    const r = await put(RELEASED.id, { ...v.package, title: "Nope" }, `"${"0".repeat(64)}"`);
    expect(r.statusCode).toBe(409);
    expect(r.json().code).toBe("wrong-state");
  });
});
