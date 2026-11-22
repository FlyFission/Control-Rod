import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventRecord } from "./events.js";
import { RUNTIME_FAMILIES, distinctFamily } from "./runtimes.js";
import { type InclusionBundle, NOT_WITNESSED, verifyInclusion } from "./seals.js";

/**
 * PR receipt formatter and offline inclusion-proof-to-receipt generator (R1.8).
 * Every PR Control Rod opens carries a concise, honest summary of who authored it,
 * who checked it blind, who accepted it, and how to verify it offline with `pnpm cr verify`.
 */

export interface PrReceiptAuthor {
  provider: string;
  model?: string;
  family?: string;
}

export interface PrReceiptChecker {
  provider: string;
  model?: string;
  family?: string;
  outcome: "pass" | "fail" | "inconclusive";
  findingsCount: number;
  independent: boolean;
  overrideReason?: string;
}

export interface PrReceiptAcceptance {
  acceptedBy: string;
  decisionId?: string;
  acceptedAt?: string;
  kind?: "accept" | "accept-with-findings";
}

export interface PrReceiptProof {
  bundlePath: string;
  sealedBy?: string;
  sealedAt?: string;
  headSeq?: number;
  witnessed: false;
}

export interface PrReceiptInput {
  packageId: string;
  revision?: number;
  author: PrReceiptAuthor;
  checker?: PrReceiptChecker;
  acceptance?: PrReceiptAcceptance;
  proof?: PrReceiptProof;
}

function sanitizeInline(s: string): string {
  return s.replace(/[\r\n]+/g, " ").replace(/[\x00-\x1f\x7f]/g, "").trim();
}

function sanitizeCode(s: string): string {
  return sanitizeInline(s).replaceAll("`", "'");
}

function formatRuntime(rt: { provider: string; model?: string; family?: string }): string {
  const provider = sanitizeCode(rt.provider || "unknown");
  const family = sanitizeCode(rt.family ?? RUNTIME_FAMILIES[rt.provider.trim().toLowerCase()] ?? "");
  const model = rt.model ? sanitizeCode(rt.model) : "";
  const details: string[] = [];
  if (family) details.push(`\`${family}\``);
  if (model) details.push(`model \`${model}\``);
  return details.length ? `\`${provider}\` (${details.join(", ")})` : `\`${provider}\``;
}

/** Formats a deterministic, sanitized Markdown PR receipt block. */
export function formatPrReceipt(input: PrReceiptInput): string {
  const lines: string[] = ["<!-- controlrod-pr-receipt:v1 -->", "### Control Rod receipt"];
  const rev = input.revision !== undefined ? ` (rev ${input.revision})` : "";
  lines.push(`- **Package:** \`${sanitizeCode(input.packageId)}\`${rev}`);
  lines.push(`- **Written by:** ${formatRuntime(input.author)}`);

  if (!input.checker) {
    lines.push("- **Checked blind by:** no pre-check recorded");
  } else {
    const c = input.checker;
    const countLabel = `${c.findingsCount} ${c.findingsCount === 1 ? "finding" : "findings"}`;
    const verdict = `**${sanitizeInline(c.outcome).toUpperCase()}** (${countLabel})`;
    const canClaimBlind =
      c.independent &&
      (input.author.provider && c.provider && RUNTIME_FAMILIES[input.author.provider] && RUNTIME_FAMILIES[c.provider]
        ? distinctFamily(input.author.provider, c.provider)
        : true);
    if (canClaimBlind) {
      lines.push(`- **Checked blind by:** ${formatRuntime(c)} — ${verdict}`);
    } else {
      const why = c.overrideReason ? `owner override: ${sanitizeInline(c.overrideReason)}` : "shared or unknown vendor family";
      lines.push(`- **Checked by:** ${formatRuntime(c)} (${why}) — ${verdict}`);
    }
  }

  if (input.acceptance) {
    const a = input.acceptance;
    const kind = a.kind === "accept-with-findings" ? "accept-with-findings" : "passkey decision";
    const meta = [a.decisionId ? `${kind} \`${sanitizeCode(a.decisionId)}\`` : kind, a.acceptedAt ? sanitizeInline(a.acceptedAt) : ""]
      .filter(Boolean)
      .join(", ");
    lines.push(`- **Accepted by:** \`${sanitizeCode(a.acceptedBy)}\` (${meta})`);
  } else {
    lines.push("- **Accepted by:** not yet accepted");
  }

  if (input.proof) {
    const p = input.proof;
    const sealText = p.sealedBy
      ? `sealed by \`${sanitizeCode(p.sealedBy)}\`${p.headSeq !== undefined ? ` at entry ${p.headSeq}` : ""}`
      : "unsealed — nothing authenticates this bundle yet";
    lines.push(`- **Verify offline:** \`pnpm cr verify ${sanitizeCode(p.bundlePath)}\` (${sealText}; ${NOT_WITNESSED})`);
  } else {
    lines.push("- **Verify offline:** no inclusion proof attached");
  }

  return lines.join("\n") + "\n";
}

