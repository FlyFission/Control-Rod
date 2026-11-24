/**
 * A software passkey for the live suites, usable from Chromium, Firefox and WebKit alike.
 *
 * The page's `navigator.credentials.create/get` are replaced (before any app script runs) by a shim
 * that hands the options to this Node-side authenticator through a Playwright binding and wraps the
 * answer as a PublicKeyCredential. The server still verifies everything: challenge, origin, RP ID,
 * signature, counter and the packed attestation chain, which chains to a throwaway CA the stack
 * writes into CONTROLROD_HOME/trust-anchors. Nothing about the app's passkey path is bypassed; only
 * the hardware is simulated. Port of the API suite's VirtualAuthenticator (services/api/test/harness.ts)
 * without its server-side imports.
 */
import { createHash, createPrivateKey, generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BrowserContext, Page } from "@playwright/test";

const sha256 = (b: Buffer | string) => createHash("sha256").update(b).digest();
const b64url = (b: Buffer) => b.toString("base64url");

/** Minimal canonical CBOR encoder: unsigned and negative integers, byte and text strings, arrays, maps. */
function cbor(v: unknown): Buffer {
  const head = (major: number, n: number): Buffer => {
    if (n < 24) return Buffer.from([(major << 5) | n]);
    if (n < 0x100) return Buffer.from([(major << 5) | 24, n]);
    if (n < 0x10000) { const b = Buffer.alloc(3); b[0] = (major << 5) | 25; b.writeUInt16BE(n, 1); return b; }
    const b = Buffer.alloc(5); b[0] = (major << 5) | 26; b.writeUInt32BE(n, 1); return b;
  };
  if (typeof v === "number") return v >= 0 ? head(0, v) : head(1, -1 - v);
  if (Buffer.isBuffer(v)) return Buffer.concat([head(2, v.length), v]);
  if (typeof v === "string") { const s = Buffer.from(v, "utf8"); return Buffer.concat([head(3, s.length), s]); }
  if (Array.isArray(v)) return Buffer.concat([head(4, v.length), ...v.map(cbor)]);
  if (v instanceof Map) return Buffer.concat([head(5, v.size), ...[...v].flatMap(([k, x]) => [cbor(k), cbor(x)])]);
  throw new Error(`cbor: unsupported ${typeof v}`);
}

export interface Attestation { key: KeyObject; x5c: Buffer[]; aaguid: Buffer; anchorPem: string }

/** A throwaway attestation CA and leaf shaped as WebAuthn "packed" requires. Needs openssl on PATH. */
export function makeAttestation(dir = mkdtempSync(join(tmpdir(), "cr-live-att-"))): Attestation {
  const run = (args: string[]) => execFileSync("openssl", args, { cwd: dir, stdio: "pipe" });
  const aaguid = randomBytes(16);
  run(["ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", "ca.key"]);
  run(["req", "-x509", "-new", "-key", "ca.key", "-subj", "/C=US/O=Live Test Vendor/CN=Live Test Attestation Root", "-days", "30", "-out", "ca.pem",
    "-addext", "basicConstraints=critical,CA:TRUE", "-addext", "keyUsage=critical,keyCertSign"]);
  run(["ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", "leaf.key"]);
  run(["req", "-new", "-key", "leaf.key", "-subj", "/C=US/O=Live Test Vendor/OU=Authenticator Attestation/CN=Live Test Key", "-out", "leaf.csr"]);
  writeFileSync(join(dir, "leaf.ext"), `basicConstraints=critical,CA:FALSE\n1.3.6.1.4.1.45724.1.1.4=DER:0410${aaguid.toString("hex")}\n`);
  run(["x509", "-req", "-in", "leaf.csr", "-CA", "ca.pem", "-CAkey", "ca.key", "-CAcreateserial", "-days", "30", "-extfile", "leaf.ext", "-outform", "DER", "-out", "leaf.der"]);
  return { key: createPrivateKey(readFileSync(join(dir, "leaf.key"))), x5c: [readFileSync(join(dir, "leaf.der"))], aaguid, anchorPem: readFileSync(join(dir, "ca.pem"), "utf8") };
}

/** One software passkey: ES256, user present and verified. */
export class SoftPasskey {
  readonly credentialId = randomBytes(16);
  private readonly key: KeyObject;
  private readonly x: Buffer;
  private readonly y: Buffer;
  private counter = 0;
  /** Every ceremony this key answered, for tests that count prompts (a double click must not sign twice). */
  readonly ceremonies: { kind: "create" | "get"; at: number }[] = [];
  /** When set, the next ceremony fails as if the person cancelled the prompt. */
  cancelNext = false;

  constructor(private readonly attestation: Attestation, private readonly rpId = "localhost") {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    this.key = privateKey;
    const jwk = publicKey.export({ format: "jwk" }) as { x: string; y: string };
    this.x = Buffer.from(jwk.x, "base64url");
    this.y = Buffer.from(jwk.y, "base64url");
  }

