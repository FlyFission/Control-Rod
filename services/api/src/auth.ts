import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Db } from "./db/index.js";
import { attestationAnchored } from "./attestation.js";
import { command } from "./commands/executor.js";
import { LOCAL_ORG, grantFoundingAuthorities, recordRegistration } from "./tenancy.js";
import { Refusal } from "./refusal.js";

export interface AuthConfig {
  rpID: string;
  rpName: string;
  origins: string[];
  /** SHA-256 of the daemon token, hex. */
  daemonTokenHash: string;
  /**
   * SHA-256 of the command-line token, hex: `controlrod card add` and `controlrod cards` send it.
   * It lives beside the daemon token in the Control Rod home (owner read-only, hidden from runs) and
   * only opens the few routes in CLI_ROUTES. None means the command line cannot reach the app.
   */
  cliTokenHash?: string;
  /** PEM trust anchors for authenticator attestation (docs/sqa/authenticators.md). None means nothing is attested. */
  trustAnchors?: string[];
}

const SESSION_COOKIE = "cr_session";
const SESSION_DAYS = 7;
const CHALLENGE_MINUTES = 5;

const sha256 = (s: string | Uint8Array) => createHash("sha256").update(s).digest("hex");
const b64url = (b: Uint8Array) => Buffer.from(b).toString("base64url");

export async function isRegistered(db: Db): Promise<boolean> {
  const r = await db.query("select 1 from credentials limit 1");
  return (r.rowCount ?? 0) > 0;
}

/**
 * Stores a challenge. `issuedTo` records which person it was issued to, so ending that person's
 * access (suspension, removal, revocation) can void every challenge they hold. It is kept beside the
 * data and never returned with it.
 */
async function storeChallenge(db: Db, challenge: string, purpose: string, data: object, issuedTo?: string) {
  await command(db, "auth.challenge-issue", async (c) => {
    await c.query("delete from challenges where expires_at < now()");
    await c.query(
      `insert into challenges (challenge, purpose, data, expires_at)
       values ($1, $2, $3, now() + interval '${CHALLENGE_MINUTES} minutes')`,
      [challenge, purpose, issuedTo === undefined ? data : { ...data, issued_to: issuedTo }],
    );
  });
}

/** Takes a challenge exactly once. A replayed or expired challenge returns nothing. */
export async function takeChallenge(db: Db, challenge: string, purpose: string): Promise<Record<string, unknown> | null> {
  return (await takeChallengeFor(db, challenge, purpose))?.data ?? null;
}

/** Takes a challenge exactly once, with the person it was issued to (if recorded). */
async function takeChallengeFor(
  db: Db,
  challenge: string,
  purpose: string,
): Promise<{ data: Record<string, unknown>; issuedTo?: string } | null> {
  const r = await command(db, "auth.challenge-consume", (c) =>
    c.query<{ data: Record<string, unknown> }>(
      "delete from challenges where challenge = $1 and purpose = $2 and expires_at > now() returning data",
      [challenge, purpose],
    ),
  );
  const data = r.rows[0]?.data;
  if (!data) return null;
  const { issued_to: issuedTo, ...rest } = data;
  return typeof issuedTo === "string" ? { data: rest, issuedTo } : { data: rest };
}

