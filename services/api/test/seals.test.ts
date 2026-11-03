import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { type Harness, ORIGIN, VirtualAuthenticator, signIn, startHarness } from "./harness.js";
import { type InclusionBundle, verifyInclusion } from "../src/seals.js";
import { currentCredential, recordCredential } from "../src/tenancy.js";
import { recordObject } from "../src/workbench.js";
import { appendEvent } from "../src/events.js";
import { sealChallenge, sealSubject } from "../src/seals.js";

/** Chain seals and inclusion proofs (workbench plan task 5.3; specification 11.6, WB-20). */
let h: Harness;
let cookie: string;
const key = new VirtualAuthenticator();
const example = parse(readFileSync(new URL("../../../spec/examples/work-package.hvac-load-calc.yaml", import.meta.url), "utf8"));
type Json = Record<string, any>;

beforeAll(async () => {
  h = await startHarness();
  cookie = await signIn(h.app, key);
}, 120_000);
afterAll(async () => h?.stop());

const get = async (url: string) => h.app.inject({ method: "GET", url, headers: { cookie } });
const post = (url: string, payload: unknown) => h.app.inject({ method: "POST", url, headers: { cookie, origin: ORIGIN }, payload: payload as object });
async function signed(name: string, payload: Json) {
  const o = await post(`/admin/commands/${name}/options`, { payload });
  expect(o.statusCode, o.body).toBe(200);
  return post(`/admin/commands/${name}`, { payload, assertion: key.assert(o.json().options) });
}
/** Seals the chain as it stands now, as the Records page does: the head it shows, a purpose, the time. */
async function seal(purpose = "End of day") {
  const head = (await get("/records/head")).json().head;
  return signed("chain.seal", { head_seq: head.head_seq, head_digest: head.head_digest.value, purpose, sealed_at: new Date().toISOString() });
}
const verify = async () => (await get("/records/verify")).json();
const eventCount = async () => (await h.db.query<{ n: number }>("select count(*)::int as n from events")).rows[0]!.n;

async function pkg(id: string) {
  await h.admin.query("insert into packages (id, revision, status, body) values ($1, 0, 'draft', $2)", [id, { ...example, id, revision: 0, status: "draft", data_lane: "internal", design_inputs: [] }]);
  // A recorded event of its own, as any command on it appends.
  const c = await h.admin.connect();
  try {
    await c.query("begin");
    const { appendEvent } = await import("../src/events.js");
    await appendEvent(c, "package.noted", id, { kind: "system", id: "test" }, { note: "for the proof" });
    await c.query("commit");
  } finally {
    c.release();
  }
}

