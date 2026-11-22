/**
 * Slice 8 — Web Board Progressive Deliverable Disclosure, Accessible Usage Metric Presenter,
 * Honest Model Reroute / Capability Presenter, and Zero-Third-Party-Network Asset URL Guard
 * (`AO-15`, `AO-16`, `#124`, `#133`, `M5`–`M7`).
 */

export type DeliverablePartition<T> = {
  /** Items visible inline on the card under the current disclosure cap. */
  visible: T[];
  /** Count of items currently not shown inline (`items.length - visible.length`). */
  hiddenCount: number;
  /** Count of items exceeding `expandedCap` that route to the review drawer / inspector. */
  overflowToInspectorCount: number;
  /** True when the card is collapsed and expanding inline will reveal additional items. */
  canExpand: boolean;
};

/**
 * Progressive deliverable disclosure (`AO-15`):
 * - Caps inline deliverables on a board card to `collapsedCap` (default `2`).
 * - Expands inline up to `expandedCap` (default `10`) when `expanded === true` (or when
 *   called with `collapsedCap = expandedCap`).
 * - Routes any remaining items beyond `expandedCap` (`overflowToInspectorCount`) to the
 *   Board Review Drawer / inspector rather than rendering unbounded inline lists.
 * Never mutates the input slice.
 */
export function partitionDeliverables<T>(
  items: readonly T[],
  collapsedCap = 2,
  expandedCap = 10,
  expanded = false,
): DeliverablePartition<T> {
  const safeCollapsed = Math.max(0, Math.floor(collapsedCap));
  const safeExpanded = Math.max(safeCollapsed, Math.floor(expandedCap));
  const activeCap = expanded ? safeExpanded : safeCollapsed;
  const visible = items.slice(0, activeCap);
  const hiddenCount = Math.max(0, items.length - visible.length);
  const overflowToInspectorCount = Math.max(0, items.length - safeExpanded);
  const canExpand = !expanded && items.length > safeCollapsed && safeExpanded > safeCollapsed;

  return {
    visible,
    hiddenCount,
    overflowToInspectorCount,
    canExpand,
  };
}

const GIT_REF_PREFIX_RE = /^(?:refs\/heads\/|refs\/remotes\/origin\/|remotes\/origin\/|origin\/)/i;
const CONVENTIONAL_BRANCH_PREFIX_RE =
  /^(?:feat|feature|fix|bugfix|hotfix|chore|docs|refactor|test|ci|build|perf|style|worktree|wp)\//i;