function clientChallenge(response: { response: { clientDataJSON: string } }): string {
  try {
    const json = Buffer.from(response.response.clientDataJSON, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as { challenge?: unknown };
    return typeof parsed?.challenge === "string" ? parsed.challenge : "";
  } catch {
    return ""; // malformed assertions have no consumable challenge
  }
}

/**
 * How a registration was authorized: the very first passkey (bootstrap), an administrator's
 * invitation for a new person, or a Member adding a passkey to their own account after signing
 * with one they already hold.
 */
export type RegistrationGrant = { kind: "first" } | { kind: "invitation"; invitation_hash: string } | { kind: "additional"; via: string };

export async function registrationOptions(db: Db, cfg: AuthConfig, name: string, grant: RegistrationGrant) {
  const options = await generateRegistrationOptions({
    rpName: cfg.rpName,
    rpID: cfg.rpID,
    userName: name,
    // Ask for the authenticator's attestation so a hardware key can prove its class. Synced
    // passkeys usually answer with none, which is recorded as such.
    attestationType: "direct",
    authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
  });
  await storeChallenge(db, options.challenge, "register", { name, ...grant }, name);
  return options;
}

export async function registrationVerify(db: Db, cfg: AuthConfig, body: RegistrationResponseJSON) {
  const challenge = clientChallenge(body);
  const data = await takeChallenge(db, challenge, "register");
  if (data === null) return null;
  const result = await verifyRegistrationResponse({
    response: body,
    expectedChallenge: challenge,
    expectedOrigin: cfg.origins,
    expectedRPID: cfg.rpID,
    requireUserVerification: true,
  });
  if (!result.verified) return null;
  const info = result.registrationInfo;
  const { credential } = info;
  const attested = await attestationAnchored(info.fmt, body.response.attestationObject, cfg.trustAnchors ?? []);
  await command(db, "auth.register-credential", async (c) => {
    await c.query("select pg_advisory_xact_lock(hashtext('controlrod-admin:' || coalesce((select org_id from members where user_name = $1), 'org_local')))", [String(data.name)]);
    if (data.kind === "first" && (await c.query("select 1 from credentials limit 1")).rowCount)
      throw new Error("a passkey was registered first by someone else");
    if (data.kind === "invitation") {
      // An invitation registers a first passkey for an active member, once.
      const used = await c.query(
        `update member_invitations i set used_at = now() from members m
          where i.token_hash = $1 and i.used_at is null and i.expires_at > now()
            and m.id = i.member_id and m.body->>'status' = 'active' and m.user_name = $2
            and not exists (select 1 from credentials k where k.user_name = $2)
          returning i.member_id`,
        [String(data.invitation_hash), String(data.name)]);
      if (!used.rowCount) throw new Error("this invitation is no longer valid");
    }
    if (data.kind === "additional") {
      // Still an active member, and the passkey that authorized this is still valid.
      const ok = await c.query(
        `select 1 from members m where m.user_name = $1 and m.body->>'status' = 'active'
           and exists (select 1 from credentials k where k.id = $2 and k.user_name = $1)
           and not exists (select 1 from authenticator_credentials a where a.credential_id = $2 and (a.body->>'revoked')::boolean is true
             and a.version = (select max(version) from authenticator_credentials b where b.credential_id = $2))`,
        [String(data.name), String(data.via)]);
      if (!ok.rowCount) throw new Error("the account or the passkey that authorized this registration is no longer valid");
    }
    await c.query(
      "insert into credentials (id, user_name, public_key, counter, transports) values ($1, $2, $3, $4, $5)",
      [credential.id, String(data.name), Buffer.from(credential.publicKey), credential.counter, credential.transports ?? []],
    );
    await recordRegistration(c, {
      userName: String(data.name), credentialId: credential.id, format: info.fmt, aaguid: info.aaguid,
      userVerified: info.userVerified, backupEligible: info.credentialDeviceType === "multiDevice", attestationVerified: attested.verified,
      evidence: { attestation_object: body.response.attestationObject, ...(attested.anchor ? { trust_anchor_digest: { algorithm: "sha256", value: attested.anchor } } : {}) },
    }, { kind: "human", id: String(data.name) });
    // The very first person becomes the organization's founding member, able to run it at once.
    if (data.kind === "first") await grantFoundingAuthorities(c, LOCAL_ORG);
  });
  return { user: String(data.name), credentialId: credential.id };
}

async function allowCredentials(db: Db) {
  // A revoked passkey is never offered.
  const r = await db.query<{ id: string; transports: string[] }>("select id, transports from credentials where not exists (select 1 from authenticator_credentials a where a.credential_id = credentials.id and (a.body->>'revoked')::boolean is true and a.version = (select max(version) from authenticator_credentials b where b.credential_id = credentials.id))");
  return r.rows.map((x) => ({
    id: x.id,
    transports: x.transports as AuthenticatorTransportFuture[],
  }));
}
type AuthenticatorTransportFuture = "ble" | "cable" | "hybrid" | "internal" | "nfc" | "smart-card" | "usb";

/** Authentication options. For a decision, `challenge` is derived from the subject digest. */
export async function assertionOptions(
  db: Db,
  cfg: AuthConfig,
  purpose: string,
  data: object,
  challenge?: Uint8Array,
  issuedTo?: string,
) {
  const options = await generateAuthenticationOptions({
    rpID: cfg.rpID,
    allowCredentials: await allowCredentials(db),
    userVerification: "required",
    ...(challenge ? { challenge: challenge as Uint8Array<ArrayBuffer> } : {}),
  });
  await storeChallenge(db, options.challenge, purpose, data, issuedTo);
  return options;
}

/**
 * Why a passkey signature was refused, for the person to read. Only the cause is typed here; every
 * check is the same as it always was.
 * - expired: the prompt it answers was never issued, has expired, or was already used.
 * - unknown-passkey: no usable passkey here has this id (never registered, or revoked).
 * - other-person: the prompt was issued to someone else.
 * - inactive: the passkey's owner is not an active member.
 * - origin: it was signed for another web address or relying party.
 * - counter: its use count did not go forward, which can mean a copied passkey.
 * - not-verified: the authenticator did not confirm the person (fingerprint, face or PIN).
 * - bad-signature: anything else that failed verification, including a malformed response.
 */
export type AssertionFailure = "expired" | "unknown-passkey" | "other-person" | "inactive" | "origin" | "counter" | "not-verified" | "bad-signature";

export type AssertionCheck =
  | { ok: true; user: string; credentialId: string; data: Record<string, unknown> }
  | { ok: false; reason: AssertionFailure };

/** The cause, read from what @simplewebauthn/server threw. Unrecognised errors are a bad signature. */
function failureOf(err: unknown): AssertionFailure {
  const code = (err as { code?: unknown })?.code;
  const message = err instanceof Error ? err.message : "";
  if (code === "UNEXPECTED_ORIGIN" || code === "UNEXPECTED_RP_ID" || /origin|RP ID/i.test(message)) return "origin";
  if (/counter/i.test(message)) return "counter";
  if (/user verification|user could not be verified|not present/i.test(message)) return "not-verified";
  if (/challenge/i.test(message)) return "expired";
  return "bad-signature";
}

/**
 * Verifies an assertion and consumes its challenge, saying why when it is refused. The counter only
 * moves forward: two answers verified at once cannot set it back (compare and swap).
 */
export async function checkAssertion(
  db: Db,
  cfg: AuthConfig,
  purpose: string,
  body: AuthenticationResponseJSON,
): Promise<AssertionCheck> {
  const challenge = clientChallenge(body);
  // A response that names no challenge at all is malformed; no stored challenge is ever empty.
  if (!challenge) return { ok: false, reason: "bad-signature" };
  const taken = await takeChallengeFor(db, challenge, purpose);
  if (taken === null) return { ok: false, reason: "expired" };
  const { data, issuedTo } = taken;
  const r = await db.query<{ id: string; user_name: string; public_key: Buffer; counter: string; transports: string[] }>(
    // A revoked passkey cannot sign in or sign anything.
    "select * from credentials where id = $1 and not exists (select 1 from authenticator_credentials a where a.credential_id = credentials.id and (a.body->>'revoked')::boolean is true and a.version = (select max(version) from authenticator_credentials b where b.credential_id = credentials.id))",
    [body.id],
  );
  const row = r.rows[0];
  if (!row) return { ok: false, reason: "unknown-passkey" };
  // A challenge issued to one person can be answered only by that person's passkey.
  if (issuedTo !== undefined && issuedTo !== row.user_name) return { ok: false, reason: "other-person" };
  // Only an active Member's passkey signs in or signs anything.
  const active = await db.query("select 1 from members where user_name = $1 and body->>'status' = 'active'", [row.user_name]);
  if (!active.rowCount) return { ok: false, reason: "inactive" };
  let result;
  try {
    result = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge: challenge,
      expectedOrigin: cfg.origins,
      expectedRPID: cfg.rpID,
      requireUserVerification: true,
      credential: {
        id: row.id,
        publicKey: new Uint8Array(row.public_key),
        counter: Number(row.counter),
        transports: row.transports as AuthenticatorTransportFuture[],
      },
    });
  } catch (e) {
    return { ok: false, reason: failureOf(e) };
  }
  if (!result.verified) return { ok: false, reason: "bad-signature" };
  const next = result.authenticationInfo.newCounter;
  // The same rule the verification applied, held at the write: forward, or zero for a passkey that
  // never counts. A concurrent answer that moved the counter past this one wins, and this one is refused.
  const moved = await command(db, "auth.record-assertion", (c) =>
    c.query("update credentials set counter = $2 where id = $1 and (counter < $2 or (counter = 0 and $2 = 0))", [row.id, next]),
  );
  if (!moved.rowCount) return { ok: false, reason: "counter" };
  return { ok: true, user: row.user_name, credentialId: row.id, data };
}

