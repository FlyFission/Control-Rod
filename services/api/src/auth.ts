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

export interface AuthConfig {
  rpID: string;
  rpName: string;
  origins: string[];
  /** SHA-256 of the daemon token, hex. */
  daemonTokenHash: string;
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
  return String(data.name);
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

/** Verifies an assertion and consumes its challenge. Returns the user and the challenge data. */
export async function assertionVerify(
  db: Db,
  cfg: AuthConfig,
  purpose: string,
  body: AuthenticationResponseJSON,
): Promise<{ user: string; credentialId: string; data: Record<string, unknown> } | null> {
  const challenge = clientChallenge(body);
  const taken = await takeChallengeFor(db, challenge, purpose);
  if (taken === null) return null;
  const { data, issuedTo } = taken;
  const r = await db.query<{ id: string; user_name: string; public_key: Buffer; counter: string; transports: string[] }>(
    // A revoked passkey cannot sign in or sign anything.
    "select * from credentials where id = $1 and not exists (select 1 from authenticator_credentials a where a.credential_id = credentials.id and (a.body->>'revoked')::boolean is true and a.version = (select max(version) from authenticator_credentials b where b.credential_id = credentials.id))",
    [body.id],
  );
  const row = r.rows[0];
  if (!row) return null;
  // A challenge issued to one person can be answered only by that person's passkey.
  if (issuedTo !== undefined && issuedTo !== row.user_name) return null;
  // Only an active Member's passkey signs in or signs anything.
  const active = await db.query("select 1 from members where user_name = $1 and body->>'status' = 'active'", [row.user_name]);
  if (!active.rowCount) return null;
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
  } catch {
    return null;
  }
  if (!result.verified) return null;
  await command(db, "auth.record-assertion", (c) =>
    c.query("update credentials set counter = $2 where id = $1", [row.id, result.authenticationInfo.newCounter]),
  );
  return { user: row.user_name, credentialId: row.id, data };
}

export async function startSession(db: Db, reply: FastifyReply, user: string) {
  const token = b64url(randomBytes(32));
  // Under the organization lock, and only for an active member: a suspension that is committing
  // cannot be outrun by a session created in the gap.
  const started = await command(db, "auth.session-start", async (c) => {
    await c.query("select pg_advisory_xact_lock(hashtext('controlrod-admin:' || coalesce((select org_id from members where user_name = $1), 'org_local')))", [user]);
    return c.query(
      `insert into sessions (token_hash, user_name, expires_at)
       select $1, $2, now() + interval '${SESSION_DAYS} days'
        where exists (select 1 from members where user_name = $2 and body->>'status' = 'active')`,
      [sha256(token), user],
    );
  });
  if (!started.rowCount) throw new Error("membership is not active");
  reply.setCookie(SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure: false,
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function endSession(db: Db, request: FastifyRequest, reply: FastifyReply) {
  const token = request.cookies[SESSION_COOKIE];
  if (token) await command(db, "auth.session-end", (c) => c.query("delete from sessions where token_hash = $1", [sha256(token)]));
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}

/** The person a session belongs to, only while their membership is active. */
export async function sessionUser(db: Db, request: FastifyRequest): Promise<string | null> {
  const token = request.cookies[SESSION_COOKIE];
  if (!token) return null;
  const r = await db.query<{ user_name: string }>(
    `select s.user_name from sessions s join members m on m.user_name = s.user_name
      where s.token_hash = $1 and s.expires_at > now() and m.body->>'status' = 'active'`,
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

export const hashToken = sha256;
