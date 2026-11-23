import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventRecord } from "./events.js";
import { RUNTIME_FAMILIES, distinctFamily } from "./runtimes.js";
import { type InclusionBundle, NOT_WITNESSED, keyDigest, verifyInclusion } from "./seals.js";

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
  /** True only when the control plane itself verified the WebAuthn assertion for this decision. */
  passkeyVerified?: boolean;
  /** Distinguishes an external trust-anchored seal from a self-supplied bundle key. */
  sealTrust?: "trusted-key" | "bundle-key-only";
  /** Signer ID named on the covering seal when derived from a bundle. */
  sealedBySigner?: string;
}

export interface PrReceiptProof {
  bundlePath: string;
  authenticated?: boolean;
  sealKeyTrusted?: boolean;
  bundleDigest?: string;
  headSeq?: number;
  headDigest?: string;
  /** Single accepted diff digest when the bundle records exactly one; used for the receipt binding marker. */
  diffSha256?: string;
  /** Single recorded head commit when the bundle records exactly one. */
  headSha?: string;
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

export interface BundleReceiptOptions {
  /**
   * External trust anchors supplied outside the bundle: maps `signer_id` to
   * the expected hex SHA-256 `keyDigest(public_key)` of that person's enrolled key.
   */
  trustedSealKeys?: ReadonlyMap<string, string>;
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

const ROLE_PREFIXES = ["author-", "checker-", "intake-", "cli-checker-"];

/**
 * Normalizes control-plane baseline actor IDs (`author-claude`, `checker-codex`)
 * and runtime aliases (`anthropic`, `openai`) to canonical runtime IDs.
 */
export function normalizeProvider(provider: string): string {
  let key = provider.trim().toLowerCase();
  for (const prefix of ROLE_PREFIXES) {
    if (key.startsWith(prefix)) {
      key = key.slice(prefix.length);
      break;
    }
  }
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
  const isUntrustedSealKey = input.proof && input.proof.authenticated === true && input.proof.sealKeyTrusted !== true;
  if (isUnauthenticatedProof) {
    lines.push("> **UNAUTHENTICATED (unsealed bundle):** no passkey seal authenticates the events below.");
  } else if (isUntrustedSealKey) {
    lines.push("> **UNVERIFIED SEAL KEY:** seal signature checks only against a public key supplied inside the bundle; key ownership and per-decision passkey assertions are not verified here.");
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
    if (a.passkeyVerified) {
      const meta = [
        a.decisionId ? `${kind} \`${sanitizeCode(a.decisionId)}\`` : kind,
        a.subjectDigest ? `subject \`sha256:${shortDigest(a.subjectDigest)}\`` : "",
        a.acceptedAt ? sanitizeInline(a.acceptedAt) : "",
      ]
        .filter(Boolean)
        .join(", ");
      lines.push(`- **Accepted by:** \`${sanitizeCode(a.acceptedBy)}\` (${meta})`);
    } else if (a.sealTrust === "trusted-key") {
      const meta = [
        a.decisionId ? `decision \`${sanitizeCode(a.decisionId)}\`` : "",
        a.subjectDigest ? `subject \`sha256:${shortDigest(a.subjectDigest)}\`` : "",
        a.sealedBySigner ? `under trusted seal of \`${sanitizeCode(a.sealedBySigner)}\`` : "under trusted seal",
        "per-decision WebAuthn assertion not in bundle",
      ]
        .filter(Boolean)
        .join(", ");
      lines.push(`- **Accepted by:** recorded \`${sanitizeCode(a.acceptedBy)}\` (${meta})`);
    } else {
      const meta = [
        a.decisionId ? `decision \`${sanitizeCode(a.decisionId)}\`` : "",
        a.subjectDigest ? `subject \`sha256:${shortDigest(a.subjectDigest)}\`` : "",
        "bundle-key sealed only; seal key ownership and passkey assertion not verified from bundle",
      ]
        .filter(Boolean)
        .join(", ");
      lines.push(`- **Accepted by:** unverified claim naming \`${sanitizeCode(a.acceptedBy)}\` (${meta})`);
    }
  } else if (input.unauthenticatedAcceptancePresent || (input.acceptance && isUnauthenticatedProof)) {
    lines.push("- **Accepted by:** unauthenticated (bundle is unsealed; human acceptance cannot be verified)");
  } else {
    lines.push("- **Accepted by:** not yet accepted");
  }

  if (input.proof) {
    const p = input.proof;
    const sealText =
      p.authenticated && p.sealedBy
        ? `sealed by \`${sanitizeCode(p.sealedBy)}\`${p.headSeq !== undefined ? ` at entry ${p.headSeq}` : ""} (${p.sealKeyTrusted ? "trusted key" : "bundle key, ownership unconfirmed"})`
        : "UNSEALED — nothing authenticates this bundle yet";
    const digests = [
      p.bundleDigest ? `bundle \`sha256:${shortDigest(p.bundleDigest)}\`` : "",
      p.headSeq !== undefined && p.headDigest ? `head #${p.headSeq} \`${shortDigest(p.headDigest)}\`` : "",
    ]
      .filter(Boolean)
      .join(", ");
    const digestPart = digests ? `${digests}; ` : "";
    if (p.authenticated && input.acceptance && p.diffSha256 && /^[0-9a-f]{64}$/i.test(p.diffSha256)) {
      const binding = JSON.stringify({
        package_id: input.packageId,
        ...(input.revision !== undefined ? { revision: input.revision } : {}),
        ...(p.headSha ? { head_sha: p.headSha } : {}),
        diff_sha256: p.diffSha256.toLowerCase(),
      })
        .replaceAll("<", "\\u003c")
        .replaceAll(">", "\\u003e");
      lines.splice(1, 0, `<!-- controlrod-check-binding: ${binding} -->`);
      lines.push(`- **Verify offline:** save this receipt as \`pr-receipt.md\`, then \`pnpm cr verify --receipt pr-receipt.md ${sanitizeCode(p.bundlePath)}\` (checks this receipt's package, revision and diff against the bundle; ${digestPart}${sealText}; ${NOT_WITNESSED})`);
    } else {
      const noDiff = p.authenticated && input.acceptance && !p.diffSha256 ? "no single patch digest recorded, so no diff binding; " : "";
      lines.push(`- **Verify offline:** \`pnpm cr verify ${sanitizeCode(p.bundlePath)}\` (${noDiff}${digestPart}${sealText}; ${NOT_WITNESSED})`);
    }
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

function isSealKeyTrusted(bundle: InclusionBundle, authenticated: boolean, opts?: BundleReceiptOptions): boolean {
  if (!authenticated || !bundle.seal || !bundle.seal_evidence?.public_key || !opts?.trustedSealKeys) {
    return false;
  }
  const signerId = String(bundle.seal.payload?.signer_id ?? "");
  if (!signerId) return false;
  const expectedDigest = opts.trustedSealKeys.get(signerId);
  if (!expectedDigest) return false;
  const actualDigest = keyDigest(Buffer.from(bundle.seal_evidence.public_key, "base64url"));
  return expectedDigest.trim().toLowerCase() === actualDigest.toLowerCase();
}

export interface ReceiptBindingExpectation {
  packageId?: string | undefined;
  expectedRevision?: number | undefined;
  expectedDiffSha256?: string | undefined;
  expectedHeadSha?: string | undefined;
  receiptText?: string | undefined;
  /** External trust anchors; they change how the accepted-by line is rendered, so receipt claims are compared under them. */
  trustedSealKeys?: ReadonlyMap<string, string> | undefined;
}

export interface BundleInspection {
  input: PrReceiptInput;
  currentRevision?: number | undefined;
  preCheckRevision?: number | undefined;
  authorOutputDigests: string[];
  recordedHeadShas: string[];
}

function addHexDigest(target: Set<string>, raw: unknown) {
  const hex = readSubjectDigest(raw);
  if (hex) target.add(hex.toLowerCase());
}

/** Author outputs are the PR diff only when the recorded name is a patch (`*.patch` or `*.diff`). */
const PATCH_NAME = /\.(?:patch|diff)$/i;

function collectOutputsAndRefs(
  data: Record<string, unknown>,
  digests: Set<string>,
  headShas: Set<string>,
) {
  addHexDigest(digests, data.diff_sha256);
  if (Array.isArray(data.outputs)) {
    for (const o of data.outputs) {
      if (o && typeof o === "object") {
        const rec = o as Record<string, unknown>;
        // Only a patch counts as the diff; any other output digest is not a diff binding.
        if (typeof rec.name === "string" && PATCH_NAME.test(rec.name)) addHexDigest(digests, rec.sha256 ?? rec.digest);
      }
    }
  }
  for (const key of ["head_sha", "commit_sha"] as const) {
    const val = data[key];
    if (typeof val === "string" && /^[0-9a-f]{7,64}$/i.test(val.trim())) {
      headShas.add(val.trim().toLowerCase());
    }
  }
}

export function extractBundleInspection(
  bundle: InclusionBundle,
  authenticated: boolean,
  sealKeyTrusted: boolean,
  bundlePath: string,
  bundleDigest: string,
): BundleInspection {
  const events: EventRecord[] = bundle.segment;
  const pkgId = bundle.package_id;

  let currentRevision: number | undefined;
  const authorByRound = new Map<number, string>();
  const authorOutputsByRound = new Map<number, Set<string>>();
  let latestOutputs = new Set<string>();
  const recordedHeadShas = new Set<string>();
  let latestAuthorOutput: string | undefined;
  let preCheckRevision: number | undefined;
  let checker: PrReceiptChecker | undefined;
  let acceptance: PrReceiptAcceptance | undefined;
  let unauthenticatedAcceptancePresent = false;

  const resetForRevision = (nextRev: number) => {
    currentRevision = nextRev;
    authorByRound.clear();
    authorOutputsByRound.clear();
    latestOutputs = new Set<string>();
    recordedHeadShas.clear();
    latestAuthorOutput = undefined;
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

    if (e.subject === pkgId && (e.type === "package.created" || e.type === "package.drafted")) {
      collectOutputsAndRefs(data, latestOutputs, recordedHeadShas);
    }

    // Only credit authorship from succeeded author runs with outputs or package.output, never run.started.
    if (e.type === "run.succeeded" && data.package === pkgId && data.role === "author") {
      const hasOutputs = !Array.isArray(data.outputs) || data.outputs.length > 0;
      if (hasOutputs && typeof e.actor?.id === "string" && e.actor.id) {
        latestAuthorOutput = e.actor.id;
        const roundDigests = new Set<string>();
        collectOutputsAndRefs(data, roundDigests, recordedHeadShas);
        if (roundDigests.size > 0) latestOutputs = new Set(roundDigests);
        if (typeof data.round === "number") {
          authorByRound.set(data.round, e.actor.id);
          authorOutputsByRound.set(data.round, roundDigests);
        }
      }
    }

    if ((e.type === "run.failed" || e.type === "run.stopped" || e.type === "run.lost") && data.package === pkgId && data.role === "author") {
      if (typeof data.round === "number") {
        authorByRound.delete(data.round);
        authorOutputsByRound.delete(data.round);
      }
    }

    if (e.type === "package.edited" && e.subject === pkgId) {
      acceptance = undefined;
      unauthenticatedAcceptancePresent = false;
    }

    if (e.type === "package.output" && e.subject === pkgId) {
      if (typeof e.actor?.id === "string" && e.actor.id) {
        latestAuthorOutput = e.actor.id;
        const outDigests = new Set<string>();
        collectOutputsAndRefs(data, outDigests, recordedHeadShas);
        for (const d of outDigests) latestOutputs.add(d);
        if (typeof data.round === "number") {
          authorByRound.set(data.round, e.actor.id);
          if (outDigests.size > 0) {
            const existing = authorOutputsByRound.get(data.round) ?? new Set<string>();
            for (const d of outDigests) existing.add(d);
            authorOutputsByRound.set(data.round, existing);
          }
        }
      }
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
      // Only patch outputs of the accepted pre-check's own round bind; a round with no patch has no diff binding.
      latestOutputs = new Set(round !== undefined ? (authorOutputsByRound.get(round) ?? []) : []);
      if (round !== undefined) latestAuthorOutput = authorByRound.get(round);
      collectOutputsAndRefs(data, latestOutputs, recordedHeadShas);
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
        collectOutputsAndRefs(data, latestOutputs, recordedHeadShas);
        acceptance = {
          acceptedBy: e.actor.id,
          decisionId,
          acceptedAt: e.at,
          subjectDigest,
          kind: e.type === "decision.accept-with-findings" ? "accept-with-findings" : "accept",
          passkeyVerified: false,
          sealTrust: sealKeyTrusted ? "trusted-key" : "bundle-key-only",
          ...(bundle.seal?.payload?.signer_id ? { sealedBySigner: String(bundle.seal.payload.signer_id) } : {}),
        };
      }
    }
  }

  const tail = events.at(-1);
  let headSeq = tail?.seq;
  let headDigest = tail?.digest.value;
  if (authenticated && bundle.seal) {
    const sealedSeq = Number(bundle.seal.payload?.head_seq ?? tail?.seq ?? 0);
    const sealedEvent = events.find((ev) => ev.seq === sealedSeq);
    const sealedDigest = readSubjectDigest(bundle.seal.payload?.head_digest) ?? sealedEvent?.digest.value;
    headSeq = sealedSeq;
    headDigest = sealedDigest;
  }

  return {
    currentRevision,
    preCheckRevision,
    authorOutputDigests: [...latestOutputs],
    recordedHeadShas: [...recordedHeadShas],
    input: {
      packageId: pkgId,
      ...(currentRevision !== undefined ? { revision: currentRevision } : {}),
      author: { provider: latestAuthorOutput ?? "unknown" },
      ...(checker ? { checker } : {}),
      ...(acceptance ? { acceptance } : {}),
      ...(unauthenticatedAcceptancePresent ? { unauthenticatedAcceptancePresent: true } : {}),
      proof: {
        bundlePath,
        authenticated,
        sealKeyTrusted,
        bundleDigest,
        ...(headSeq !== undefined ? { headSeq } : {}),
        ...(headDigest ? { headDigest } : {}),
        ...(latestOutputs.size === 1 ? { diffSha256: [...latestOutputs][0]! } : {}),
        ...(recordedHeadShas.size === 1 ? { headSha: [...recordedHeadShas][0]! } : {}),
        ...(authenticated && bundle.seal
          ? {
              sealedBy: String(bundle.seal.id ?? ""),
              sealedAt: String(bundle.seal.payload?.sealed_at ?? ""),
            }
          : {}),
        witnessed: false,
      },
    },
  };
}

export function parseReceiptBinding(text: string): ReceiptBindingExpectation | null {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      const diffObj = obj.diff_digest as Record<string, unknown> | undefined;
      const diffVal = readSubjectDigest(diffObj?.value ?? obj.diff_sha256);
      const rev = typeof obj.revision === "number" && Number.isInteger(obj.revision) && obj.revision >= 0 ? obj.revision : undefined;
      const headSha = typeof obj.head_sha === "string" && /^[0-9a-f]{7,64}$/i.test(obj.head_sha.trim()) ? obj.head_sha.trim().toLowerCase() : undefined;
      const packageId = typeof obj.package_id === "string" && obj.package_id ? obj.package_id : undefined;
      if (diffVal || rev !== undefined || headSha) {
        return { packageId, expectedRevision: rev, expectedDiffSha256: diffVal?.toLowerCase(), expectedHeadSha: headSha };
      }
    } catch {
      return null;
    }
  }
  const m = text.match(/<!--\s*controlrod-check-binding:\s*(\{[^\r\n]*?\})\s*-->/);
  if (m?.[1]) {
    try {
      const obj = JSON.parse(m[1]) as Record<string, unknown>;
      const diffVal = readSubjectDigest(obj.diff_sha256);
      const rev = typeof obj.revision === "number" && Number.isInteger(obj.revision) && obj.revision >= 0 ? obj.revision : undefined;
      const headSha = typeof obj.head_sha === "string" && /^[0-9a-f]{7,64}$/i.test(obj.head_sha.trim()) ? obj.head_sha.trim().toLowerCase() : undefined;
      const packageId = typeof obj.package_id === "string" && obj.package_id ? obj.package_id : undefined;
      if (diffVal || rev !== undefined || headSha) {
        return { packageId, expectedRevision: rev, expectedDiffSha256: diffVal?.toLowerCase(), expectedHeadSha: headSha };
      }
    } catch {
      return null;
    }
  }
  return null;
}

const STANDALONE_HEADING = "### Control Rod check summary (standalone, unaccepted)";
const STANDALONE_ACCEPTED = "- **Accepted by:** not accepted in Control Rod (standalone check)";

/** A standalone `controlrod check` summary: its own heading, no bundle claims, and no accepting person. */
function isStandaloneSummary(md: string): boolean {
  const lines = md.split(/\r?\n/).map((l) => l.trimEnd());
  if (!lines.includes(STANDALONE_HEADING)) return false;
  if (lines.some((l) => /^- \*\*(?:Package|Written by):\*\*/.test(l) || l === "### Control Rod receipt")) return false;
  return lines.filter((l) => l.startsWith("- **Accepted by:**")).every((l) => l === STANDALONE_ACCEPTED);
}

const VERIFY_LINE = "- **Verify offline:**";

/** Normalises line endings and trailing space; the single path-dependent verify line is masked. */
function receiptSectionLines(md: string): string[] {
  return md
    .replace(/\r\n?/g, "\n")
    .replace(/\s+$/, "")
    .split("\n")
    .map((l) => (l.startsWith(VERIFY_LINE) ? VERIFY_LINE : l));
}

export function checkBundleReceiptBinding(
  bundle: InclusionBundle,
  authenticated: boolean,
  expect: ReceiptBindingExpectation,
): { problem?: string; summary?: string } {
  const hasChecks =
    expect.expectedRevision !== undefined ||
    expect.expectedDiffSha256 !== undefined ||
    expect.expectedHeadSha !== undefined ||
    expect.receiptText !== undefined;
  if (!hasChecks) return {};

  let resolved = expect;
  if (expect.receiptText !== undefined) {
    const parsed = parseReceiptBinding(expect.receiptText);
    if (!parsed) {
      return { problem: "the receipt or verdict file contains no valid controlrod-check-binding metadata" };
    }
    const conflicts: string[] = [];
    const differ = (name: string, a: unknown, b: unknown) => {
      if (a !== undefined && b !== undefined && a !== b) conflicts.push(name);
    };
    differ("package", expect.packageId, parsed.packageId);
    differ("revision", expect.expectedRevision, parsed.expectedRevision);
    differ("diff digest", expect.expectedDiffSha256?.toLowerCase(), parsed.expectedDiffSha256);
    differ("head SHA", expect.expectedHeadSha?.toLowerCase(), parsed.expectedHeadSha);
    if (conflicts.length) {
      return { problem: `the explicit options disagree with the receipt's binding (${conflicts.join(", ")})` };
    }
    resolved = {
      packageId: expect.packageId ?? parsed.packageId,
      expectedRevision: expect.expectedRevision ?? parsed.expectedRevision,
      expectedDiffSha256: expect.expectedDiffSha256 ?? parsed.expectedDiffSha256,
      expectedHeadSha: expect.expectedHeadSha ?? parsed.expectedHeadSha,
      trustedSealKeys: expect.trustedSealKeys,
    };
  }

  if (expect.receiptText !== undefined && resolved.packageId === undefined) {
    return { problem: "the receipt or verdict names no package_id, so it cannot be tied to this bundle's package" };
  }
  if (resolved.packageId !== undefined && resolved.packageId !== bundle.package_id) {
    return { problem: `the receipt is for package ${JSON.stringify(resolved.packageId)}, not this bundle's package ${JSON.stringify(bundle.package_id)}` };
  }

  if (!authenticated) {
    return { problem: "the bundle is unsealed, so no authenticated human acceptance covers this PR revision or diff" };
  }

  const inspection = extractBundleInspection(bundle, authenticated, false, "", "");
  const acceptance = inspection.input.acceptance;
  if (!acceptance) {
    return { problem: "the bundle has no active authenticated human acceptance matching its current pre-check and revision" };
  }

  if (
    expect.receiptText !== undefined &&
    /<!--\s*controlrod-check-binding:/.test(expect.receiptText) &&
    !isStandaloneSummary(expect.receiptText)
  ) {
    // A Control Rod bundle receipt is regenerated from the bundle and must equal it line for line
    // (only the path-dependent verify line is masked): no extra lines, no fences, no edits.
    const trusted = isSealKeyTrusted(bundle, authenticated, resolved.trustedSealKeys ? { trustedSealKeys: resolved.trustedSealKeys } : undefined);
    const regenerated = formatPrReceipt(extractBundleInspection(bundle, authenticated, trusted, "", "").input);
    const want = receiptSectionLines(regenerated);
    const got = receiptSectionLines(expect.receiptText);
    if (want.length !== got.length || want.some((l, i) => l !== got[i])) {
      return { problem: "the receipt's claims (package, writer, checker, verdict, accepting person) do not match what this bundle shows (the receipt must equal the section regenerated from the bundle, with no extra or fenced lines)" };
    }
  }

  if (resolved.expectedRevision !== undefined && inspection.currentRevision !== resolved.expectedRevision) {
    return {
      problem: `acceptance covers package revision ${inspection.currentRevision ?? "unknown"}, not expected revision ${resolved.expectedRevision}`,
    };
  }

  if (resolved.expectedDiffSha256 === undefined || !/^[0-9a-f]{64}$/i.test(resolved.expectedDiffSha256)) {
    return { problem: "the receipt or request carries no valid diff digest, so acceptance cannot be tied to this diff" };
  }

  const want = resolved.expectedDiffSha256.toLowerCase();
  const recorded = inspection.authorOutputDigests.map((d) => d.toLowerCase());
  if (!recorded.includes(want)) {
    const got = recorded.length ? recorded.map((d) => `sha256:${shortDigest(d)}`).join(", ") : "none";
    return {
      problem: `accepted deliverables (${got}) do not cover receipt diff sha256:${want}`,
    };
  }

  // Head binding holds only when the bundle records a head commit and it matches. A recorded
  // commit that differs fails above; a bundle that records none is verified as not head-bound.
  let headBound = false;
  if (resolved.expectedHeadSha !== undefined) {
    const wantHead = resolved.expectedHeadSha.toLowerCase();
    const recordedHeads = inspection.recordedHeadShas.map((s) => s.toLowerCase());
    if (recordedHeads.length > 0 && !recordedHeads.includes(wantHead)) {
      return {
        problem: `accepted bundle commit (${recordedHeads.join(", ")}) does not match head commit ${wantHead}`,
      };
    }
    headBound = recordedHeads.includes(wantHead);
  }

  const detail = [
    inspection.currentRevision !== undefined ? `revision ${inspection.currentRevision}` : "",
    acceptance.decisionId ? `decision ${acceptance.decisionId}` : "",
    resolved.expectedDiffSha256 ? `diff sha256:${shortDigest(resolved.expectedDiffSha256)}` : "",
    headBound ? `head ${resolved.expectedHeadSha}` : "not head-bound",
  ]
    .filter(Boolean)
    .join(", ");
  return { summary: `Acceptance link holds (${detail}).` };
}

/**
 * Verifies an inclusion proof bundle with `verifyInclusion` and formats a PR
 * receipt from its chain events. Fails closed on invalid or tampered bundles.
 */
export async function prReceiptFromBundleText(
  text: string,
  bundlePath = "inclusion-proof.json",
  opts?: BundleReceiptOptions,
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
  const sealKeyTrusted = isSealKeyTrusted(bundle, check.authenticated, opts);
  const bundleDigest = createHash("sha256").update(text, "utf8").digest("hex");
  const inspection = extractBundleInspection(bundle, check.authenticated, sealKeyTrusted, bundlePath, bundleDigest);
  const markdown = formatPrReceipt(inspection.input);
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