/** The refusal for a passkey signature that came and was not accepted, said for the person. */
const FAILURE_REFUSAL: Record<AssertionFailure, [code: string, message: string]> = {
  expired: ["passkey-expired", "This passkey prompt has expired or was already used, so the signature was not accepted"],
  "unknown-passkey": ["passkey-unknown", "That passkey is not registered here, or it has been revoked"],
  "other-person": ["passkey-other-person", "That passkey belongs to a different account from the one this prompt was for"],
  inactive: ["member-inactive", "The account this passkey belongs to is not active"],
  origin: ["passkey-origin", "The passkey signed for a different web address from this Control Rod"],
  counter: ["passkey-counter", "Your passkey's use count went backwards, so the signature was refused. That can mean the passkey was copied"],
  "not-verified": ["passkey-not-verified", "Your passkey did not confirm it was you with a fingerprint, face or PIN"],
  "bad-signature": ["passkey-bad-signature", "The passkey signature did not check out"],
};

export function passkeyRefused(reason: AssertionFailure, status: 401 | 403 = 403): Refusal {
  const [code, message] = FAILURE_REFUSAL[reason];
  return new Refusal(status, code, message);
}

/**
 * Verifies a passkey signature that came with a request, refusing with the reason when it does not
 * verify. "Needs your passkey" is kept for a request that carried no signature at all.
 */
