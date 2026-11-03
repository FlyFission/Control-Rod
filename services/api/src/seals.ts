import { createHash, randomUUID } from "node:crypto";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthConfig } from "./auth.js";
import { type Db, type Tx, readTx } from "./db/index.js";
import { type Actor, type EventRecord, appendEvent, eventDigest, verifyChain } from "./events.js";
import { digest } from "./kernel.js";
import { Refusal } from "./refusal.js";
import { recordObject } from "./workbench.js";

/**
 * Chain seals and inclusion proofs (workbench specification 11.6; plan task 5.3). Interim tamper
 * evidence: the Postgres chain is tamper evident only against a writer who cannot rewrite later rows.
 *  - A Member seals the chain with their passkey (administrative command chain.seal) over the payload
 *    {head before the seal, organization, time, signer, purpose}. The chain.sealed event recording
 *    the seal is appended after the head, so the next seal covers it; there is no circularity.
 *  - Verification recomputes the chain, checks each seal's head against the event it names and its
 *    signature against the signer's retained credential (kept after revocation, so older seals stay
 *    checkable), and reports how many events no valid seal covers.
 *  - A package's inclusion proof is the segment of the chain from just before its first event to the
 *    head of the first valid seal covering its last one, with that seal: anyone holding the bundle can
 *    recompute every digest and link and see the package's events under the sealed head.
 * A database alone cannot prove a sealed suffix was not truncated, and nothing outside witnesses this
 * chain yet; every view says "local chain, not witnessed" (specification 11.7, chain_witnessed false).
 * System seals need a key held in a KMS or HSM, which this installation does not have, so none are made.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- records are validated JSON */
type Json = any;

export const NOT_WITNESSED = "Local chain, not witnessed";
/** How far a seal's stated time may be from the control plane's clock when it is recorded. */
const SEAL_CLOCK_SKEW_MS = 5 * 60_000;

const idFor = () => `seal_${randomUUID().replaceAll("-", "").slice(0, 20)}`;

/** The administrative payload a Member signs to seal: what the screen showed, nothing more. */
export interface SealRequest { head_seq: number; head_digest: string; purpose: string; sealed_at: string }

/** The subject a seal's passkey signed: the chain.seal command over the request, for that Member and organization. */
export function sealSubject(memberId: string, orgId: string, req: SealRequest): string {
  return digest({ command: "chain.seal", member: memberId, org: orgId, payload: req });
}

/** The challenge the signature answered, from its subject and nonce (as the options route made it). */
export function sealChallenge(subject: string, nonce: string): string {
  return createHash("sha256").update(`admin|${subject}|${nonce}`).digest().toString("base64url");
}

/**
 * Records a seal (admin command chain.seal). The head must be the event the screen showed, by
 * sequence and digest; the time must be near the control plane's; the purpose is required.
 */
export async function sealChain(c: Tx, orgId: string, memberId: string, p: Json, signed: { subject: string; nonce: string; assertion: Json }, actor: Actor) {
  // The signed request is exactly these four fields, so the seal's subject can be recomputed from it.
  const extra = Object.keys(p ?? {}).filter((k) => !["head_seq", "head_digest", "purpose", "sealed_at"].includes(k));
  if (extra.length) throw new Refusal(400, "invalid", `A seal names only head_seq, head_digest, purpose and sealed_at, not ${extra.join(", ")}`);
  const headSeq = p.head_seq;
  const headDigest = p.head_digest;
  const purpose = typeof p.purpose === "string" ? p.purpose.trim() : "";
  const sealedAt = p.sealed_at;
  if (!Number.isInteger(headSeq) || headSeq < 1) throw new Refusal(400, "invalid", "head_seq must be the sequence of an event");
  if (typeof headDigest !== "string" || !/^[0-9a-f]{64}$/.test(headDigest)) throw new Refusal(400, "invalid", "head_digest must be a SHA-256 in hex");
  if (!purpose || purpose.length > 200) throw new Refusal(400, "reason-required", "Say why you are sealing, in at most 200 characters");
  if (typeof sealedAt !== "string" || Number.isNaN(Date.parse(sealedAt)) || Math.abs(Date.parse(sealedAt) - Date.now()) > SEAL_CLOCK_SKEW_MS)
    throw new Refusal(400, "invalid", "sealed_at must be the time you sealed, within five minutes of the control plane's clock");
  // The request signed must be exactly the one recorded: the purpose as typed, untrimmed or trimmed alike.
  if (purpose !== p.purpose) throw new Refusal(400, "invalid", "purpose must not start or end with spaces");
  const head = (await c.query<{ digest: string }>("select digest from events where seq = $1", [headSeq])).rows[0];
  if (!head) throw new Refusal(404, "not-found", `There is no event ${headSeq}`);
  if (head.digest !== headDigest) throw new Refusal(409, "head-mismatch", `Event ${headSeq} does not have the digest you saw`);
  const seal = {
    id: idFor(), org_id: orgId,
    payload: { head_seq: headSeq, head_digest: { algorithm: "sha256", value: headDigest }, org_id: orgId, sealed_at: sealedAt, signer_id: memberId, purpose },
    subject_digest: { algorithm: "sha256", value: signed.subject },
    nonce: signed.nonce,
    assertion: signed.assertion,
  };
  await recordObject(c, "chain_seal", seal as never, actor);
  // The seal's own digest goes into the chain, so a seal row nothing recorded, or one changed since,
  // is found out, and the event's place fixes when the seal was made.
  await appendEvent(c, "chain.sealed", seal.id, actor, { head_seq: headSeq, head_digest: headDigest, purpose, seal_digest: digest(seal) });
  return seal;
}

