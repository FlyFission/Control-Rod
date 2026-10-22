import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isoCBOR } from "@simplewebauthn/server/helpers";
import EmbeddedPostgres from "embedded-postgres";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { hashToken } from "../src/auth.js";
import pg from "pg";
import { type Db, openDb } from "../src/db/index.js";

const openDbRaw = async (url: string) => {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  return c;
};

export const ORIGIN = "http://localhost:7300";
export const RP_ID = "localhost";
export const DAEMON_TOKEN = "test-daemon-token-0123456789";
const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));

/** Directory of a system PostgreSQL's server binaries, if one is installed. */
function systemPostgres(): string | null {
  const base = "/usr/lib/postgresql";
  if (!existsSync(base)) return null;
  const versions = readdirSync(base).filter((v) => existsSync(join(base, v, "bin", "initdb"))).sort((a, b) => Number(b) - Number(a));
  return versions[0] ? join(base, versions[0], "bin") : null;
}

export interface Harness {
  app: FastifyInstance;
  db: Db;
  stop(): Promise<void>;
}

/** A real Postgres per test file and the real app. Nothing is mocked but the authenticator and the daemon. */
export async function startHarness(): Promise<Harness> {
  const external = process.env.TEST_DATABASE_URL;
  if (external) {
    // A fresh database per test file on a Postgres the caller provides (CI service or local server).
    const name = `cr_test_${randomBytes(6).toString("hex")}`;
    const admin = await openDbRaw(external);
    await admin.query(`create database ${name}`);
    await admin.end();
    const url = new URL(external);
    url.pathname = `/${name}`;
    const db = await openDb(url.toString());
    const app = buildApp({
      db,
      root,
      auth: { rpID: RP_ID, rpName: "Control Rod", origins: [ORIGIN], daemonTokenHash: hashToken(DAEMON_TOKEN) },
    });
    await app.ready();
    return {
      app,
      db,
      async stop() {
        await app.close();
        await db.end();
        const a = await openDbRaw(external);
        await a.query(`drop database if exists ${name}`);
        await a.end();
      },
    };
  }
  const system = systemPostgres();
  if (system && process.getuid?.() !== 0) {
    // CI runners ship PostgreSQL binaries; start a throwaway cluster with them.
    const dir = mkdtempSync(join(tmpdir(), "cr-pg-"));
    const port = 20000 + Math.floor(Math.random() * 20000);
    execFileSync(join(system, "initdb"), ["-D", dir, "-U", "controlrod", "--auth=trust", "-E", "UTF8"], { stdio: "ignore" });
    execFileSync(join(system, "pg_ctl"), ["-D", dir, "-o", `-p ${port} -k ${dir} -c listen_addresses=127.0.0.1`, "-w", "start"], { stdio: "ignore" });
    const db = await openDb(`postgres://controlrod@127.0.0.1:${port}/postgres`);
    const app = buildApp({
      db,
      root,
      auth: { rpID: RP_ID, rpName: "Control Rod", origins: [ORIGIN], daemonTokenHash: hashToken(DAEMON_TOKEN) },
    });
    await app.ready();
    return {
      app,
      db,
      async stop() {
        await app.close();
        await db.end();
        execFileSync(join(system, "pg_ctl"), ["-D", dir, "-m", "fast", "-w", "stop"], { stdio: "ignore" });
        rmSync(dir, { recursive: true, force: true });
      },
    };
  }
  const dir = mkdtempSync(join(tmpdir(), "cr-pg-"));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const pg = new EmbeddedPostgres({
    databaseDir: dir,
    user: "controlrod",
    password: "test",
    port,
    persistent: false,
    createPostgresUser: process.getuid?.() === 0,
    onLog: () => undefined,
    onError: () => undefined,
  });
  await pg.initialise();
  await pg.start();
  const db = await openDb(`postgres://controlrod:test@127.0.0.1:${port}/postgres`);
  const app = buildApp({
    db,
    root,
    auth: { rpID: RP_ID, rpName: "Control Rod", origins: [ORIGIN], daemonTokenHash: hashToken(DAEMON_TOKEN) },
  });
  await app.ready();
  return {
    app,
    db,
    async stop() {
      await app.close();
      await db.end();
      await pg.stop();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const b64url = (b: Uint8Array | Buffer) => Buffer.from(b).toString("base64url");
const sha256 = (b: Uint8Array | Buffer | string) => createHash("sha256").update(b).digest();

/** A software passkey: ES256, user present and verified, signing exactly what it is asked to. */
export class VirtualAuthenticator {
  readonly credentialId = randomBytes(16);
  private readonly key: KeyObject;
  private readonly pub: { x: Buffer; y: Buffer };
  private counter = 0;

  constructor() {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    this.key = privateKey;
    const jwk = publicKey.export({ format: "jwk" }) as { x: string; y: string };
    this.pub = { x: Buffer.from(jwk.x, "base64url"), y: Buffer.from(jwk.y, "base64url") };
  }

  private authData(attested: boolean): Buffer {
    const flags = 0x01 | 0x04 | (attested ? 0x40 : 0);
    const count = Buffer.alloc(4);
    count.writeUInt32BE(++this.counter);
    const parts = [sha256(RP_ID), Buffer.from([flags]), count];
    if (attested) {
      const cose = new Map<number, number | Uint8Array>([
        [1, 2],
        [3, -7],
        [-1, 1],
        [-2, this.pub.x],
        [-3, this.pub.y],
      ]);
      const len = Buffer.alloc(2);
      len.writeUInt16BE(this.credentialId.length);
      parts.push(Buffer.alloc(16), len, this.credentialId, Buffer.from(isoCBOR.encode(cose)));
    }
    return Buffer.concat(parts);
  }

  register(options: { challenge: string }) {
    const clientData = Buffer.from(JSON.stringify({ type: "webauthn.create", challenge: options.challenge, origin: ORIGIN }));
    const att = new Map<string, unknown>([
      ["fmt", "none"],
      ["attStmt", new Map()],
      ["authData", this.authData(true)],
    ]);
    return {
      id: b64url(this.credentialId),
      rawId: b64url(this.credentialId),
      type: "public-key",
      response: {
        clientDataJSON: b64url(clientData),
        attestationObject: b64url(isoCBOR.encode(att as never)),
        transports: ["internal"],
      },
      clientExtensionResults: {},
    };
  }

  assert(options: { challenge: string }, origin = ORIGIN) {
    const clientData = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge: options.challenge, origin }));
    const authData = this.authData(false);
    const signature = sign("sha256", Buffer.concat([authData, sha256(clientData)]), this.key);
    return {
      id: b64url(this.credentialId),
      rawId: b64url(this.credentialId),
      type: "public-key",
      response: {
        clientDataJSON: b64url(clientData),
        authenticatorData: b64url(authData),
        signature: b64url(signature),
      },
      clientExtensionResults: {},
    };
  }
}