export async function requireAssertion(
  db: Db,
  cfg: AuthConfig,
  purpose: string,
  body: unknown,
  status: 401 | 403 = 403,
): Promise<{ user: string; credentialId: string; data: Record<string, unknown> }> {
  const r = await checkAssertion(db, cfg, purpose, body as AuthenticationResponseJSON);
  if (!r.ok) throw passkeyRefused(r.reason, status);
  return { user: r.user, credentialId: r.credentialId, data: r.data };
}

/** A verified signature over something other than this request. */
export const signatureMismatch = () => new Refusal(403, "signature-mismatch", "The signature does not cover this exact request");

/** Verifies an assertion and consumes its challenge. Returns the user and the challenge data, or null. */
export async function assertionVerify(
  db: Db,
  cfg: AuthConfig,
  purpose: string,
  body: AuthenticationResponseJSON,
): Promise<{ user: string; credentialId: string; data: Record<string, unknown> } | null> {
  const r = await checkAssertion(db, cfg, purpose, body);
  return r.ok ? { user: r.user, credentialId: r.credentialId, data: r.data } : null;
}

/** The passkey is the person's own and its latest version is not revoked. */
const USABLE_CREDENTIAL = `exists (select 1 from credentials cr where cr.id = $3 and cr.user_name = $2)
  and not exists (select 1 from authenticator_credentials a where a.credential_id = $3 and (a.body->>'revoked')::boolean is true
    and a.version = (select max(version) from authenticator_credentials b where b.credential_id = $3))`;