describe("sealing the chain", () => {
  it("needs a passkey, a purpose, and the head the screen showed", async () => {
    const head = (await get("/records/head")).json().head;
    const body = { head_seq: head.head_seq, head_digest: head.head_digest.value, purpose: "x", sealed_at: new Date().toISOString() };
    expect((await post("/admin/commands/chain.seal", { payload: body })).json().code).toBe("signature-required");
    expect((await signed("chain.seal", { ...body, purpose: " " })).json().code).toBe("reason-required");
    expect((await signed("chain.seal", { ...body, head_digest: "0".repeat(64) })).json().code).toBe("head-mismatch");
    expect((await signed("chain.seal", { ...body, head_seq: head.head_seq + 999 })).json().code).toBe("not-found");
    expect((await signed("chain.seal", { ...body, sealed_at: new Date(Date.now() - 3600e3).toISOString() })).json().code).toBe("invalid");
    // Only the four signed fields, so the seal's subject can be recomputed exactly.
    expect((await signed("chain.seal", { ...body, note: "extra" })).json().code).toBe("invalid");
    expect((await h.db.query("select 1 from chain_seals")).rowCount).toBe(0);
  });

  it("records the seal over the head it names, appends chain.sealed after it, and verifies it again from the stored signature", async () => {
    const before = await verify();
    expect(before).toMatchObject({ chain: { ok: true }, seals: [], last_sealed_seq: 0, witnessed: false, statement: "Local chain, not witnessed" });
    expect(before.unsealed).toBe(before.chain.count);
    const head = (await get("/records/head")).json().head;
    const res = await seal("Before the design review");
    expect(res.statusCode, res.body).toBe(200);
    const s = res.json();
    expect(s.payload).toMatchObject({ head_seq: head.head_seq, head_digest: head.head_digest, purpose: "Before the design review" });
    expect(s.nonce).toMatch(/^[0-9a-f]{32}$/);
    // The event recording the seal comes after the head it covers.
    const sealed = (await h.db.query<{ seq: number; body: Json }>("select seq, body from events where body->>'type' = 'chain.sealed'")).rows;
    expect(sealed).toHaveLength(1);
    expect(sealed[0]!.seq).toBeGreaterThan(head.head_seq);
    const after = await verify();
    expect(after.seals).toEqual([expect.objectContaining({ id: s.id, head_seq: head.head_seq, purpose: "Before the design review", result: "valid" })]);
    expect(after.last_sealed_seq).toBe(head.head_seq);
    // The seal's own event and the command record are after the head, so they are unsealed until the next seal.
    expect(after.unsealed).toBe((await eventCount()) - head.head_seq);
    expect(after.unsealed).toBeGreaterThan(0);
  });

  it("covers the previous seal's own event with the next seal, so there is no circularity", async () => {
    const first = (await h.db.query<{ seq: number }>("select seq from events where body->>'type' = 'chain.sealed' order by seq limit 1")).rows[0]!.seq;
    expect((await seal("Next day")).statusCode).toBe(200);
    const v = await verify();
    expect(v.seals.map((x: Json) => x.result)).toEqual(["valid", "valid"]);
    expect(v.last_sealed_seq).toBeGreaterThanOrEqual(first);
  });

  it("finds a forged seal out: unrecorded, a payload that is not what was signed, a signature over something else, a head that is not the chain's", async () => {
    const real = (await h.db.query<{ body: Json }>("select body from chain_seals order by recorded_at limit 1")).rows[0]!.body;
    const { sealSubject } = await import("../src/seals.js");
    const { digest } = await import("../src/kernel.js");
    // A writer able to add rows; `withEvent` also lets it append a chain.sealed event carrying the row's digest.
    const forge = async (id: string, change: (s: Json) => Json, withEvent: boolean) => {
      const c = await h.admin.connect();
      try {
        await c.query("begin");
        const body = change(structuredClone({ ...real, id }));
        await recordObject(c, "chain_seal", body as never, { kind: "system", id: "test" });
        if (withEvent) await appendEvent(c, "chain.sealed", id, { kind: "system", id: "test" }, { head_seq: body.payload.head_seq, seal_digest: digest(body) });
        await c.query("commit");
      } finally {
        c.release();
      }
    };
    // A copy of a real seal no event records: not a seal.
    await forge("seal_forgedunrecorded", (x) => x, false);
    // Another purpose under the same signature: the stored subject no longer matches its payload.
    await forge("seal_forgedpurpose", (x) => ({ ...x, payload: { ...x.payload, purpose: "Something the signer never saw" } }), true);
    // The payload and subject recomputed for another purpose: the signature does not cover that subject.
    await forge("seal_forgedsubject", (x) => {
      const payload = { ...x.payload, purpose: "Another purpose" };
      return { ...x, payload, subject_digest: { algorithm: "sha256", value: sealSubject(payload.signer_id, payload.org_id, { head_seq: payload.head_seq, head_digest: payload.head_digest.value, purpose: payload.purpose, sealed_at: payload.sealed_at }) } };
    }, true);
    // A head digest that is not the event's.
    await forge("seal_forgedhead", (x) => ({ ...x, payload: { ...x.payload, head_digest: { algorithm: "sha256", value: "e".repeat(64) } } }), true);
    const results = Object.fromEntries((await verify()).seals.map((x: Json) => [x.id, x.result]));
    expect(results["seal_forgedunrecorded"]).toBe("unrecorded");
    expect(results["seal_forgedpurpose"]).toBe("subject-mismatch");
    expect(results["seal_forgedsubject"]).toBe("signature-invalid");
    expect(results["seal_forgedhead"]).toBe("head-mismatch");
    expect(results[real.id]).toBe("valid");
  });
});

