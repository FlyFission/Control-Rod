import { createHash, X509Certificate } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { convertCertBufferToPEM, decodeAttestationObject, isoBase64URL, validateCertificatePath } from "@simplewebauthn/server/helpers";

/**
 * Attested credential enrollment (workbench specification 11.1 G-5; plan task 1.12;
 * docs/sqa/authenticators.md). Registration asks every authenticator for its attestation. A
 * credential counts as attested only when its statement carries a certificate chain that verifies
 * against a trust anchor the owner placed in `<CONTROLROD_HOME>/trust-anchors/` (PEM files). With no
 * anchors, nothing is verified and no credential is eligible for the hardware key floor: the check
 * fails closed, and the refusal says why.
 *
 * Chain validation runs here rather than in the WebAuthn library's global settings, so a passkey
 * from an unlisted authenticator still registers and signs everything the floor does not cover.
 */

/** Statement formats whose certificate chain can identify a hardware authenticator class. */
const CHAINED_FORMATS = new Set(["packed", "tpm", "fido-u2f"]);

/** Trust anchors from a directory of PEM files; a missing directory means none. */
export function loadTrustAnchors(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const f of readdirSync(dir).sort()) {
    if (!f.endsWith(".pem")) continue;
    const text = readFileSync(join(dir, f), "utf8");
    for (const m of text.matchAll(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g)) out.push(`${m[0]}\n`);
  }
  return out;
}

/**
 * Whether a verified registration's attestation chains to a retained trust anchor, and which one
 * (SHA-256 of its DER). `attestationObject` is the base64url value from the registration response.
 */
export async function attestationAnchored(fmt: string, attestationObject: string, anchors: string[]): Promise<{ verified: boolean; anchor?: string }> {
  if (!CHAINED_FORMATS.has(fmt) || anchors.length === 0) return { verified: false };
  const stmt = decodeAttestationObject(isoBase64URL.toBuffer(attestationObject)).get("attStmt");
  const x5c = stmt.get("x5c");
  if (!Array.isArray(x5c) || x5c.length === 0) return { verified: false }; // self attestation identifies no class
  const chain = x5c.map((c: Uint8Array) => convertCertBufferToPEM(new Uint8Array(c)));
  // One anchor at a time, so the record can name the anchor that vouched for the key.
  for (const anchor of anchors) {
    try {
      if (await validateCertificatePath(chain, [anchor]))
        return { verified: true, anchor: createHash("sha256").update(new X509Certificate(anchor).raw).digest("hex") };
    } catch {
      // Not this anchor; try the next.
    }
  }
  return { verified: false };
}
