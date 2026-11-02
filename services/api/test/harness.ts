import { createHash, createPrivateKey, generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isoCBOR } from "@simplewebauthn/server/helpers";
import EmbeddedPostgres from "embedded-postgres";
import type { FastifyInstance } from "fastify";
import { buildApp, type AppOptions } from "../src/app.js";
import { hashToken } from "../src/auth.js";
import pg from "pg";

/** Captured before any local `pg` (the embedded server) shadows the module. */
/** The tests' owner pool: an idle connection dropped as the test database shuts down is expected. */
class OwnerPool extends pg.Pool {
  constructor(config: pg.PoolConfig) {
    super(config);
    this.on("error", () => undefined);
  }
}
import { type Db, closeDb, openDb } from "../src/db/index.js";

/** Fixed role passwords for tests: clusters may be shared between test files. */
export const TEST_ROLE_SECRETS = { reader: "1".repeat(48), writer: "2".repeat(48) };

const openDbRaw = async (url: string) => {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  return c;
};

export const ORIGIN = "http://localhost:7300";
export const RP_ID = "localhost";
export const DAEMON_TOKEN = "test-daemon-token-0123456789";
const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));

/** Host server meeting the controller-grant PG17 floor, or use pinned embedded PG17. */
function systemPostgres(): string | null {
  const base = "/usr/lib/postgresql";
  if (!existsSync(base)) return null;
  const versions = readdirSync(base).filter((v) => Number(v)>=17 && existsSync(join(base, v, "bin", "initdb"))).sort((a, b) => Number(b) - Number(a));
  return versions[0] ? join(base, versions[0], "bin") : null;
}

/** A port the operating system reports free on loopback right now. */
function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => (typeof address === "object" && address ? resolvePort(address.port) : reject(new Error("no port"))));
    });
  });
}

export interface Harness {
  app: FastifyInstance;
  /** The application's pool: the reader role. Writes go through commands. */
  db: Db;
  /** The owner (migrator) connection, for tests that deliberately write raw SQL or run DDL. */
  admin: Db;
  stop(): Promise<void>;
}

