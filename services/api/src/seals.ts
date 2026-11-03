import { createHash, randomUUID } from "node:crypto";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthConfig } from "./auth.js";
import type { Db, Tx } from "./db/index.js";
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
  await appendEvent(c, "chain.sealed", seal.id, actor, { head_seq: headSeq, head_digest: headDigest, purpose });
  return seal;
}

type SealCheck = "valid" | "head-mismatch" | "head-missing" | "subject-mismatch" | "key-unknown" | "signature-invalid";

/** Checks one seal: its head against the chain, its subject against its payload, and its signature against the signer's credential. */
async function checkSeal(db: Db, auth: AuthConfig, seal: Json): Promise<SealCheck> {
  const p = seal.payload;
  const head = (await db.query<{ digest: string }>("select digest from events where seq = $1", [p.head_seq])).rows[0];
  if (!head) return "head-missing";
  if (head.digest !== p.head_digest.value) return "head-mismatch";
  const request: SealRequest = { head_seq: p.head_seq, head_digest: p.head_digest.value, purpose: p.purpose, sealed_at: p.sealed_at };
  if (sealSubject(p.signer_id, p.org_id, request) !== seal.subject_digest.value) return "subject-mismatch";
  // The signer's credential, whether or not it has since been revoked: key history stays checkable.
  const cred = (await db.query<{ id: string; public_key: Buffer; user_name: string }>(
    `select c.id, c.public_key, c.user_name from credentials c join members m on m.user_name = c.user_name
      where c.id = $1 and m.id = $2`, [seal.assertion.credential_id, p.signer_id])).rows[0];
  if (!cred) return "key-unknown";
  try {
    const r = await verifyAuthenticationResponse({
      response: {
        id: seal.assertion.credential_id, rawId: seal.assertion.credential_id, type: "public-key", clientExtensionResults: {},
        response: { authenticatorData: seal.assertion.authenticator_data, clientDataJSON: seal.assertion.client_data_json, signature: seal.assertion.signature },
      },
      expectedChallenge: sealChallenge(seal.subject_digest.value, seal.nonce),
      expectedOrigin: auth.origins,
      expectedRPID: auth.rpID,
      requireUserVerification: true,
      // A later check of an earlier signature: the counter was checked when it was made.
      credential: { id: cred.id, publicKey: new Uint8Array(cred.public_key), counter: 0 },
    });
    return r.verified ? "valid" : "signature-invalid";
  } catch {
    return "signature-invalid";
  }
}