export async function startSession(db: Db, reply: FastifyReply, user: string, credentialId: string, secure = false) {
  const token = b64url(randomBytes(32));
  // Under the organization lock, and only for an active member whose passkey is still usable: a
  // suspension or a passkey revocation that is committing cannot be outrun by a session created in
  // the gap after the assertion was checked. The session names its passkey, so revoking it ends it.
  const started = await command(db, "auth.session-start", async (c) => {
    await c.query("select pg_advisory_xact_lock(hashtext('controlrod-admin:' || coalesce((select org_id from members where user_name = $1), 'org_local')))", [user]);
    return c.query(
      `insert into sessions (token_hash, user_name, expires_at, credential_id)
       select $1, $2, now() + interval '${SESSION_DAYS} days', $3
        where exists (select 1 from members where user_name = $2 and body->>'status' = 'active') and ${USABLE_CREDENTIAL}`,
      [sha256(token), user, credentialId],
    );
  });
  if (!started.rowCount) throw new Error("membership is not active");
  reply.setCookie(SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure,
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function endSession(db: Db, request: FastifyRequest, reply: FastifyReply) {
  const token = request.cookies[SESSION_COOKIE];
  if (token) await command(db, "auth.session-end", (c) => c.query("delete from sessions where token_hash = $1", [sha256(token)]));
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}

/** The person a session belongs to, only while their membership is active and its passkey is not revoked. */
export async function sessionUser(db: Db, request: FastifyRequest): Promise<string | null> {
  const token = request.cookies[SESSION_COOKIE];
  if (!token) return null;
  const r = await db.query<{ user_name: string }>(
    `select s.user_name from sessions s join members m on m.user_name = s.user_name
      where s.token_hash = $1 and s.expires_at > now() and m.body->>'status' = 'active'
        and not exists (select 1 from authenticator_credentials a where a.credential_id = s.credential_id and (a.body->>'revoked')::boolean is true
          and a.version = (select max(version) from authenticator_credentials b where b.credential_id = s.credential_id))`,
    [sha256(token)],
  );
  return r.rows[0]?.user_name ?? null;
}

/** True when the request carries the daemon token. The daemon never has a session. */
export function isDaemon(cfg: AuthConfig, request: FastifyRequest): boolean {
  const h = request.headers.authorization ?? "";
  if (!h.startsWith("Bearer ")) return false;
  const got = Buffer.from(sha256(h.slice(7)), "hex");
  const want = Buffer.from(cfg.daemonTokenHash, "hex");
  return got.length === want.length && timingSafeEqual(got, want);
}

/**
 * The routes the command-line token opens: list projects and cards, and add a card the way the
 * board's quick add does (find the workspace root, make the card's worktree, send the capture).
 * Nothing that signs, accepts, releases or changes settings.
 */
export const CLI_ROUTES: ReadonlySet<string> = new Set([
  "GET /workspace/projects",
  "GET /packages",
  "GET /captures",
  "POST /captures",
  "GET /repos",
  "POST /repos/materialize",
]);

/** True when the request carries the command-line token and asks for a route it opens. */
export function isCli(cfg: AuthConfig, request: FastifyRequest): boolean {
  if (!cfg.cliTokenHash) return false;
  if (!CLI_ROUTES.has(`${request.method} ${request.routeOptions?.url ?? ""}`)) return false;
  const h = request.headers.authorization ?? "";
  if (!h.startsWith("Bearer ")) return false;
  const got = Buffer.from(sha256(h.slice(7)), "hex");
  const want = Buffer.from(cfg.cliTokenHash, "hex");
  return got.length === want.length && timingSafeEqual(got, want);
}

/**
 * Who the command line acts as: the installation's first active member, the person who set this
 * machine up. Only someone who can read the Control Rod home holds the token.
 */
export async function cliUser(db: Db): Promise<string | null> {
  const r = await db.query<{ user_name: string }>(
    "select user_name from members where body->>'status' = 'active' order by created_at, id limit 1",
  );
  return r.rows[0]?.user_name ?? null;
}

export const hashToken = sha256;