type SealCheck = "valid" | "head-mismatch" | "head-missing" | "unrecorded" | "subject-mismatch" | "key-unknown" | "key-revoked" | "signature-invalid";

/** Everything needed to check a seal's passkey signature away from this database. */
export interface SealEvidence {
  /** The signer's public key (COSE, base64url) as retained. Trust in it must come from outside the bundle. */
  public_key: string;
  rp_id: string;
  origins: string[];
}

/** Checks a seal's subject and signature from the seal and its evidence alone. */
export async function checkSealSignature(seal: Json, ev: SealEvidence): Promise<"valid" | "subject-mismatch" | "signature-invalid"> {
  const p = seal.payload;
  const request: SealRequest = { head_seq: p.head_seq, head_digest: p.head_digest.value, purpose: p.purpose, sealed_at: p.sealed_at };
  if (sealSubject(p.signer_id, p.org_id, request) !== seal.subject_digest.value) return "subject-mismatch";
  try {
    const r = await verifyAuthenticationResponse({
      response: {
        id: seal.assertion.credential_id, rawId: seal.assertion.credential_id, type: "public-key", clientExtensionResults: {},
        response: { authenticatorData: seal.assertion.authenticator_data, clientDataJSON: seal.assertion.client_data_json, signature: seal.assertion.signature },
      },
      expectedChallenge: sealChallenge(seal.subject_digest.value, seal.nonce),
      expectedOrigin: ev.origins,
      expectedRPID: ev.rp_id,
      requireUserVerification: true,
      // A later check of an earlier signature: the counter was checked when it was made.
      credential: { id: seal.assertion.credential_id, publicKey: new Uint8Array(Buffer.from(ev.public_key, "base64url")), counter: 0 },
    });
    return r.verified ? "valid" : "signature-invalid";
  } catch {
    return "signature-invalid";
  }
}

/** The signer's retained key, if the credential is the signer's. */
async function signerKey(q: Db | Tx, auth: AuthConfig, seal: Json): Promise<SealEvidence | null> {
  const cred = (await q.query<{ public_key: Buffer }>(
    `select c.public_key from credentials c join members m on m.user_name = c.user_name where c.id = $1 and m.id = $2`,
    [seal.assertion.credential_id, seal.payload.signer_id])).rows[0];
  return cred ? { public_key: Buffer.from(cred.public_key).toString("base64url"), rp_id: auth.rpID, origins: auth.origins } : null;
}

/**
 * Checks one seal against the chain: its head is the event it names; the chain recorded it (a
 * chain.sealed event carrying this seal's digest); its passkey was not revoked before that event; and
 * its subject and signature hold against the signer's retained key. A revoked key keeps the seals it
 * made before revocation valid, and makes none after.
 */
