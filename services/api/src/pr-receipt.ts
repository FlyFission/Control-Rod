import { createHash } from "node:crypto";
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
  subjectDigest?: string;
  kind?: "accept" | "accept-with-findings";
}

export interface PrReceiptProof {
  bundlePath: string;
  authenticated?: boolean;
  bundleDigest?: string;
  headSeq?: number;
  headDigest?: string;
  sealedBy?: string;
  sealedAt?: string;
  witnessed: false;
}

export interface PrReceiptInput {
  packageId: string;
  revision?: number;
  author: PrReceiptAuthor;
  checker?: PrReceiptChecker;
  acceptance?: PrReceiptAcceptance;
  unauthenticatedAcceptancePresent?: boolean;
  proof?: PrReceiptProof;
}

const PROVIDER_ALIASES: Record<string, string> = {
  anthropic: "claude",
  "claude-code": "claude",
  claude: "claude",
  openai: "codex",
  codex: "codex",
  xai: "grok",
  grok: "grok",
  google: "agy",
  antigravity: "agy",
  agy: "agy",
  fake: "fake",
};

/** Normalizes runtime aliases to canonical runtime IDs before vendor-family checks. */
export function normalizeProvider(provider: string): string {
  const key = provider.trim().toLowerCase();
  return PROVIDER_ALIASES[key] ?? key;
}

function sanitizeInline(s: string): string {
  return s.replace(/[\r\n]+/g, " ").replace(/[\x00-\x1f\x7f]/g, "").trim();
}

function sanitizeCode(s: string): string {
  return sanitizeInline(s).replaceAll("`", "'");
}