  private authData(withCredential: boolean): Buffer {
    const flags = 0x01 | 0x04 | (withCredential ? 0x40 : 0);
    const count = Buffer.alloc(4);
    count.writeUInt32BE(++this.counter);
    const parts = [sha256(this.rpId), Buffer.from([flags]), count];
    if (withCredential) {
      const len = Buffer.alloc(2);
      len.writeUInt16BE(this.credentialId.length);
      const cose = new Map<number, number | Buffer>([[1, 2], [3, -7], [-1, 1], [-2, this.x], [-3, this.y]]);
      parts.push(this.attestation.aaguid, len, this.credentialId, cbor(cose));
    }
    return Buffer.concat(parts);
  }

  create(challenge: string, origin: string) {
    this.ceremonies.push({ kind: "create", at: Date.now() });
    if (this.cancelNext) { this.cancelNext = false; throw new Error("NotAllowedError"); }
    const clientData = Buffer.from(JSON.stringify({ type: "webauthn.create", challenge, origin, crossOrigin: false }));
    const authData = this.authData(true);
    const sig = sign("sha256", Buffer.concat([authData, sha256(clientData)]), this.attestation.key);
    const att = new Map<string, unknown>([["fmt", "packed"], ["attStmt", new Map<string, unknown>([["alg", -7], ["sig", sig], ["x5c", this.attestation.x5c]])], ["authData", authData]]);
    return { id: b64url(this.credentialId), clientDataJSON: b64url(clientData), attestationObject: b64url(cbor(att)), authenticatorData: b64url(authData) };
  }

  get(challenge: string, origin: string) {
    this.ceremonies.push({ kind: "get", at: Date.now() });
    if (this.cancelNext) { this.cancelNext = false; throw new Error("NotAllowedError"); }
    const clientData = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge, origin, crossOrigin: false }));
    const authData = this.authData(false);
    const signature = sign("sha256", Buffer.concat([authData, sha256(clientData)]), this.key);
    return { id: b64url(this.credentialId), clientDataJSON: b64url(clientData), authenticatorData: b64url(authData), signature: b64url(signature) };
  }
}

/** Browser side of the shim. Runs before the app; plain ES2020 so every engine accepts it. */
const SHIM = `(() => {
  const toB64 = (buf) => { const a = new Uint8Array(buf); let s = ""; for (const c of a) s += String.fromCharCode(c); return btoa(s).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, ""); };
  const fromB64 = (s) => { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; const b = atob(s); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a.buffer; };
  const fail = () => { const e = new Error("The operation either timed out or was not allowed."); e.name = "NotAllowedError"; return e; };
  if (typeof window.PublicKeyCredential !== "function") { window.PublicKeyCredential = function PublicKeyCredential() {}; }
  window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = async () => true;
  window.PublicKeyCredential.isConditionalMediationAvailable = async () => false;
  const creds = navigator.credentials || {};
  if (!navigator.credentials) Object.defineProperty(navigator, "credentials", { value: creds });
  creds.create = async (opts) => {
    const pk = opts && opts.publicKey; if (!pk) throw fail();
    let r; try { r = await window.__crPasskey("create", toB64(pk.challenge), location.origin); } catch (e) { throw fail(); }
    return { id: r.id, rawId: fromB64(r.id), type: "public-key", authenticatorAttachment: "platform",
      getClientExtensionResults: () => ({}),
      response: { clientDataJSON: fromB64(r.clientDataJSON), attestationObject: fromB64(r.attestationObject),
        getTransports: () => ["internal"], getAuthenticatorData: () => fromB64(r.authenticatorData),
        getPublicKey: () => null, getPublicKeyAlgorithm: () => -7 } };
  };
  creds.get = async (opts) => {
    const pk = opts && opts.publicKey; if (!pk) throw fail();
    let r; try { r = await window.__crPasskey("get", toB64(pk.challenge), location.origin); } catch (e) { throw fail(); }
    return { id: r.id, rawId: fromB64(r.id), type: "public-key", authenticatorAttachment: "platform",
      getClientExtensionResults: () => ({}),
      response: { clientDataJSON: fromB64(r.clientDataJSON), authenticatorData: fromB64(r.authenticatorData), signature: fromB64(r.signature), userHandle: null } };
  };
})();`;

/** Installs the shim on every page of a context, answered by `key`. Call before the first navigation. */
export async function installPasskey(context: BrowserContext, key: SoftPasskey): Promise<void> {
  await context.exposeFunction("__crPasskey", (kind: "create" | "get", challenge: string, origin: string) =>
    kind === "create" ? key.create(challenge, origin) : key.get(challenge, origin));
  await context.addInitScript({ content: SHIM });
}

/** The same, for a single page in a context that has no shim yet. */
export async function installPasskeyOnPage(page: Page, key: SoftPasskey): Promise<void> {
  await page.exposeFunction("__crPasskey", (kind: "create" | "get", challenge: string, origin: string) =>
    kind === "create" ? key.create(challenge, origin) : key.get(challenge, origin));
  await page.addInitScript({ content: SHIM });
}