async function checkSeal(q: Db | Tx, auth: AuthConfig, seal: Json): Promise<{ result: SealCheck; recorded_seq?: number }> {
  const p = seal.payload;
  const head = (await q.query<{ digest: string }>("select digest from events where seq = $1", [p.head_seq])).rows[0];
  if (!head) return { result: "head-missing" };
  if (head.digest !== p.head_digest.value) return { result: "head-mismatch" };
  const recorded = (await q.query<{ seq: number }>(
    "select seq from events where body->>'type' = 'chain.sealed' and body->>'subject' = $1 and body->'data'->>'seal_digest' = $2 order by seq limit 1",
    [seal.id, digest(seal)])).rows[0];
  if (!recorded || recorded.seq <= p.head_seq) return { result: "unrecorded" };
  const key = await signerKey(q, auth, seal);
  if (!key) return { result: "key-unknown", recorded_seq: recorded.seq };
  // Where the chain first recorded a revoked version of this passkey: every credential version is
  // recorded with its digest, whichever path revoked it.
  const revoked = (await q.query<{ seq: number | null }>(
    `select min(e.seq)::int as seq from events e
       join authenticator_credentials a on a.digest = e.body->'data'->>'digest'
      where e.body->>'type' = 'authenticator-credential.recorded' and e.body->>'subject' = a.id
        and a.credential_id = $1 and (a.body->>'revoked')::boolean is true`, [seal.assertion.credential_id])).rows[0]?.seq;
  if (revoked != null && revoked < recorded.seq) return { result: "key-revoked", recorded_seq: recorded.seq };
  return { result: await checkSealSignature(seal, key), recorded_seq: recorded.seq };
}

/** The record verified on a single consistent snapshot: the chain, each seal, and what no seal covers yet. */
async function verifyOn(q: Db | Tx, auth: AuthConfig, orgId: string) {
  const chain = await verifyChain(q);
  const seals = (await q.query<{ body: Json }>("select body from chain_seals where org_id = $1 order by head_seq, recorded_at, id", [orgId])).rows.map((r) => r.body);
  const checked = [];
  for (const s of seals) {
    const { result } = await checkSeal(q, auth, s);
    // A seal over a part of the chain that no longer verifies is not a valid seal.
    const broken = !chain.ok && s.payload.head_seq >= (chain.broken_at ?? 0);
    checked.push({ id: s.id, head_seq: s.payload.head_seq, head_digest: s.payload.head_digest, sealed_at: s.payload.sealed_at, signer_id: s.payload.signer_id,
      purpose: s.payload.purpose, result: result === "valid" && broken ? ("chain-broken-before-head" as const) : result });
  }
  const valid = checked.filter((s) => s.result === "valid");
  const lastSealed = valid.length ? Math.max(...valid.map((s) => s.head_seq)) : 0;
  return {
    chain,
    seals: checked,
    last_sealed_seq: lastSealed,
    // Events after the last valid seal: nothing yet vouches for them beyond the chain itself.
    unsealed: Math.max(0, chain.count - lastSealed),
    witnessed: false as const,
    statement: NOT_WITNESSED,
  };
}

/** Everything a person needs to judge the record, read from one consistent snapshot. */
export async function verifyRecords(db: Db, auth: AuthConfig, orgId: string) {
  return readTx(db, (c) => verifyOn(c, auth, orgId));
}

/** The head a new seal would cover now, for the screen to show and the signature to name. */
export async function chainHead(db: Db) {
  const r = (await db.query<{ seq: number; digest: string; at: Date }>("select seq, digest, at from events order by seq desc limit 1")).rows[0];
  return r ? { head_seq: r.seq, head_digest: { algorithm: "sha256", value: r.digest }, at: r.at.toISOString() } : null;
}

export interface InclusionBundle {
  package_id: string;
  /** The chain from its first event through the covering head, as recorded: nothing before is left out. */
  segment: EventRecord[];
  /** The first valid seal covering the package's last event, or null when none does yet. */
  seal: Json | null;
  /** What checking the seal's signature needs, away from this database. Absent with no seal. */
  seal_evidence?: SealEvidence;
  witnessed: false;
  statement: string;
}

/** The runs of a package, as the chain itself announced them (run.queued and run.started name the package). */
function packageRuns(segment: EventRecord[], packageId: string): Set<string> {
  return new Set(segment.filter((e) => (e.type === "run.queued" || e.type === "run.started") && e.data?.package === packageId).map((e) => e.subject));
}

/** The package's events in a segment: its own, and its runs'. Derived from the chain, never from a list. */
export function packageEvents(segment: EventRecord[], packageId: string): number[] {
  const runs = packageRuns(segment, packageId);
  return segment.filter((e) => e.subject === packageId || runs.has(e.subject)).map((e) => e.seq);
}

