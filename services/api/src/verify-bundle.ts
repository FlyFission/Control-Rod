import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkBundleReceiptBinding, type ReceiptBindingExpectation } from "./pr-receipt.js";
import { type InclusionBundle, NOT_WITNESSED, type WindowBundle, verifyInclusion, verifyWindow } from "./seals.js";
import { evidenceRecordDir, isEvidenceRecordArg, verifyEvidenceRecord } from "./verify-evidence.js";

/**
 * Offline check of a downloaded inclusion proof or audit export (`pnpm cr verify <file>`), for an
 * auditor who holds only the file. It reads no database and calls no server: every digest, link, the seal and its
 * passkey signature are recomputed from the bundle by `verifyInclusion`, the same function the control
 * plane uses (`verifyWindow` for an export). It accepts the bundle the Records page downloads, or the
 * whole `GET /packages/:id/proof` or `GET /records/export` response, which carries it under `bundle`.
 *
 * When `--receipt`, `--diff-sha256`, `--head-sha`, or `--revision` are supplied, it also verifies that
 * an active, authenticated human acceptance in the bundle actually covers that PR revision and diff.
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

export type VerifyBundleOptions = ReceiptBindingExpectation;

type Bundle = { kind: "package"; b: InclusionBundle } | { kind: "window"; b: WindowBundle };

function asBundle(parsed: Json): Bundle | null {
  const b = parsed && typeof parsed === "object" && "bundle" in parsed && !("segment" in parsed) ? parsed.bundle : parsed;
  if (!b || typeof b !== "object" || !Array.isArray(b.segment)) return null;
  if (typeof b.package_id === "string") return { kind: "package", b: b as InclusionBundle };
  if (b.window && typeof b.window === "object") return { kind: "window", b: b as WindowBundle };
  return null;
}

/** Checks the text of a bundle file and says what it shows, in plain words. */
export async function verifyBundleText(text: string, opts?: VerifyBundleOptions): Promise<BundleReport> {
  let parsed: Json;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { code: 2, lines: ["This file is not JSON, so it is not an inclusion proof."] };
  }
  const found = asBundle(parsed);
  if (!found) return { code: 2, lines: ["This file is not an inclusion proof or an audit export: it has no segment with a package_id or a window."] };
  const b = found.b;
  const name = found.kind === "package" ? found.b.package_id : `window ${found.b.window.from} to ${found.b.window.to}`;
  let check: Awaited<ReturnType<typeof verifyInclusion>>;
  try {
    check = found.kind === "package" ? await verifyInclusion(found.b) : await verifyWindow(found.b);
  } catch (e) {
    return { code: 1, lines: [`FAIL  ${name}: the bundle could not be checked (${e instanceof Error ? e.message : String(e)}).`] };
  }
  if (!check.ok) return { code: 1, lines: [`FAIL  ${name}: ${check.problem ?? "the proof does not hold"}.`] };

  let bindingLine: string | undefined;
  const hasBindingOpts =
    opts &&
    (opts.receiptText !== undefined ||
      opts.expectedRevision !== undefined ||
      opts.expectedDiffSha256 !== undefined ||
      opts.expectedHeadSha !== undefined);
  if (hasBindingOpts) {
    if (found.kind !== "package") {
      return { code: 1, lines: [`FAIL  ${name}: a time-window audit export cannot prove acceptance of a PR revision or diff.`] };
    }
    const link = checkBundleReceiptBinding(found.b, check.authenticated, { ...opts, bundleDigest: createHash("sha256").update(text, "utf8").digest("hex") });
    if (link.problem) {
      return { code: 1, lines: [`FAIL  ${name}: ${link.problem}.`] };
    }
    bindingLine = link.summary;
  }

  const n = check.events.length;
  const lines = [
    `OK    ${name}: ${n} ${n === 1 ? "entry" : "entries"} (${check.events.join(", ")}) ${n === 1 ? "recomputes and links" : "recompute and link"} through the chain from entry 1 to entry ${b.segment.at(-1)!.seq}.`,
  ];
  if (bindingLine) lines.push(`      ${bindingLine}`);
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

export function parseVerifyCliArgs(argv: string[]): { files: string[]; opts: VerifyBundleOptions; error?: string } {
  const files: string[] = [];
  const opts: VerifyBundleOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--receipt") {
      const p = argv[++i];
      if (!p) return { files, opts, error: "--receipt requires a file path" };
      try {
        opts.receiptText = readFileSync(resolve(p), "utf8");
      } catch {
        return { files, opts, error: `cannot read receipt file ${p}` };
      }
      continue;
    }
    if (a === "--diff-sha256") {
      const val = argv[++i]?.trim();
      if (!val || !/^[0-9a-f]{64}$/i.test(val)) return { files, opts, error: "--diff-sha256 requires a 64-hex SHA-256 digest" };
      opts.expectedDiffSha256 = val.toLowerCase();
      continue;
    }
    if (a === "--head-sha") {
      const val = argv[++i]?.trim();
      if (!val || !/^[0-9a-f]{7,64}$/i.test(val)) return { files, opts, error: "--head-sha requires a commit SHA" };
      opts.expectedHeadSha = val.toLowerCase();
      continue;
    }
    if (a === "--revision") {
      const val = argv[++i]?.trim();
      const num = Number(val);
      if (!val || !Number.isInteger(num) || num < 0) return { files, opts, error: "--revision requires a non-negative integer" };
      opts.expectedRevision = num;
      continue;
    }
    if (a.startsWith("-")) {
      return { files, opts, error: `unknown option ${a}` };
    }
    files.push(a);
  }
  return { files, opts };
}

async function main(argv: string[]) {
  const { files, opts, error } = parseVerifyCliArgs(argv);
  if (error) {
    console.error(`FAIL  ${error}`);
    return 2;
  }
  if (!files.length) {
    console.error("Usage: pnpm cr verify [--receipt <receipt-or-verdict>] [--diff-sha256 <sha256>] [--head-sha <sha>] [--revision <n>] <inclusion-proof-or-audit-export.json | change-record-dir> [more ...]");
    return 2;
  }
  let worst = 0;
  const storeRoot = process.env.CONTROLROD_EVIDENCE_STORE;
  for (const f of files) {
    if (isEvidenceRecordArg(f)) {
      const evidence = verifyEvidenceRecord(evidenceRecordDir(f), storeRoot);
      for (const l of evidence.lines) console.log(l);
      worst = Math.max(worst, evidence.code);
      continue;
    }
    let text: string;
    try {
      text = readFileSync(resolve(f), "utf8");
    } catch {
      console.log(`FAIL  ${f}: cannot read the file.`);
      worst = Math.max(worst, 2);
      continue;
    }
    const r = await verifyBundleText(text, opts);
    for (const l of r.lines) console.log(l);
    worst = Math.max(worst, r.code);
  }
  return worst;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