/** Everything a person needs to judge the record: the chain, each seal, and what no seal covers yet. */
export async function verifyRecords(db: Db, auth: AuthConfig, orgId: string) {
  const chain = await verifyChain(db);
  const seals = (await db.query<{ body: Json }>("select body from chain_seals where org_id = $1 order by head_seq, recorded_at", [orgId])).rows.map((r) => r.body);
  const checked = [];
  for (const s of seals) {
    const result = await checkSeal(db, auth, s);
    // A seal over a part of the chain that no longer verifies is not a valid seal.
    const covered = result === "valid" && (chain.ok || s.payload.head_seq < (chain.broken_at ?? Infinity));
    checked.push({ id: s.id, head_seq: s.payload.head_seq, head_digest: s.payload.head_digest, sealed_at: s.payload.sealed_at, signer_id: s.payload.signer_id,
      purpose: s.payload.purpose, result: covered || result !== "valid" ? result : "chain-broken-before-head" });
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

/** The head a new seal would cover now, for the screen to show and the signature to name. */
export async function chainHead(db: Db) {
  const r = (await db.query<{ seq: number; digest: string; at: Date }>("select seq, digest, at from events order by seq desc limit 1")).rows[0];
  return r ? { head_seq: r.seq, head_digest: { algorithm: "sha256", value: r.digest }, at: r.at.toISOString() } : null;
}

/** The events of a package: its own and those of its runs. */
async function packageEventSeqs(db: Db, packageId: string): Promise<number[]> {
  return (await db.query<{ seq: number }>(
    `select seq from events where body->>'subject' = $1
        or body->>'subject' in (select id from runs where package_id = $1)
      order by seq`, [packageId])).rows.map((r) => r.seq);
}

export interface InclusionBundle {
  package_id: string;
  /** Sequences of the package's events, each inside the segment. */
  events: number[];
  /** The event before the segment's first, which anchors its first link; absent when the segment starts the chain. */
  anchor?: { seq: number; digest: string };
  /** Every event from the package's first through the covering head, as recorded. */
  segment: EventRecord[];
  /** The first valid seal covering the package's last event, or null when none does yet. */
  seal: Json | null;
  witnessed: false;
  statement: string;
}

/**
 * The inclusion proof of a package's events. Covered by the first valid seal whose head is at or after
 * its last event; with no such seal, the segment runs to the chain head and says it is unsealed.
 */
export async function inclusionProof(db: Db, auth: AuthConfig, orgId: string, packageId: string): Promise<InclusionBundle> {
  const owner = (await db.query<{ org_id: string }>("select org_id from object_owners where object_kind = 'package' and object_id = $1", [packageId])).rows[0];
  if (!owner || owner.org_id !== orgId) throw new Refusal(404, "not-found", "No such package");
  const events = await packageEventSeqs(db, packageId);
  if (!events.length) throw new Refusal(404, "not-found", "This package has no recorded events");
  const first = events[0]!;
  const last = events.at(-1)!;
  const report = await verifyRecords(db, auth, orgId);
  const covering = report.seals.filter((s) => s.result === "valid" && s.head_seq >= last).sort((a, b) => a.head_seq - b.head_seq)[0];
  const seal = covering ? (await db.query<{ body: Json }>("select body from chain_seals where id = $1", [covering.id])).rows[0]!.body : null;
  const top = seal ? seal.payload.head_seq : (await chainHead(db))!.head_seq;
  const segment = (await db.query<{ body: EventRecord }>("select body from events where seq between $1 and $2 order by seq", [first, top])).rows.map((r) => r.body);
  const before = (await db.query<{ seq: number; digest: string }>("select seq, digest from events where seq = $1", [first - 1])).rows[0];
  return { package_id: packageId, events, ...(before ? { anchor: before } : {}), segment, seal, witnessed: false, statement: NOT_WITNESSED };
}

/**
 * Checks a bundle on its own, with nothing but the bundle: every event's digest recomputes, every
 * link holds from the anchor, the package's events are in the segment, and the segment ends at the
 * seal's head with the digest the seal signed. (The seal's signature is checked by verifyRecords.)
 */
export function verifyInclusion(b: InclusionBundle): { ok: boolean; problem?: string } {
  if (!b.segment.length) return { ok: false, problem: "the segment is empty" };
  let prev = b.anchor?.digest;
  let expected = b.anchor ? b.anchor.seq + 1 : b.segment[0]!.seq;
  for (const e of b.segment) {
    const { digest: d, ...rest } = e;
    if (e.seq !== expected) return { ok: false, problem: `event ${expected} is missing from the segment` };
    if (eventDigest(rest) !== d.value) return { ok: false, problem: `event ${e.seq} does not match its digest` };
    if (rest.prev?.value !== prev) return { ok: false, problem: `event ${e.seq} does not link to the one before it` };
    prev = d.value;
    expected++;
  }
  const seqs = new Set(b.segment.map((e) => e.seq));
  const missing = b.events.find((s) => !seqs.has(s));
  if (missing !== undefined) return { ok: false, problem: `package event ${missing} is not in the segment` };
  if (b.seal) {
    const tail = b.segment.at(-1)!;
    if (tail.seq !== b.seal.payload.head_seq || tail.digest.value !== b.seal.payload.head_digest.value)
      return { ok: false, problem: "the segment does not end at the seal's head" };
  }
  return { ok: true };
}