/** A real Postgres per test file and the real app. Nothing is mocked but the authenticator and the daemon. */
export async function startHarness(
  given: Pick<AppOptions,"guidedPreparation"|"preparedRelease"|"preparationSources"|"preparationRepositories"|"preparationLanes"|"streamReplayMax"> & { trustAnchors?: string[] } = {},
): Promise<Harness> {
  const { trustAnchors, ...options } = given;
  const external = process.env.TEST_DATABASE_URL;
  if (external) {
    // A fresh database per test file on a Postgres the caller provides (CI service or local server).
    const name = `cr_test_${randomBytes(6).toString("hex")}`;
    const admin = await openDbRaw(external);
    await admin.query(`create database ${name}`);
    await admin.end();
    const url = new URL(external);
    url.pathname = `/${name}`;
    const db = await openDb(url.toString(), { secrets: TEST_ROLE_SECRETS });
    const owner = new OwnerPool({ connectionString: url.toString(), max: 4 });
    const app = buildApp({
      ...options,
      db,
      root,
      auth: { rpID: RP_ID, rpName: "Control Rod", origins: [ORIGIN], daemonTokenHash: hashToken(DAEMON_TOKEN), ...(trustAnchors ? { trustAnchors } : {}) },
    });
    await app.ready();
    return {
      app,
      db,
      admin: owner,
      async stop() {
        await app.close();
        await closeDb(db);
        await owner.end();
        const a = await openDbRaw(external);
        await a.query(`drop database if exists ${name}`);
        await a.end();
      },
    };
  }
  const system = process.env.CONTROLROD_TEST_PG_DIR ?? systemPostgres();
  if (system && process.getuid?.() !== 0) {
    // CI runners ship PostgreSQL binaries; start a throwaway cluster with them.
    const dir = mkdtempSync(join(tmpdir(), "cr-pg-"));
    // Password authentication over TCP, as on a real server, so login checks in tests are genuine.
    const pwfile = join(dir + "-pw");
    writeFileSync(pwfile, "test", { mode: 0o600 });
    execFileSync(join(system, "initdb"), ["-D", dir, "-U", "controlrod", "--auth-host=scram-sha-256", "--auth-local=trust", `--pwfile=${pwfile}`, "-E", "UTF8"], { stdio: "ignore" });
    rmSync(pwfile, { force: true });
    // Test files run in parallel; a port can be taken between choosing it and binding it, so retry.
    let port = 0;
    for (let attempt = 1; ; attempt++) {
      port = await freePort();
      try {
        execFileSync(join(system, "pg_ctl"), ["-D", dir, "-o", `-p ${port} -k ${dir} -c listen_addresses=127.0.0.1`, "-w", "start"], { stdio: "ignore" });
        break;
      } catch (error) {
        if (attempt === 3) throw error;
      }
    }
    const db = await openDb(`postgres://controlrod:test@127.0.0.1:${port}/postgres`, { secrets: TEST_ROLE_SECRETS });
    const owner = new OwnerPool({ connectionString: `postgres://controlrod:test@127.0.0.1:${port}/postgres`, max: 4 });
    const app = buildApp({
      ...options,
      db,
      root,
      auth: { rpID: RP_ID, rpName: "Control Rod", origins: [ORIGIN], daemonTokenHash: hashToken(DAEMON_TOKEN), ...(trustAnchors ? { trustAnchors } : {}) },
    });
    await app.ready();
    return {
      app,
      db,
      admin: owner,
      async stop() {
        await app.close();
        await closeDb(db);
        await owner.end();
        execFileSync(join(system, "pg_ctl"), ["-D", dir, "-m", "fast", "-w", "stop"], { stdio: "ignore" });
        rmSync(dir, { recursive: true, force: true });
      },
    };
  }
  const dir = mkdtempSync(join(tmpdir(), "cr-pg-"));
  const port = await freePort();
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
  const db = await openDb(`postgres://controlrod:test@127.0.0.1:${port}/postgres`, { secrets: TEST_ROLE_SECRETS });
  const owner = new OwnerPool({ connectionString: `postgres://controlrod:test@127.0.0.1:${port}/postgres`, max: 4 });
  const app = buildApp({
      ...options,
    db,
    root,
    auth: { rpID: RP_ID, rpName: "Control Rod", origins: [ORIGIN], daemonTokenHash: hashToken(DAEMON_TOKEN), ...(trustAnchors ? { trustAnchors } : {}) },
  });
  await app.ready();
  return {
    app,
    db,
    admin: owner,
    async stop() {
      await app.close();
      await closeDb(db);
      await owner.end();
      await pg.stop();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const b64url = (b: Uint8Array | Buffer) => Buffer.from(b).toString("base64url");
const sha256 = (b: Uint8Array | Buffer | string) => createHash("sha256").update(b).digest();

/** A packed attestation for a test authenticator: the attestation key, its certificate chain (DER) and AAGUID. */
export interface TestAttestation { key: KeyObject; x5c: Buffer[]; aaguid: Buffer; anchorPem: string }

/**
 * A throwaway attestation CA and an authenticator certificate it issued, shaped as the WebAuthn
 * packed format requires (subject OU "Authenticator Attestation", not a CA, AAGUID extension).
 */
export function testAttestation(dir = mkdtempSync(join(tmpdir(), "cr-att-"))): TestAttestation {
  const run = (args: string[]) => execFileSync("openssl", args, { cwd: dir, stdio: "pipe" });
  const aaguid = randomBytes(16);
  run(["ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", "ca.key"]);
  run(["req", "-x509", "-new", "-key", "ca.key", "-subj", "/C=US/O=Test Vendor/CN=Test Attestation Root", "-days", "30", "-out", "ca.pem",
    "-addext", "basicConstraints=critical,CA:TRUE", "-addext", "keyUsage=critical,keyCertSign"]);
  run(["ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", "leaf.key"]);
  run(["req", "-new", "-key", "leaf.key", "-subj", "/C=US/O=Test Vendor/OU=Authenticator Attestation/CN=Test Key", "-out", "leaf.csr"]);
  writeFileSync(join(dir, "leaf.ext"), `basicConstraints=critical,CA:FALSE\n1.3.6.1.4.1.45724.1.1.4=DER:0410${aaguid.toString("hex")}\n`);
  run(["x509", "-req", "-in", "leaf.csr", "-CA", "ca.pem", "-CAkey", "ca.key", "-CAcreateserial", "-days", "30", "-extfile", "leaf.ext", "-outform", "DER", "-out", "leaf.der"]);
  const key = createPrivateKey(readFileSync(join(dir, "leaf.key")));
  return { key, x5c: [readFileSync(join(dir, "leaf.der"))], aaguid, anchorPem: readFileSync(join(dir, "ca.pem"), "utf8") };
}

/** A software passkey: ES256, user present and verified, signing exactly what it is asked to. */
export class VirtualAuthenticator {
  readonly credentialId = randomBytes(16);
  private readonly key: KeyObject;
  private readonly pub: { x: Buffer; y: Buffer };
  private counter = 0;

  /**
   * With `fixedCounter`, the signature counter stays 0 (as many passkeys report), so counters never mask replays.
   * With `attestation`, registration returns a packed attestation signed by that key and carrying that chain;
   * `synced` marks the credential backup eligible, as a synced passkey is.
   */
  constructor(private readonly opts: { fixedCounter?: boolean; attestation?: TestAttestation; synced?: boolean } = {}) {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    this.key = privateKey;
    const jwk = publicKey.export({ format: "jwk" }) as { x: string; y: string };
    this.pub = { x: Buffer.from(jwk.x, "base64url"), y: Buffer.from(jwk.y, "base64url") };
  }

  private authData(attested: boolean): Buffer {
    const flags = 0x01 | 0x04 | (attested ? 0x40 : 0) | (this.opts.synced ? 0x08 | 0x10 : 0);
    const count = Buffer.alloc(4);
    count.writeUInt32BE(this.opts.fixedCounter ? 0 : ++this.counter);
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
      parts.push(Buffer.from(this.opts.attestation?.aaguid ?? Buffer.alloc(16)), len, this.credentialId, Buffer.from(isoCBOR.encode(cose)));
    }
    return Buffer.concat(parts);
  }

  register(options: { challenge: string }) {
    const clientData = Buffer.from(JSON.stringify({ type: "webauthn.create", challenge: options.challenge, origin: ORIGIN }));
    const authData = this.authData(true);
    const a = this.opts.attestation;
    const attStmt = a
      ? new Map<string, unknown>([["alg", -7], ["sig", sign("sha256", Buffer.concat([authData, sha256(clientData)]), a.key)], ["x5c", a.x5c]])
      : new Map();
    const att = new Map<string, unknown>([
      ["fmt", a ? "packed" : "none"],
      ["attStmt", attStmt],
      ["authData", authData],
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
  const m = /^\/runner\/runs\/([^/]+)\/(log|complete|evidence)$/.exec(url);
  if (!m) return payload;
  const out: Record<string, unknown> = { claim_token: claims.get(m[1] ?? "") ?? "", ...payload };
  if (m[2] === "complete" && out.idempotency_key === undefined) out.idempotency_key = randomBytes(12).toString("hex");
  // A daemon with a user systemd proves its run's scope empty; a test that means otherwise says so.
  if (m[2] === "complete" && !("containment" in payload)) out.containment = "cgroup";
  return out;
}

/** Adds a passkey to the signed-in person's own account: sign with an existing passkey, then register. */
export async function addOwnPasskey(app: FastifyInstance, cookie: string, existing: VirtualAuthenticator, added: VirtualAuthenticator): Promise<{ statusCode: number; body: string }> {
  const headers = { cookie, origin: ORIGIN };
  const s = await app.inject({ method: "POST", url: "/auth/step-up/options", headers });
  const o = await app.inject({ method: "POST", url: "/auth/register/options", headers, payload: { step_up: existing.assert(s.json().options) } });
  if (o.statusCode !== 200) throw new Error(`add passkey refused: ${o.body}`);
  return app.inject({ method: "POST", url: "/auth/register/verify", headers, payload: added.register(o.json().options) });
}

/** Signs in with a passkey and returns the session cookie. */
export async function logIn(app: FastifyInstance, key: VirtualAuthenticator): Promise<string> {
  const o = await app.inject({ method: "POST", url: "/auth/login/options", headers: { origin: ORIGIN } });
  const r = await app.inject({ method: "POST", url: "/auth/login/verify", headers: { origin: ORIGIN }, payload: key.assert(o.json().options) as object });
  if (r.statusCode !== 200) throw new Error(`sign in failed: ${r.body}`);
  return `cr_session=${r.cookies.find((c) => c.name === "cr_session")!.value}`;
}

/** Registers a new person's first passkey with an administrator's invitation; returns their session cookie. */
export async function registerWithInvitation(app: FastifyInstance, invitation: string, key: VirtualAuthenticator): Promise<string> {
  const headers = { origin: ORIGIN };
  const o = await app.inject({ method: "POST", url: "/auth/register/options", headers, payload: { invitation } });
  if (o.statusCode !== 200) throw new Error(`invitation refused: ${o.body}`);
  const r = await app.inject({ method: "POST", url: "/auth/register/verify", headers, payload: key.register(o.json().options) });
  if (r.statusCode !== 200) throw new Error(`register failed: ${r.body}`);
  return `cr_session=${r.cookies.find((c) => c.name === "cr_session")!.value}`;
}