describe("inclusion proofs", () => {
  const proof = async (id: string) => (await get(`/packages/${id}/proof`)).json();

  it("proves a package's events under the first seal covering them, in a bundle checkable on its own", async () => {
    await pkg("WP-PROOF-1");
    const covering = await seal("Covers WP-PROOF-1");
    expect(covering.statusCode).toBe(200);
    const p = await proof("WP-PROOF-1");
    expect(p).toMatchObject({ ok: true, chain: { ok: true }, check: { ok: true, authenticated: true } });
    const b = p.bundle as InclusionBundle;
    expect(b.seal.id).toBe(covering.json().id);
    // The whole chain from its first event, ending at the seal's head: nothing earlier left out.
    expect(b.segment[0]!.seq).toBe(1);
    expect(b.segment.at(-1)!.seq).toBe(covering.json().payload.head_seq);
    expect(b.seal_evidence).toMatchObject({ rp_id: "localhost" });
    expect(b).toMatchObject({ witnessed: false, statement: "Local chain, not witnessed" });
    // The package's events are derived from the chain, never taken from a list.
    const own = (await h.db.query<{ seq: number }>("select seq from events where body->>'subject' = 'WP-PROOF-1' order by seq")).rows.map((r) => r.seq);
    expect(p.check.events).toEqual(own);
    expect(await verifyInclusion(b)).toEqual({ ok: true, authenticated: true, events: own });
  });

  it("catches anything changed in a bundle: an event, a missing event, another package's name, a head, a purpose, a signature", async () => {
    const b = (await proof("WP-PROOF-1")).bundle as InclusionBundle;
    const edit = async (change: (x: Json) => void) => {
      const x = structuredClone(b) as Json;
      change(x);
      return verifyInclusion(x as unknown as InclusionBundle);
    };
    expect((await edit((x) => (x.segment[3].data = { note: "edited" }))).ok).toBe(false);
    expect((await edit((x) => x.segment.splice(2, 1))).problem).toBe("event 3 is missing from the segment");
    expect((await edit((x) => x.segment.shift())).ok).toBe(false);
    expect(await edit((x) => (x.package_id = "WP-SOMETHING-ELSE"))).toMatchObject({ ok: false, problem: "the segment records nothing of WP-SOMETHING-ELSE" });
    expect((await edit((x) => (x.seal.payload.head_digest.value = "f".repeat(64)))).problem).toBe("the segment does not end at the seal's head");
    expect((await edit((x) => (x.seal.payload.purpose = "Another purpose"))).problem).toBe("the seal's subject is not what its payload signs");
    // A fabricated seal over the same head, subject recomputed, with another signature.
    expect((await edit((x) => {
      x.seal.payload.purpose = "Fabricated";
      x.seal.subject_digest.value = sealSubject(x.seal.payload.signer_id, x.seal.payload.org_id,
        { head_seq: x.seal.payload.head_seq, head_digest: x.seal.payload.head_digest.value, purpose: "Fabricated", sealed_at: x.seal.payload.sealed_at });
    })).problem).toBe("the seal's signature does not check");
    expect((await edit((x) => delete x.seal_evidence)).problem).toBe("the bundle does not carry what checking the seal's signature needs");
  });

  it("says when no seal covers a package's events yet, running the chain to its head", async () => {
    await pkg("WP-PROOF-2");
    const p = await proof("WP-PROOF-2");
    expect(p).toMatchObject({ ok: true, check: { ok: true, authenticated: false } });
    expect(p.bundle.seal).toBeNull();
    expect(p.bundle.segment.at(-1).seq).toBe((await get("/records/head")).json().head.head_seq);
    expect((await get("/packages/WP-NO-SUCH/proof")).statusCode).toBe(404);
  });
});