function sanitizeMarkdownText(s: string): string {
  return sanitizeInline(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("@", "@\u200b")
    .replaceAll("[", "\\[")
    .replaceAll("]", "\\]")
    .replaceAll("`", "'")
    .replaceAll("*", "\\*")
    .replaceAll("_", "\\_");
}

function shortDigest(hex: string): string {
  const clean = sanitizeCode(hex);
  return clean.length > 12 ? clean.slice(0, 12) : clean;
}

function formatRuntime(rt: { provider: string; model?: string; family?: string }): string {
  const normalized = normalizeProvider(rt.provider || "");
  const provider = sanitizeCode(normalized || rt.provider || "unknown");
  const family = sanitizeCode(rt.family ?? RUNTIME_FAMILIES[normalized] ?? "");
  const model = rt.model ? sanitizeCode(rt.model) : "";
  const details: string[] = [];
  if (family) details.push(`\`${family}\``);
  if (model) details.push(`model \`${model}\``);
  return details.length ? `\`${provider}\` (${details.join(", ")})` : `\`${provider}\``;
}

/** Formats a deterministic, sanitized Markdown PR receipt block. */
export function formatPrReceipt(input: PrReceiptInput): string {
  const lines: string[] = ["<!-- controlrod-pr-receipt:v1 -->", "### Control Rod receipt"];
  const isUnauthenticatedProof = input.proof && input.proof.authenticated !== true;
  if (isUnauthenticatedProof) {
    lines.push("> **UNAUTHENTICATED (unsealed bundle):** no passkey seal authenticates the events below.");
  }
  const rev = input.revision !== undefined ? ` (rev ${input.revision})` : "";
  lines.push(`- **Package:** \`${sanitizeCode(input.packageId)}\`${rev}`);
  lines.push(`- **Written by:** ${formatRuntime(input.author)}`);

  if (!input.checker) {
    lines.push("- **Checked blind by:** no pre-check recorded");
  } else {
    const c = input.checker;
    const countLabel = `${c.findingsCount} ${c.findingsCount === 1 ? "finding" : "findings"}`;
    const verdict = `**${sanitizeInline(c.outcome).toUpperCase()}** (${countLabel})`;
    const normAuthor = normalizeProvider(input.author.provider ?? "");
    const normChecker = normalizeProvider(c.provider ?? "");
    const canClaimBlind = c.independent && distinctFamily(normAuthor, normChecker);
    if (canClaimBlind) {
      lines.push(`- **Checked blind by:** ${formatRuntime(c)} — ${verdict}`);
    } else {
      const why = c.overrideReason
        ? `owner override: ${sanitizeMarkdownText(c.overrideReason)}`
        : "shared or unknown vendor family";
      lines.push(`- **Checked by:** ${formatRuntime(c)} (${why}) — ${verdict}`);
    }
  }

  if (input.acceptance && (!input.proof || input.proof.authenticated === true)) {
    const a = input.acceptance;
    const kind = a.kind === "accept-with-findings" ? "accept-with-findings" : "passkey decision";
    const meta = [
      a.decisionId ? `${kind} \`${sanitizeCode(a.decisionId)}\`` : kind,
      a.subjectDigest ? `subject \`sha256:${shortDigest(a.subjectDigest)}\`` : "",
      a.acceptedAt ? sanitizeInline(a.acceptedAt) : "",
    ]
      .filter(Boolean)
      .join(", ");
    lines.push(`- **Accepted by:** \`${sanitizeCode(a.acceptedBy)}\` (${meta})`);
  } else if (input.unauthenticatedAcceptancePresent || (input.acceptance && isUnauthenticatedProof)) {
    lines.push("- **Accepted by:** unauthenticated (bundle is unsealed; human acceptance cannot be verified)");
  } else {
    lines.push("- **Accepted by:** not yet accepted");
  }

  if (input.proof) {
    const p = input.proof;
    const sealText =
      p.authenticated && p.sealedBy
        ? `sealed by \`${sanitizeCode(p.sealedBy)}\`${p.headSeq !== undefined ? ` at entry ${p.headSeq}` : ""}`
        : "UNSEALED — nothing authenticates this bundle yet";
    const digests = [
      p.bundleDigest ? `bundle \`sha256:${shortDigest(p.bundleDigest)}\`` : "",
      p.headSeq !== undefined && p.headDigest ? `head #${p.headSeq} \`${shortDigest(p.headDigest)}\`` : "",
    ]
      .filter(Boolean)
      .join(", ");
    const digestPart = digests ? `${digests}; ` : "";
    lines.push(`- **Verify offline:** \`pnpm cr verify ${sanitizeCode(p.bundlePath)}\` (${digestPart}${sealText}; ${NOT_WITNESSED})`);
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

function readSubjectDigest(raw: unknown): string | undefined {
  if (typeof raw === "string" && /^[0-9a-f]{64}$/i.test(raw)) return raw;
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.value === "string" && /^[0-9a-f]{64}$/i.test(obj.value)) return obj.value;
  }
  return undefined;
}

function extractReceiptFromBundle(
  bundle: InclusionBundle,
  authenticated: boolean,
  bundlePath: string,
  bundleDigest: string,
): PrReceiptInput {
  const events: EventRecord[] = bundle.segment;
  const pkgId = bundle.package_id;

  let currentRevision: number | undefined;
  const authorByRound = new Map<number, string>();
  let latestAuthorInRevision: string | undefined;
  let preCheckRevision: number | undefined;
  let checker: PrReceiptChecker | undefined;
  let acceptance: PrReceiptAcceptance | undefined;
  let unauthenticatedAcceptancePresent = false;

  const resetForRevision = (nextRev: number) => {
    currentRevision = nextRev;
    authorByRound.clear();
    latestAuthorInRevision = undefined;
    preCheckRevision = undefined;
    checker = undefined;
    acceptance = undefined;
    unauthenticatedAcceptancePresent = false;
  };

  for (const e of events) {
    const data = (e.data ?? {}) as Record<string, unknown>;

    if (e.subject === pkgId && typeof data.revision === "number" && Number.isInteger(data.revision)) {
      if (currentRevision === undefined) currentRevision = data.revision;
      else if (data.revision > currentRevision) resetForRevision(data.revision);
      else if (data.revision < currentRevision) continue;
    }

    if ((e.type === "run.started" || e.type === "run.succeeded") && data.package === pkgId && data.role === "author") {
      if (typeof e.actor?.id === "string" && e.actor.id) {
        latestAuthorInRevision = e.actor.id;
        if (typeof data.round === "number") authorByRound.set(data.round, e.actor.id);
      }
    }

    if (e.type === "package.edited" && e.subject === pkgId) {
      acceptance = undefined;
      unauthenticatedAcceptancePresent = false;
    }

    if (e.type === "package.output" && e.subject === pkgId) {
      preCheckRevision = undefined;
      checker = undefined;
      acceptance = undefined;
      unauthenticatedAcceptancePresent = false;
    }

    if (e.type === "package.revising" && e.subject === pkgId) {
      acceptance = undefined;
      unauthenticatedAcceptancePresent = false;
    }

    if (e.type === "package.pre-checked" && e.subject === pkgId) {
      const rev = typeof data.revision === "number" ? data.revision : currentRevision;
      const round = typeof data.round === "number" ? data.round : undefined;
      if (rev !== undefined && currentRevision !== undefined && rev < currentRevision) continue;
      if (rev !== undefined) currentRevision = rev;
      preCheckRevision = rev;
      if (round !== undefined && authorByRound.has(round)) {
        latestAuthorInRevision = authorByRound.get(round);
      }
      const outcome =
        data.outcome === "pass" || data.outcome === "fail" || data.outcome === "inconclusive"
          ? data.outcome
          : "inconclusive";
      const findingsCount = typeof data.findings === "number" ? data.findings : 0;
      const shared = data.shared_runtime === true;
      checker = {
        provider: typeof e.actor?.id === "string" && e.actor.id ? e.actor.id : "unknown",
        outcome,
        findingsCount,
        independent: !shared,
        ...(shared && data.owner_override ? { overrideReason: "recorded owner override" } : {}),
      };
      acceptance = undefined;
      unauthenticatedAcceptancePresent = false;
    }

    if (e.type.startsWith("decision.") && e.subject === pkgId) {
      const rev = typeof data.revision === "number" ? data.revision : currentRevision;
      if (rev !== undefined && currentRevision !== undefined && rev !== currentRevision) continue;

      if (e.type === "decision.return" || e.type === "decision.reject" || e.type === "decision.revoke") {
        acceptance = undefined;
        unauthenticatedAcceptancePresent = false;
        if (e.type === "decision.return" && rev !== undefined) {
          resetForRevision(rev + 1);
        }
        continue;
      }

      if (e.type === "decision.accept" || e.type === "decision.accept-with-findings") {
        const isHuman = e.actor?.kind === "human" && typeof e.actor.id === "string" && e.actor.id.length > 0;
        const decisionId = typeof data.decision === "string" && data.decision.length > 0 ? data.decision : undefined;
        const subjectDigest = readSubjectDigest(data.subject_digest);
        const matchesPreCheckRev =
          preCheckRevision === undefined || (rev !== undefined && rev === preCheckRevision);
        if (!isHuman || !decisionId || !subjectDigest || !matchesPreCheckRev) {
          continue;
        }
        if (!authenticated) {
          unauthenticatedAcceptancePresent = true;
          acceptance = undefined;
          continue;
        }
        acceptance = {
          acceptedBy: e.actor.id,
          decisionId,
          acceptedAt: e.at,
          subjectDigest,
          kind: e.type === "decision.accept-with-findings" ? "accept-with-findings" : "accept",
        };
      }
    }
  }

  const tail = events.at(-1);
  return {
    packageId: pkgId,
    ...(currentRevision !== undefined ? { revision: currentRevision } : {}),
    author: { provider: latestAuthorInRevision ?? "unknown" },
    ...(checker ? { checker } : {}),
    ...(acceptance ? { acceptance } : {}),
    ...(unauthenticatedAcceptancePresent ? { unauthenticatedAcceptancePresent: true } : {}),
    proof: {
      bundlePath,
      authenticated,
      bundleDigest,
      ...(tail ? { headSeq: tail.seq, headDigest: tail.digest.value } : {}),
      ...(authenticated && bundle.seal
        ? {
            sealedBy: String(bundle.seal.id ?? ""),
            sealedAt: String(bundle.seal.payload?.sealed_at ?? ""),
            headSeq: Number(bundle.seal.payload?.head_seq ?? tail?.seq ?? 0),
          }
        : {}),
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
  const bundleDigest = createHash("sha256").update(text, "utf8").digest("hex");
  const input = extractReceiptFromBundle(bundle, check.authenticated, bundlePath, bundleDigest);
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
