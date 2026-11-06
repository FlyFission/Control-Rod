import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tx } from "../src/db/index.js";
import { LOCAL_ORG, backfillTenancy, currentQualification, firstMemberOf, memberIdFor } from "../src/tenancy.js";
import { type Harness, startHarness } from "./harness.js";

/**
 * The founding Member of an install upgraded from before migration 009 (review thread on #21): the
 * backfill creates every Member in one transaction, so they share one timestamp, and the first one
 * must come from when each person registered their passkey, not from how their ids sort.
 */
let h: Harness;
const OWNER = memberIdFor("owner");
const ALICE = memberIdFor("alice");

beforeAll(async () => {
  h = await startHarness();
}, 120_000);
afterAll(async () => h?.stop());

describe("founding member after a multi-user upgrade", () => {
  it("goes to whoever registered first, even when a later user's id sorts first", async () => {
    // The trap the thread describes: alice registered after owner, but her id sorts first.
    expect(ALICE < OWNER).toBe(true);
    // Passkeys as an install from before 009 holds them: owner a day before alice.
    await h.admin.query(
      `insert into credentials (id, user_name, public_key, counter, created_at) values
         ('cred-owner', 'owner', '\\x00', 0, now() - interval '2 days'),
         ('cred-alice', 'alice', '\\x00', 0, now() - interval '1 day')`);
    await tx(h.admin, backfillTenancy);

    const both = await h.db.query<{ id: string; created_at: Date }>("select id, created_at from members where org_id = $1 order by id", [LOCAL_ORG]);
    expect(both.rows.map((r) => r.id).sort()).toEqual([ALICE, OWNER].sort());
    // Both Members carry the backfill's one timestamp, which is why it cannot decide.
    expect(new Set(both.rows.map((r) => r.created_at.getTime())).size).toBe(1);

    expect((await currentQualification(h.db, OWNER))?.authorities).toEqual(["administrator", "lane", "policy"]);
    expect(await currentQualification(h.db, ALICE)).toBeNull();
    // Bootstrap asks the same question, so alice cannot self-issue authority either.
    expect(await firstMemberOf(h.db, LOCAL_ORG)).toBe(OWNER);
  });
});
