/**
 * Visual Casting Desk model (ADR 0023 Role Casting, ADR 0024 Council First).
 *
 * Pure data structures, presets, governance checks, Author-only fallback chain helpers,
 * plain-language read-back, and safe localStorage draft persistence.
 *
 * Local drafts are preview-only until API persistence and passkey signing land in a
 * follow-up milestone; no API keys or credentials are ever stored here.
 */

export type CastingRoleId = "author" | "checker" | "planner" | "quick";

export type EffortLevel = "low" | "medium" | "high" | "max";

export type CastingVendorFamily = "anthropic" | "openai" | "google" | "xai" | "local";

export type CastingPresetId = "balanced" | "deep" | "frugal" | "local-only";

export interface CastingModelOption {
  id: string;
  label: string;
  vendor: string;
  vendorFamily: CastingVendorFamily;
  contextLabel: string;
  local: boolean;
  supportsEffort: boolean;
}

export interface RoleAssignment {
  modelId: string;
  effort: EffortLevel;
}

export interface CastingRoleMeta {
  id: CastingRoleId;
  label: string;
  responsibility: string;
  allowsFallback: boolean;
}

export interface CastingPreset {
  id: CastingPresetId;
  label: string;
  summary: string;
  roles: Readonly<Record<CastingRoleId, RoleAssignment>>;
  authorFallbacks: readonly string[];
}

export interface CastingSheetDraft {
  version: 1;
  presetId: CastingPresetId | "custom";
  roles: Record<CastingRoleId, RoleAssignment>;
  authorFallbacks: string[];
}

export const CASTING_STORAGE_KEY = "controlrod.castingDesk.v1";

export const EFFORT_LEVELS: readonly { id: EffortLevel; label: string }[] = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
  { id: "max", label: "Max" },
];

export const CASTING_ROLES: readonly CastingRoleMeta[] = [
  {
    id: "author",
    label: "Author",
    responsibility: "Writes the deliverable inside a confined workspace.",
    allowsFallback: true,
  },
  {
    id: "checker",
    label: "Blind Checker",
    responsibility: "Verifies the deliverable independently without seeing how it was written.",
    allowsFallback: false,
  },
  {
    id: "planner",
    label: "Planner",
    responsibility: "Breaks down requirements and prepares work packages before release.",
    allowsFallback: false,
  },
  {
    id: "quick",
    label: "Quick / Summarizer",
    responsibility: "Handles short summaries, triage notes, and fast read-backs.",
    allowsFallback: false,
  },
];

