import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type InclusionBundle, NOT_WITNESSED, verifyInclusion } from "./seals.js";

/**
 * Offline check of a downloaded inclusion proof (`pnpm cr verify <file>`), for an auditor who holds
 * only the file. It reads no database and calls no server: every digest, link, the seal and its
 * passkey signature are recomputed from the bundle by `verifyInclusion`, the same function the control
 * plane uses. It accepts the bundle the Records page downloads, or the whole `GET /packages/:id/proof`
 * response, which carries the bundle under `bundle`.
 *
 * What it cannot settle, and says so: that the key in the bundle belongs to the person named as the
 * signer (confirm that outside the bundle), and that nothing after the seal was cut, because nothing
 * outside the installation witnesses the chain yet.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- the file is untrusted JSON */
type Json = any;

export interface BundleReport {
  /** 0 when the proof holds, 1 when it does not, 2 when the file is not a bundle at all. */
  code: 0 | 1 | 2;
  lines: string[];
}

function asBundle(parsed: Json): InclusionBundle | null {
  const b = parsed && typeof parsed === "object" && "bundle" in parsed && !("segment" in parsed) ? parsed.bundle : parsed;
  if (!b || typeof b !== "object" || typeof b.package_id !== "string" || !Array.isArray(b.segment)) return null;
  return b as InclusionBundle;
}

/** Checks the text of a bundle file and says what it shows, in plain words. */
export async function verifyBundleText(text: string): Promise<BundleReport> {
  let parsed: Json;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { code: 2, lines: ["This file is not JSON, so it is not an inclusion proof."] };
  }
  const b = asBundle(parsed);
  if (!b) return { code: 2, lines: ["This file is not an inclusion proof: it has no package_id and segment."] };
  let check: Awaited<ReturnType<typeof verifyInclusion>>;
  try {
    check = await verifyInclusion(b);
  } catch (e) {
    return { code: 1, lines: [`FAIL  ${b.package_id}: the bundle could not be checked (${e instanceof Error ? e.message : String(e)}).`] };
  }
  if (!check.ok) return { code: 1, lines: [`FAIL  ${b.package_id}: ${check.problem ?? "the proof does not hold"}.`] };
  const n = check.events.length;
  const lines = [
    `OK    ${b.package_id}: ${n} ${n === 1 ? "entry" : "entries"} (${check.events.join(", ")}) ${n === 1 ? "recomputes and links" : "recompute and link"} through the chain from entry 1 to entry ${b.segment.at(-1)!.seq}.`,
  ];
  if (check.authenticated) {
    const s = b.seal.payload;
    lines.push(
      `      Sealed by seal ${b.seal.id} at entry ${s.head_seq} on ${s.sealed_at} (${s.purpose}); its passkey signature checks against the key in the bundle.`,
      `      Still to confirm outside this file: that the key belongs to signer ${s.signer_id}.`,
    );
  } else {
    lines.push("      No seal covers these entries, so nothing in the bundle authenticates them: the chain head it ends at is only stated.");
  }
  lines.push(`      ${NOT_WITNESSED}: nothing outside this installation shows that later entries were not cut.`);
  return { code: 0, lines };
}

async function main(argv: string[]) {
  const files = argv.filter((a) => !a.startsWith("-"));
  if (!files.length) {
    console.error("Usage: pnpm cr verify <inclusion-proof.json> [more.json ...]");
    return 2;
  }
  let worst = 0;
  for (const f of files) {
    let text: string;
    try {
      text = readFileSync(resolve(f), "utf8");
    } catch {
      console.log(`FAIL  ${f}: cannot read the file.`);
      worst = Math.max(worst, 2);
      continue;
    }
    const r = await verifyBundleText(text);
    for (const l of r.lines) console.log(l);
    worst = Math.max(worst, r.code);
  }
  return worst;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