function asInclusionBundle(parsed: unknown): InclusionBundle | null {
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const candidate = "bundle" in obj && !("segment" in obj) ? obj.bundle : obj;
  if (!candidate || typeof candidate !== "object") return null;
  const b = candidate as Record<string, unknown>;
  if (typeof b.package_id !== "string" || !Array.isArray(b.segment)) return null;
  return b as unknown as InclusionBundle;
}

function extractReceiptFromBundle(bundle: InclusionBundle, authenticated: boolean, bundlePath: string): PrReceiptInput {
  const events: EventRecord[] = bundle.segment;
  const pkgId = bundle.package_id;

  let authorProvider = "unknown";
  let revision: number | undefined;
  let checker: PrReceiptChecker | undefined;
  let acceptance: PrReceiptAcceptance | undefined;

  for (const e of events) {
    const data = e.data ?? {};
    if ((e.type === "run.started" || e.type === "run.succeeded") && data.package === pkgId && data.role === "author") {
      if (typeof e.actor?.id === "string" && e.actor.id) authorProvider = e.actor.id;
    }
    if (e.type === "package.pre-checked" && e.subject === pkgId) {
      if (typeof data.revision === "number") revision = data.revision;
      const outcome = data.outcome === "pass" || data.outcome === "fail" || data.outcome === "inconclusive" ? data.outcome : "inconclusive";
      const findingsCount = typeof data.findings === "number" ? data.findings : 0;
      const shared = data.shared_runtime === true;
      checker = {
        provider: typeof e.actor?.id === "string" && e.actor.id ? e.actor.id : "unknown",
        outcome,
        findingsCount,
        independent: !shared,
        ...(shared && data.owner_override ? { overrideReason: "recorded owner override" } : {}),
      };
    }
    if ((e.type === "decision.accept" || e.type === "decision.accept-with-findings") && e.subject === pkgId) {
      if (typeof data.revision === "number") revision = data.revision;
      acceptance = {
        acceptedBy: typeof e.actor?.id === "string" && e.actor.id ? e.actor.id : "unknown",
        ...(typeof data.decision === "string" ? { decisionId: data.decision } : {}),
        acceptedAt: e.at,
        kind: e.type === "decision.accept-with-findings" ? "accept-with-findings" : "accept",
      };
    }
  }

  return {
    packageId: pkgId,
    ...(revision !== undefined ? { revision } : {}),
    author: { provider: authorProvider },
    ...(checker ? { checker } : {}),
    ...(acceptance ? { acceptance } : {}),
    proof: {
      bundlePath,
      ...(authenticated && bundle.seal ? { sealedBy: String(bundle.seal.id ?? ""), sealedAt: String(bundle.seal.payload?.sealed_at ?? ""), headSeq: Number(bundle.seal.payload?.head_seq ?? 0) } : {}),
      witnessed: false,
    },
  };
}

/**
 * Verifies an inclusion proof bundle with `verifyInclusion` and formats a PR
 * receipt from its chain events. Fails closed on invalid or tampered bundles.
 */
export async function prReceiptFromBundleText(
  text: string,
  bundlePath = "inclusion-proof.json",
): Promise<{ code: 0 | 1 | 2; markdown?: string; lines: string[] }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { code: 2, lines: ["This file is not JSON, so it is not an inclusion proof."] };
  }
  const bundle = asInclusionBundle(parsed);
  if (!bundle) {
    return { code: 2, lines: ["This file is not a package inclusion proof (missing segment or package_id)."] };
  }
  const check = await verifyInclusion(bundle);
  if (!check.ok) {
    return { code: 1, lines: [`FAIL  ${bundle.package_id}: ${check.problem ?? "the proof does not hold"}.`] };
  }
  const input = extractReceiptFromBundle(bundle, check.authenticated, bundlePath);
  const markdown = formatPrReceipt(input);
  return { code: 0, markdown, lines: [markdown.trimEnd()] };
}

async function main(argv: string[]) {
  const file = argv.find((a) => !a.startsWith("-"));
  if (!file) {
    console.error("Usage: pnpm cr receipt <inclusion-proof.json>");
    return 2;
  }
  let text: string;
  try {
    text = readFileSync(resolve(file), "utf8");
  } catch {
    console.error(`FAIL  ${file}: cannot read the file.`);
    return 2;
  }
  const res = await prReceiptFromBundleText(text, file);
  for (const l of res.lines) console.log(l);
  return res.code;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