/** Registers the owner and returns a cookie header for the session. */
export async function signIn(app: FastifyInstance, auth: VirtualAuthenticator): Promise<string> {
  const headers = { origin: ORIGIN };
  const o = await app.inject({ method: "POST", url: "/auth/register/options", headers, payload: { name: "ben" } });
  const reg = await app.inject({ method: "POST", url: "/auth/register/verify", headers, payload: auth.register(o.json().options) });
  if (reg.statusCode !== 200) throw new Error(`register failed: ${reg.body}`);
  const cookie = reg.cookies.find((c) => c.name === "cr_session");
  if (!cookie) throw new Error("no session cookie");
  return `cr_session=${cookie.value}`;
}

export const daemonHeaders = { authorization: `Bearer ${DAEMON_TOKEN}` };
export const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64");

/** Claim tokens the tests' daemon holds, by run id. */
export const claims = new Map<string, string>();

/**
 * Adds what the daemon always sends: the run's claim token on log and completion posts, and an
 * idempotency key on a completion. A payload that sets either keeps its own value.
 */
export function withClaim(url: string, payload: Record<string, unknown>): Record<string, unknown> {
  const m = /^\/runner\/runs\/([^/]+)\/(log|complete)$/.exec(url);
  if (!m) return payload;
  const out: Record<string, unknown> = { claim_token: claims.get(m[1] ?? "") ?? "", ...payload };
  if (m[2] === "complete" && out.idempotency_key === undefined) out.idempotency_key = randomBytes(12).toString("hex");
  return out;
}