export const CASTING_MODELS: readonly CastingModelOption[] = [
  {
    id: "anthropic/claude-sonnet-5-5",
    label: "Claude Sonnet 5.5",
    vendor: "Anthropic",
    vendorFamily: "anthropic",
    contextLabel: "200k ctx",
    local: false,
    supportsEffort: true,
  },
  {
    id: "anthropic/claude-opus-4-6",
    label: "Claude Opus 4.6",
    vendor: "Anthropic",
    vendorFamily: "anthropic",
    contextLabel: "200k ctx",
    local: false,
    supportsEffort: true,
  },
  {
    id: "anthropic/claude-sonnet-4-5",
    label: "Claude Sonnet 4.5",
    vendor: "Anthropic",
    vendorFamily: "anthropic",
    contextLabel: "200k ctx",
    local: false,
    supportsEffort: true,
  },
  {
    id: "anthropic/claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    vendor: "Anthropic",
    vendorFamily: "anthropic",
    contextLabel: "200k ctx",
    local: false,
    supportsEffort: true,
  },
  {
    id: "openai/gpt-6.2-sol",
    label: "Codex GPT-6.2 Sol",
    vendor: "OpenAI",
    vendorFamily: "openai",
    contextLabel: "256k ctx",
    local: false,
    supportsEffort: true,
  },
  {
    id: "openai/gpt-6.2-astra",
    label: "Codex GPT-6.2 Astra",
    vendor: "OpenAI",
    vendorFamily: "openai",
    contextLabel: "256k ctx",
    local: false,
    supportsEffort: true,
  },
  {
    id: "openai/gpt-6-sol",
    label: "Codex GPT-6 Sol",
    vendor: "OpenAI",
    vendorFamily: "openai",
    contextLabel: "192k ctx",
    local: false,
    supportsEffort: true,
  },
  {
    id: "openai/gpt-5-codex",
    label: "Codex GPT-5",
    vendor: "OpenAI",
    vendorFamily: "openai",
    contextLabel: "192k ctx",
    local: false,
    supportsEffort: true,
  },
  {
    id: "google/gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    vendor: "Google",
    vendorFamily: "google",
    contextLabel: "1M ctx",
    local: false,
    supportsEffort: true,
  },
  {
    id: "google/gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    vendor: "Google",
    vendorFamily: "google",
    contextLabel: "1M ctx",
    local: false,
    supportsEffort: true,
  },
  {
    id: "xai/grok-4",
    label: "Grok 4",
    vendor: "xAI",
    vendorFamily: "xai",
    contextLabel: "256k ctx",
    local: false,
    supportsEffort: true,
  },
  {
    id: "ollama/qwen2.5-coder:32b",
    label: "Qwen 2.5 Coder 32B (Ollama)",
    vendor: "Local (Ollama)",
    vendorFamily: "local",
    contextLabel: "32k ctx",
    local: true,
    supportsEffort: false,
  },
  {
    id: "ollama/deepseek-r1:32b",
    label: "DeepSeek R1 32B (Ollama)",
    vendor: "Local (Ollama)",
    vendorFamily: "local",
    contextLabel: "32k ctx",
    local: true,
    supportsEffort: true,
  },
  {
    id: "ollama/llama3.3:70b",
    label: "Llama 3.3 70B (Ollama)",
    vendor: "Local (Ollama)",
    vendorFamily: "local",
    contextLabel: "128k ctx",
    local: true,
    supportsEffort: false,
  },
];

export const CASTING_PRESETS: readonly CastingPreset[] = [
  {
    id: "balanced",
    label: "Balanced",
    summary: "Claude Sonnet 5.5 authors; Codex GPT-6.2 Sol checks blindly.",
    roles: {
      author: { modelId: "anthropic/claude-sonnet-5-5", effort: "medium" },
      checker: { modelId: "openai/gpt-6.2-sol", effort: "high" },
      planner: { modelId: "anthropic/claude-opus-4-6", effort: "high" },
      quick: { modelId: "anthropic/claude-haiku-4-5", effort: "low" },
    },
    authorFallbacks: ["anthropic/claude-sonnet-4-5"],
  },
  {
    id: "deep",
    label: "Deep / High-Assurance",
    summary: "Claude Opus 4.6 (:high) authors; Codex GPT-6.2 Astra (:high) checks blindly.",
    roles: {
      author: { modelId: "anthropic/claude-opus-4-6", effort: "high" },
      checker: { modelId: "openai/gpt-6.2-astra", effort: "high" },
      planner: { modelId: "anthropic/claude-opus-4-6", effort: "max" },
      quick: { modelId: "anthropic/claude-sonnet-5-5", effort: "medium" },
    },
    authorFallbacks: ["anthropic/claude-sonnet-5-5"],
  },
  {
    id: "frugal",
    label: "Fast & Frugal",
    summary: "Claude Sonnet 4.5 (:low) authors; Codex GPT-6 Sol (:medium) checks blindly.",
    roles: {
      author: { modelId: "anthropic/claude-sonnet-4-5", effort: "low" },
      checker: { modelId: "openai/gpt-6-sol", effort: "medium" },
      planner: { modelId: "anthropic/claude-sonnet-4-5", effort: "medium" },
      quick: { modelId: "anthropic/claude-haiku-4-5", effort: "low" },
    },
    authorFallbacks: ["anthropic/claude-haiku-4-5"],
  },
  {
    id: "local-only",
    label: "Local-Only (Restricted Lane)",
    summary:
      "Ollama local author and planner for Restricted lanes. Local models cannot serve as deciding checkers on Safety or Material grades.",
    roles: {
      author: { modelId: "ollama/qwen2.5-coder:32b", effort: "medium" },
      checker: { modelId: "ollama/deepseek-r1:32b", effort: "high" },
      planner: { modelId: "ollama/deepseek-r1:32b", effort: "high" },
      quick: { modelId: "ollama/qwen2.5-coder:32b", effort: "low" },
    },
    authorFallbacks: ["ollama/llama3.3:70b"],
  },
];