function normalizeLabelTokens(value: string, stripBranchCategory: boolean): string {
  let cleaned = value.trim().replace(GIT_REF_PREFIX_RE, "");
  if (stripBranchCategory) {
    cleaned = cleaned.replace(CONVENTIONAL_BRANCH_PREFIX_RE, "");
  }
  return cleaned
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Returns `true` when a branch/ref/id secondary label is empty or normalizes to the same
 * text as the card title or identifier (`AO-15`), suppressing duplicate metadata rows.
 */
export function isRedundantBranchLabel(title: string, branchOrId?: string | null): boolean {
  if (branchOrId == null) return true;
  const rawBranch = branchOrId.trim();
  if (rawBranch.length === 0) return true;

  const rawTitle = title.trim();
  if (rawTitle.length === 0) return false;

  if (rawTitle.toLowerCase() === rawBranch.toLowerCase()) return true;

  const titleTokens = normalizeLabelTokens(rawTitle, false);
  const titleTokensStripped = normalizeLabelTokens(rawTitle, true);
  const branchTokensRaw = normalizeLabelTokens(rawBranch, false);
  const branchTokensStripped = normalizeLabelTokens(rawBranch, true);

  if (titleTokens.length === 0) return false;

  return (
    titleTokens === branchTokensRaw ||
    titleTokens === branchTokensStripped ||
    (titleTokensStripped.length > 0 &&
      (titleTokensStripped === branchTokensRaw || titleTokensStripped === branchTokensStripped))
  );
}

export type UsageMetricInput = {
  inputTokens?: number | null | undefined;
  outputTokens?: number | null | undefined;
  cachedTokens?: number | null | undefined;
  reportedCostUsd?: string | null | undefined;
  cpuPercent?: number | null | undefined;
};

export type UsageMetricPresentation = {
  /** False when `cpuPercent` is null, undefined, non-finite, or `<= 0` (omits idle `0%` CPU noise). */
  showCpu: boolean;
  /** Compact tabular token summary for visual display, or `null` when no token counts were reported. */
  compactTokensLabel: string | null;
  /** Paired screen-reader text expanding compact token abbreviations, or `null` when unreported. */
  srOnlyTokensLabel: string | null;
  /** Exact reported cost string when provided, or `"Cost not reported"` (never fabricates `$0.00`). */
  costLabel: string;
};

function isReportedCount(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function formatCount(value: number): string {
  return Math.floor(value).toLocaleString("en-US");
}

/**
 * Accessible compact usage metric presenter (`AO-15`, Control Rod zero-fabrication invariant):
 * - Omits idle `0%` CPU telemetry (`showCpu: false` when `cpuPercent == null || cpuPercent <= 0`).
 * - Pairs a compact tabular token summary (`compactTokensLabel`) with full screen-reader copy
 *   (`srOnlyTokensLabel`), returning `null` for both when token telemetry was not reported
 *   rather than fabricating `0`.
 * - Returns the exact reported cost or `"Cost not reported"` (never fabricating `"$0.00"`).
 */
export function presentUsageMetric(input: UsageMetricInput): UsageMetricPresentation {
  const showCpu =
    typeof input.cpuPercent === "number" && Number.isFinite(input.cpuPercent) && input.cpuPercent > 0;

  const compactParts: string[] = [];
  const srParts: string[] = [];

  if (isReportedCount(input.inputTokens)) {
    const formatted = formatCount(input.inputTokens);
    compactParts.push(`${formatted} in`);
    srParts.push(`${formatted} input tokens`);
  }
  if (isReportedCount(input.outputTokens)) {
    const formatted = formatCount(input.outputTokens);
    compactParts.push(`${formatted} out`);
    srParts.push(`${formatted} output tokens`);
  }
  if (isReportedCount(input.cachedTokens)) {
    const formatted = formatCount(input.cachedTokens);
    compactParts.push(`${formatted} cached`);
    srParts.push(`${formatted} cached tokens`);
  }

  const compactTokensLabel = compactParts.length > 0 ? compactParts.join(" · ") : null;
  const srOnlyTokensLabel = srParts.length > 0 ? `Token usage: ${srParts.join(", ")}` : null;

  const trimmedCost = typeof input.reportedCostUsd === "string" ? input.reportedCostUsd.trim() : "";
  const costLabel = trimmedCost.length > 0 ? trimmedCost : "Cost not reported";

  return {
    showCpu,
    compactTokensLabel,
    srOnlyTokensLabel,
    costLabel,
  };
}

export type ModelCapabilityInput = {
  id: string;
  label: string;
  supported: boolean;
  reasonIfUnsupported?: string | undefined;
};

export type PresentedModelCapability = {
  id: string;
  label: string;
  supported: boolean;
  disabled: boolean;
  inlineReason: string | null;
};

export type ModelRoutingInput = {
  requestedModel: string;
  actualModel?: string | null | undefined;
  capabilities?: readonly ModelCapabilityInput[] | undefined;
};

export type ModelRoutingPresentation = {
  isRerouted: boolean;
  routingBadge: string;
  capabilityItems: PresentedModelCapability[];
};

export const DEFAULT_UNSUPPORTED_CAPABILITY_REASON = "Not supported by this runtime";

/**
 * Honest capability and model reroute presenter (`AO-16`):
 * - Surfaces an explicit `"Answered by <actualModel> (requested <requestedModel>)"` badge
 *   whenever the answering runtime/model differs from the requested model.
 * - Keeps unsupported runtime/model capabilities visible as `disabled: true` with an explicit
 *   non-empty `inlineReason` rather than silently hiding or dropping them.
 */
export function presentModelRouting(input: ModelRoutingInput): ModelRoutingPresentation {
  const requested = input.requestedModel.trim();
  const actual = typeof input.actualModel === "string" ? input.actualModel.trim() : "";
  const isRerouted = actual.length > 0 && actual !== requested;
  const routingBadge = isRerouted ? `Answered by ${actual} (requested ${requested})` : requested;

  const capabilityItems: PresentedModelCapability[] = (input.capabilities ?? []).map((cap) => {
    if (cap.supported) {
      return {
        id: cap.id,
        label: cap.label,
        supported: true,
        disabled: false,
        inlineReason: null,
      };
    }
    const reason =
      typeof cap.reasonIfUnsupported === "string" && cap.reasonIfUnsupported.trim().length > 0
        ? cap.reasonIfUnsupported.trim()
        : DEFAULT_UNSUPPORTED_CAPABILITY_REASON;
    return {
      id: cap.id,
      label: cap.label,
      supported: false,
      disabled: true,
      inlineReason: reason,
    };
  });

  return {
    isRerouted,
    routingBadge,
    capabilityItems,
  };
}

const SCHEME_PREFIX_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function parseOriginSafe(originOrUrl: string): string | null {
  const trimmed = originOrUrl.trim();
  if (trimmed.length === 0) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function isAllowedHttpOrigin(
  candidateOrigin: string,
  candidateHostname: string,
  baseOrigin: string | null,
  allowedOrigins: ReadonlySet<string>,
): boolean {
  if (baseOrigin !== null && candidateOrigin === baseOrigin) return true;
  if (LOOPBACK_HOSTS.has(candidateHostname.toLowerCase())) return true;
  return allowedOrigins.has(candidateOrigin);
}

/**
 * Offline / zero-third-party-network URL guard (`#133`, `AO #8785`):
 * - Allows relative paths/queries/hashes (excluding protocol-relative `//host` URLs),
 *   `data:` URLs, safe `blob:` URLs, `currentOrigin`, loopback (`localhost`, `127.0.0.1`, `[::1]`),
 *   and any origin explicitly listed in `configuredAllowedOrigins`.
 * - Rejects unconfigured third-party asset/tile/font hosts (e.g. `https://tile.openstreetmap.org`,
 *   `https://fonts.googleapis.com`, `https://fonts.gstatic.com`) and dangerous schemes (`javascript:`,
 *   `file:`, `ws:`) by default.
 */
export function isAllowedAssetOrigin(
  url: string,
  currentOrigin: string,
  configuredAllowedOrigins: readonly string[] = [],
): boolean {
  const trimmed = url.trim();
  if (trimmed.length === 0) return false;

  // Reject protocol-relative URLs (e.g. "//tile.openstreetmap.org/...") unless their target host is allowed.
  const baseOrigin = parseOriginSafe(currentOrigin);
  const allowedSet = new Set<string>();
  for (const entry of configuredAllowedOrigins) {
    const normalized = parseOriginSafe(entry);
    if (normalized !== null) {
      allowedSet.add(normalized);
    }
  }

  // Relative URL (no scheme prefix and not protocol-relative "//...").
  if (!SCHEME_PREFIX_RE.test(trimmed) && !trimmed.startsWith("//")) {
    if (baseOrigin === null) return true;
    try {
      const resolved = new URL(trimmed, baseOrigin);
      return resolved.origin === baseOrigin;
    } catch {
      return false;
    }
  }

  // Handle data: and blob: URLs.
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("data:")) {
    return true;
  }
  if (lower.startsWith("blob:")) {
    const inner = trimmed.slice("blob:".length).trim();
    if (inner.length === 0) return false;
    if (inner.startsWith("null/") || inner === "null") return true;
    try {
      const innerUrl = new URL(inner);
      if (innerUrl.protocol !== "http:" && innerUrl.protocol !== "https:") return false;
      return isAllowedHttpOrigin(innerUrl.origin, innerUrl.hostname, baseOrigin, allowedSet);
    } catch {
      return false;
    }
  }

  // Resolve protocol-relative URLs against baseOrigin protocol (or https:) to inspect their target host.
  const candidateInput = trimmed.startsWith("//")
    ? `${baseOrigin ? new URL(baseOrigin).protocol : "https:"}${trimmed}`
    : trimmed;

  try {
    const parsed = new URL(candidateInput);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    return isAllowedHttpOrigin(parsed.origin, parsed.hostname, baseOrigin, allowedSet);
  } catch {
    return false;
  }
}