describe("key history", () => {
  it("keeps a seal checkable after its passkey is revoked, from the retained key", async () => {
    const credentialId = Buffer.from(key.credentialId).toString("base64url");
    const cur = await currentCredential(h.db, credentialId);
    expect(cur).toBeTruthy();
    const c = await h.admin.connect();
    try {
      await c.query("begin");
      await recordCredential(c, {
        orgId: cur!.org_id, memberId: cur!.member_id, credentialId, format: cur!.attestation_format, userVerified: cur!.user_verified,
        attestationVerified: false, revoked: true,
      }, { kind: "system", id: "test" });
      await c.query("commit");
    } finally {
      c.release();
    }
    expect((await currentCredential(h.db, credentialId))!.revoked).toBe(true);
    // Every real seal (the forged ones above aside) still verifies against the revoked passkey's retained key.
    const real = (await verify()).seals.filter((x: Json) => !x.id.startsWith("seal_forged"));
    expect(real.length).toBeGreaterThanOrEqual(3);
    expect(real.map((x: Json) => x.result)).toEqual(real.map(() => "valid"));
  });

  it("refuses a seal signed with that passkey after it was revoked, however good the signature", async () => {
    // Whoever still holds the revoked key signs a fresh seal and writes it, with its event, directly.
    const head = (await get("/records/head")).json().head;
    const member = (await h.db.query<{ id: string }>("select id from members order by created_at limit 1")).rows[0]!.id;
    const org = (await h.db.query<{ id: string }>("select tenancy_sole_org() as id")).rows[0]!.id;
    const req = { head_seq: head.head_seq, head_digest: head.head_digest.value, purpose: "After revocation", sealed_at: new Date().toISOString() };
    const subject = sealSubject(member, org, req);
    const nonce = "1".repeat(32);
    const a = key.assert({ challenge: sealChallenge(subject, nonce) }) as Json;
    const body = { id: "seal_afterrevoke", org_id: org, payload: { head_seq: req.head_seq, head_digest: { algorithm: "sha256", value: req.head_digest }, org_id: org, sealed_at: req.sealed_at, signer_id: member, purpose: req.purpose },
      subject_digest: { algorithm: "sha256", value: subject }, nonce,
      assertion: { credential_id: a.id, authenticator_data: a.response.authenticatorData, client_data_json: a.response.clientDataJSON, signature: a.response.signature } };
    const { digest } = await import("../src/kernel.js");
    const c = await h.admin.connect();
    try {
      await c.query("begin");
      await recordObject(c, "chain_seal", body as never, { kind: "system", id: "test" });
      await appendEvent(c, "chain.sealed", body.id, { kind: "system", id: "test" }, { head_seq: req.head_seq, seal_digest: digest(body) });
      await c.query("commit");
    } finally {
      c.release();
    }
    const results = Object.fromEntries((await verify()).seals.map((x: Json) => [x.id, x.result]));
    expect(results["seal_afterrevoke"]).toBe("key-revoked");
  });
});

describe("a broken chain", () => {
  const rewrite = async (seq: number) => {
    // Rewrites a recorded event, as a writer able to change past rows could; the chain no longer verifies.
    const c = await h.admin.connect();
    try {
      await c.query("begin");
      await c.query("alter table events disable trigger events_no_change");
      await c.query("update events set body = jsonb_set(body, '{subject}', '\"rewritten\"') where seq = $1", [seq]);
      await c.query("alter table events enable trigger events_no_change");
      await c.query("commit");
    } finally {
      c.release();
    }
  };

  it("fails a package's proof even when the break is past the package's own sealed stretch", async () => {
    const before = (await get("/packages/WP-PROOF-1/proof")).json();
    expect(before.ok).toBe(true);
    await rewrite((await get("/records/head")).json().head.head_seq);
    const after = (await get("/packages/WP-PROOF-1/proof")).json();
    // The package's own segment still checks; the chain as a whole does not, so the proof fails.
    expect(after.check.ok).toBe(true);
    expect(after.chain.ok).toBe(false);
    expect(after.ok).toBe(false);
  });

  it("is reported, and no seal over the broken part counts", async () => {
    await rewrite(2);
    const v = await verify();
    expect(v.chain).toMatchObject({ ok: false, broken_at: 2 });
    expect(v.seals.every((x: Json) => x.result !== "valid")).toBe(true);
    expect(v.last_sealed_seq).toBe(0);
    expect(v.unsealed).toBe(v.chain.count);
  });
});

describe("a proof that would disclose another organization's work", () => {
  it("is refused", async () => {
    await h.admin.query(`insert into organizations (body) values ('{"id":"orgsealother_x","name":"Other","status":"suspended"}')`);
    await h.admin.query("insert into object_owners (object_kind, object_id, org_id) values ('capture', 'CAP-SEAL-OTHER', 'orgsealother_x')");
    const c = await h.admin.connect();
    try {
      await c.query("begin");
      await appendEvent(c, "capture.created", "CAP-SEAL-OTHER", { kind: "system", id: "test" }, {});
      await c.query("commit");
    } finally {
      c.release();
    }
    await pkg("WP-PROOF-3");
    const res = await get("/packages/WP-PROOF-3/proof");
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("mixed-scope");
  });
});