const MODEL_MAP = new Map<string, CastingModelOption>(CASTING_MODELS.map((m) => [m.id, m]));
const EFFORT_SET = new Set<string>(EFFORT_LEVELS.map((e) => e.id));
const PRESET_MAP = new Map<CastingPresetId, CastingPreset>(CASTING_PRESETS.map((p) => [p.id, p]));

export function modelById(id: string): CastingModelOption {
  return MODEL_MAP.get(id) ?? CASTING_MODELS[0]!;
}

export function presetById(id: CastingPresetId): CastingPreset {
  return PRESET_MAP.get(id) ?? CASTING_PRESETS[0]!;
}

export function createDraftFromPreset(presetId: CastingPresetId = "balanced"): CastingSheetDraft {
  const preset = presetById(presetId);
  return {
    version: 1,
    presetId: preset.id,
    roles: {
      author: { ...preset.roles.author },
      checker: { ...preset.roles.checker },
      planner: { ...preset.roles.planner },
      quick: { ...preset.roles.quick },
    },
    authorFallbacks: [...preset.authorFallbacks],
  };
}

export function updateRoleAssignment(
  draft: CastingSheetDraft,
  roleId: CastingRoleId,
  patch: Partial<RoleAssignment>,
): CastingSheetDraft {
  const current = draft.roles[roleId];
  const nextModelId = patch.modelId && MODEL_MAP.has(patch.modelId) ? patch.modelId : current.modelId;
  const nextEffort = patch.effort && EFFORT_SET.has(patch.effort) ? patch.effort : current.effort;
  const nextRoles: Record<CastingRoleId, RoleAssignment> = {
    ...draft.roles,
    [roleId]: { modelId: nextModelId, effort: nextEffort },
  };
  // Never allow the primary Author model to remain duplicated in the Author fallback chain.
  const nextFallbacks =
    roleId === "author"
      ? draft.authorFallbacks.filter((id) => id !== nextModelId)
      : [...draft.authorFallbacks];
  return {
    ...draft,
    presetId: "custom",
    roles: nextRoles,
    authorFallbacks: nextFallbacks,
  };
}

/**
 * Adds a model to the Author-only fallback chain, rejecting unknown models, duplicates,
 * and the current Author primary model.
 */
export function addAuthorFallback(draft: CastingSheetDraft, modelId: string): CastingSheetDraft {
  if (!MODEL_MAP.has(modelId)) return draft;
  if (modelId === draft.roles.author.modelId) return draft;
  if (draft.authorFallbacks.includes(modelId)) return draft;
  return {
    ...draft,
    presetId: "custom",
    authorFallbacks: [...draft.authorFallbacks, modelId],
  };
}

export function removeAuthorFallback(draft: CastingSheetDraft, modelId: string): CastingSheetDraft {
  if (!draft.authorFallbacks.includes(modelId)) return draft;
  return {
    ...draft,
    presetId: "custom",
    authorFallbacks: draft.authorFallbacks.filter((id) => id !== modelId),
  };
}

export function moveAuthorFallback(
  draft: CastingSheetDraft,
  index: number,
  direction: "up" | "down",
): CastingSheetDraft {
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || index >= draft.authorFallbacks.length) return draft;
  if (target < 0 || target >= draft.authorFallbacks.length) return draft;
  const next = [...draft.authorFallbacks];
  const current = next[index]!;
  next[index] = next[target]!;
  next[target] = current;
  return {
    ...draft,
    presetId: "custom",
    authorFallbacks: next,
  };
}