/**
 * The inclusion proof of a package's events. The bundle carries the whole chain from its first event
 * through the head of the first valid seal covering the package's last event (or the chain head,
 * unsealed), so no earlier event can be left out, with that seal and what checking its signature
 * needs. Refused when the chain holds another organization's events, which a bundle would disclose.
 */
export async function inclusionProof(db: Db, auth: AuthConfig, orgId: string, packageId: string) {
  return readTx(db, async (c) => {
    const owner = (await c.query<{ org_id: string }>("select org_id from object_owners where object_kind = 'package' and object_id = $1", [packageId])).rows[0];
    if (!owner || owner.org_id !== orgId) throw new Refusal(404, "not-found", "No such package");
    const report = await verifyOn(c, auth, orgId);
    const all = (await c.query<{ body: EventRecord }>("select body from events order by seq")).rows.map((r) => r.body);
    const mine = packageEvents(all, packageId);
    if (!mine.length) throw new Refusal(404, "not-found", "This package has no recorded events");
    const last = mine.at(-1)!;
    const covering = report.seals.filter((s) => s.result === "valid" && s.head_seq >= last).sort((a, b) => a.head_seq - b.head_seq)[0];
    const seal = covering ? (await c.query<{ body: Json }>("select body from chain_seals where id = $1", [covering.id])).rows[0]!.body : null;
    const top = seal ? seal.payload.head_seq : all.at(-1)!.seq;
    const segment = all.filter((e) => e.seq <= top);
    // Every subject the segment names that an ownership record ties to another organization.
    const foreign = (await c.query<{ n: number }>(
      "select count(*)::int as n from object_owners where object_id = any($1) and org_id <> $2", [[...new Set(segment.map((e) => e.subject))], orgId])).rows[0]!.n;
    if (foreign) throw new Refusal(409, "mixed-scope", "This part of the chain also records another organization's work, so a proof of it cannot be exported yet");
    const evidence = seal ? await signerKey(c, auth, seal) : null;
    const bundle: InclusionBundle = { package_id: packageId, segment, seal, ...(evidence ? { seal_evidence: evidence } : {}), witnessed: false, statement: NOT_WITNESSED };
    const check = await verifyInclusion(bundle);
    // Per package verification is global chain verification plus the inclusion proof (11.6): a chain
    // broken anywhere fails it, however consistent the package's own segment is.
    return { ok: report.chain.ok && check.ok, chain: report.chain, check, bundle };
  });
}

/**
 * Checks a bundle with nothing but the bundle: every digest and link recomputes from the chain's first
 * event; the package's events are derived from the chain; the segment ends at the seal's head with the
 * digest it signed; and the seal's subject and passkey signature hold against the key the bundle
 * carries. `authenticated` is true only when a seal covers the events and its signature checks; it
 * says nothing about whether that key is the signer's, which must be confirmed from outside the bundle.
 */
export async function verifyInclusion(b: InclusionBundle): Promise<{ ok: boolean; authenticated: boolean; events: number[]; problem?: string }> {
  const fail = (problem: string) => ({ ok: false, authenticated: false, events: [] as number[], problem });
  if (!b.segment.length) return fail("the segment is empty");
  let prev: string | undefined;
  for (const [i, e] of b.segment.entries()) {
    const { digest: d, ...rest } = e;
    if (e.seq !== i + 1) return fail(`event ${i + 1} is missing from the segment`);
    if (eventDigest(rest) !== d.value) return fail(`event ${e.seq} does not match its digest`);
    if (rest.prev?.value !== prev) return fail(`event ${e.seq} does not link to the one before it`);
    prev = d.value;
  }
  const events = packageEvents(b.segment, b.package_id);
  if (!events.length) return fail(`the segment records nothing of ${b.package_id}`);
  if (!b.seal) return { ok: true, authenticated: false, events };
  const tail = b.segment.at(-1)!;
  if (tail.seq !== b.seal.payload.head_seq || tail.digest.value !== b.seal.payload.head_digest.value) return fail("the segment does not end at the seal's head");
  if (!b.seal_evidence) return fail("the bundle does not carry what checking the seal's signature needs");
  const signature = await checkSealSignature(b.seal, b.seal_evidence);
  if (signature !== "valid") return fail(signature === "subject-mismatch" ? "the seal's subject is not what its payload signs" : "the seal's signature does not check");
  return { ok: true, authenticated: true, events };
}