/** Returns true when Author and Blind Checker belong to the same vendor family. */
export function isSameVendorChecker(draft: CastingSheetDraft): boolean {
  const author = modelById(draft.roles.author.modelId);
  const checker = modelById(draft.roles.checker.modelId);
  return author.vendorFamily === checker.vendorFamily;
}

/** Returns true when the Blind Checker is assigned to a local model. */
export function isLocalChecker(draft: CastingSheetDraft): boolean {
  return modelById(draft.roles.checker.modelId).local;
}

/** Crisp, plain-language summary sentence describing the current Casting Sheet draft. */
export function formatCastingReadback(draft: CastingSheetDraft): string {
  const author = modelById(draft.roles.author.modelId);
  const checker = modelById(draft.roles.checker.modelId);
  const planner = modelById(draft.roles.planner.modelId);
  const quick = modelById(draft.roles.quick.modelId);

  const base =
    `${author.label} (${author.vendor}, ${draft.roles.author.effort}) authors; ` +
    `${checker.label} (${checker.vendor}, ${draft.roles.checker.effort}) checks blindly without seeing how it was written. ` +
    `Planner: ${planner.label} (${draft.roles.planner.effort}); Quick: ${quick.label} (${draft.roles.quick.effort}).`;

  if (checker.local) {
    return `${base} Local models cannot serve as deciding checkers on Safety or Material grades.`;
  }
  if (author.vendorFamily === checker.vendorFamily) {
    return `${base} Warning: Author and Blind Checker share the ${author.vendor} vendor family, so cross-vendor independence requires a different vendor or a signed override.`;
  }
  return base;
}

function isValidRoleAssignment(raw: unknown): raw is RoleAssignment {
  if (!raw || typeof raw !== "object") return false;
  const obj = raw as Record<string, unknown>;
  return (
    typeof obj.modelId === "string" &&
    MODEL_MAP.has(obj.modelId) &&
    typeof obj.effort === "string" &&
    EFFORT_SET.has(obj.effort)
  );
}

/** Loads the saved Casting Sheet draft from localStorage, falling back cleanly to Balanced. */
export function loadCastingDraft(storage?: Pick<Storage, "getItem">): CastingSheetDraft {
  try {
    const store = storage ?? globalThis.localStorage;
    if (!store) return createDraftFromPreset("balanced");
    const raw = store.getItem(CASTING_STORAGE_KEY);
    if (!raw) return createDraftFromPreset("balanced");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || parsed.version !== 1) {
      return createDraftFromPreset("balanced");
    }
    const roles = parsed.roles as Record<string, unknown> | undefined;
    if (
      !roles ||
      !isValidRoleAssignment(roles.author) ||
      !isValidRoleAssignment(roles.checker) ||
      !isValidRoleAssignment(roles.planner) ||
      !isValidRoleAssignment(roles.quick)
    ) {
      return createDraftFromPreset("balanced");
    }
    const presetId =
      parsed.presetId === "custom" || PRESET_MAP.has(parsed.presetId as CastingPresetId)
        ? (parsed.presetId as CastingPresetId | "custom")
        : "custom";
    const rawFallbacks = Array.isArray(parsed.authorFallbacks) ? parsed.authorFallbacks : [];
    const seen = new Set<string>([roles.author.modelId]);
    const authorFallbacks: string[] = [];
    for (const item of rawFallbacks) {
      if (typeof item === "string" && MODEL_MAP.has(item) && !seen.has(item)) {
        seen.add(item);
        authorFallbacks.push(item);
      }
    }
    return {
      version: 1,
      presetId,
      roles: {
        author: { ...roles.author },
        checker: { ...roles.checker },
        planner: { ...roles.planner },
        quick: { ...roles.quick },
      },
      authorFallbacks,
    };
  } catch {
    return createDraftFromPreset("balanced");
  }
}

/** Persists the Casting Sheet draft to localStorage safely; returns false if unavailable. */
export function saveCastingDraft(
  draft: CastingSheetDraft,
  storage?: Pick<Storage, "setItem">,
): boolean {
  try {
    const store = storage ?? globalThis.localStorage;
    if (!store) return false;
    store.setItem(CASTING_STORAGE_KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}
