/**
 * Custom Agent Studio model — declarative `@role`-backed specialist agents.
 *
 * Ports `oh-my-pi`'s declarative `agents/*.md` pattern into a zero-terminal studio
 * directly wired to the Visual Casting Desk (`CastingSheetDraft`). Every specialist
 * binds to a Casting role alias (`@author`, `@checker`, `@planner`, `@quick`) so
 * changing a model or effort on the Casting Desk immediately updates every specialist
 * using that role.
 *
 * Custom specialists are stored locally in this browser as a `packs/` draft; they
 * never modify CLI configurations and store no API keys or tokens.
 */

import {
  CASTING_ROLES,
  modelById,
  type CastingModelOption,
  type CastingRoleId,
  type CastingSheetDraft,
  type EffortLevel,
} from "./casting.js";

export type AgentMode = "software" | "capital-projects" | "both";

export type RoleAlias = "@author" | "@checker" | "@planner" | "@quick";

export interface CustomAgentSpec {
  id: string;
  name: string;
  description: string;
  mode: AgentMode;
  roleAlias: RoleAlias;
  instructions: string;
  enabled: boolean;
  builtIn: boolean;
}

export interface CustomAgentInput {
  id?: string;
  name: string;
  description: string;
  mode: AgentMode;
  roleAlias: RoleAlias;
  instructions: string;
  enabled?: boolean;
  builtIn?: boolean;
}

export interface ResolvedAgentModel {
  roleAlias: RoleAlias;
  roleId: CastingRoleId;
  roleLabel: string;
  model: CastingModelOption;
  effort: EffortLevel;
}

export const AGENT_STUDIO_STORAGE_KEY = "controlrod.agentStudio.v1";

export const AGENT_MODES: readonly { id: AgentMode; label: string }[] = [
  { id: "software", label: "Software" },
  { id: "capital-projects", label: "Capital Projects" },
  { id: "both", label: "Both modes" },
];

export const ROLE_ALIASES: readonly { alias: RoleAlias; roleId: CastingRoleId; label: string }[] = [
  { alias: "@author", roleId: "author", label: "Author" },
  { alias: "@checker", roleId: "checker", label: "Blind Checker" },
  { alias: "@planner", roleId: "planner", label: "Planner" },
  { alias: "@quick", roleId: "quick", label: "Quick / Summarizer" },
];

const MODE_SET = new Set<string>(AGENT_MODES.map((m) => m.id));
const ROLE_ALIAS_MAP = new Map<RoleAlias, CastingRoleId>(
  ROLE_ALIASES.map((entry) => [entry.alias, entry.roleId]),
);
const ROLE_LABEL_MAP = new Map<CastingRoleId, string>(
  CASTING_ROLES.map((role) => [role.id, role.label]),
);

export const STARTER_AGENTS: readonly CustomAgentSpec[] = [
  {
    id: "security-reviewer",
    name: "Security Reviewer",
    description:
      "Audits changes blindly for trust-boundary regressions, injection risks, and leaked secrets before merge.",
    mode: "software",
    roleAlias: "@checker",
    instructions: [
      "Review the deliverable independently without relying on author commentary.",
      "Flag any trust-surface edits, unsafe shell or SQL interpolation, unvalidated inputs, or secret exposure.",
      "Report findings with exact file paths, severity, and a concrete remediation step.",
    ].join("\n"),
    enabled: true,
    builtIn: true,
  },
  {
    id: "test-hardener",
    name: "Test Hardener",
    description:
      "Expands unit and integration tests to cover boundary conditions, error paths, and regressions.",
    mode: "software",
    roleAlias: "@author",
    instructions: [
      "Add focused tests for edge cases, invalid inputs, and failure recovery paths.",
      "Keep existing assertions intact and verify tests fail before the fix and pass after.",
      "Prefer deterministic, fast tests with no network or wall-clock flakiness.",
    ].join("\n"),
    enabled: true,
    builtIn: true,
  },
  {
    id: "calc-verifier",
    name: "Calculation Verifier",
    description:
      "Independently checks engineering calculation sheets, unit conversions, and recorded script digests.",
    mode: "capital-projects",
    roleAlias: "@checker",
    instructions: [
      "Verify every engineering number traces back to a recorded script, tool input, output, and digest.",
      "Check dimensional consistency, safety factors, and governing code references independently.",
      "Reject unverified hand-typed numbers and list each discrepancy with its line or table reference.",
    ].join("\n"),
    enabled: true,
    builtIn: true,
  },
  {
    id: "datasheet-extractor",
    name: "Datasheet Extractor",
    description:
      "Structures vendor equipment datasheets into reviewable work packages and parameter schedules.",
    mode: "capital-projects",
    roleAlias: "@planner",
    instructions: [
      "Extract operating limits, materials, nozzle ratings, and revision identifiers into a structured schedule.",
      "Preserve original units alongside SI equivalents and mark missing or TBD vendor fields explicitly.",
      "Group open clarifications into an actionable review checklist for the project engineer.",
    ].join("\n"),
    enabled: true,
    builtIn: true,
  },
];

const STARTER_ID_SET = new Set<string>(STARTER_AGENTS.map((agent) => agent.id));

export function roleAliasToRoleId(alias: RoleAlias): CastingRoleId {
  return ROLE_ALIAS_MAP.get(alias) ?? "author";
}

export function modeLabel(mode: AgentMode): string {
  if (mode === "software") return "Software";
  if (mode === "capital-projects") return "Capital Projects";
  return "Both modes";
}

/**
 * Resolves a specialist's `@role` alias live against the current Casting Sheet draft.
 * Any change to a role's model or effort on the Casting Desk immediately reflects here.
 */
export function resolveAgentModel(
  agent: Pick<CustomAgentSpec, "roleAlias">,
  castingDraft: CastingSheetDraft,
): ResolvedAgentModel {
  const roleId = roleAliasToRoleId(agent.roleAlias);
  const assignment = castingDraft.roles[roleId];
  const model = modelById(assignment.modelId);
  const roleLabel = ROLE_LABEL_MAP.get(roleId) ?? roleId;
  return {
    roleAlias: agent.roleAlias,
    roleId,
    roleLabel,
    model,
    effort: assignment.effort,
  };
}

function escapeYamlString(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, " ")
    .trim();
}

/**
 * Renders a deterministic Markdown + YAML frontmatter pack preview ready to copy
 * or drop into `packs/`.
 */
export function renderAgentPackMarkdown(agent: CustomAgentSpec): string {
  const instructions = agent.instructions.trim() || "Add specialist instructions here.";
  return [
    "---",
    `id: ${agent.id}`,
    `name: "${escapeYamlString(agent.name)}"`,
    `description: "${escapeYamlString(agent.description)}"`,
    `mode: ${agent.mode}`,
    `role: "${agent.roleAlias}"`,
    `enabled: ${agent.enabled}`,
    "---",
    "",
    instructions,
    "",
  ].join("\n");
}

export function slugifyAgentId(name: string, existingIds: readonly string[] = []): string {
  const base =
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "custom-specialist";
  const taken = new Set(existingIds);
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

export function resetCustomAgents(): CustomAgentSpec[] {
  return STARTER_AGENTS.map((agent) => ({ ...agent }));
}

function isValidRoleAlias(value: unknown): value is RoleAlias {
  return typeof value === "string" && ROLE_ALIAS_MAP.has(value as RoleAlias);
}

function isValidAgentMode(value: unknown): value is AgentMode {
  return typeof value === "string" && MODE_SET.has(value);
}

function parseAgentSpec(raw: unknown): CustomAgentSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (
    typeof obj.id !== "string" ||
    !obj.id.trim() ||
    typeof obj.name !== "string" ||
    !obj.name.trim() ||
    typeof obj.description !== "string" ||
    !isValidAgentMode(obj.mode) ||
    !isValidRoleAlias(obj.roleAlias) ||
    typeof obj.instructions !== "string" ||
    typeof obj.enabled !== "boolean"
  ) {
    return null;
  }
  const id = obj.id.trim();
  return {
    id,
    name: obj.name.trim(),
    description: obj.description.trim(),
    mode: obj.mode,
    roleAlias: obj.roleAlias,
    instructions: obj.instructions.trim(),
    enabled: obj.enabled,
    builtIn: STARTER_ID_SET.has(id),
  };
}

/**
 * Loads saved specialist agents from localStorage, ensuring starter built-ins are
 * always present and falling back cleanly on corrupt or unavailable storage.
 */
export function loadCustomAgents(storage?: Pick<Storage, "getItem">): CustomAgentSpec[] {
  try {
    const store = storage ?? globalThis.localStorage;
    if (!store) return resetCustomAgents();
    const raw = store.getItem(AGENT_STUDIO_STORAGE_KEY);
    if (!raw) return resetCustomAgents();
    const parsed = JSON.parse(raw) as unknown;
    const list = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).agents)
        ? ((parsed as Record<string, unknown>).agents as unknown[])
        : null;
    if (!list) return resetCustomAgents();

    const byId = new Map<string, CustomAgentSpec>();
    for (const item of list) {
      const spec = parseAgentSpec(item);
      if (spec && !byId.has(spec.id)) {
        byId.set(spec.id, spec);
      }
    }

    const merged: CustomAgentSpec[] = [];
    for (const starter of STARTER_AGENTS) {
      merged.push(byId.get(starter.id) ?? { ...starter });
      byId.delete(starter.id);
    }
    for (const custom of byId.values()) {
      merged.push({ ...custom, builtIn: false });
    }
    return merged;
  } catch {
    return resetCustomAgents();
  }
}

/** Persists custom agents to localStorage safely; returns false if unavailable. */
export function saveCustomAgents(
  agents: readonly CustomAgentSpec[],
  storage?: Pick<Storage, "setItem">,
): boolean {
  try {
    const store = storage ?? globalThis.localStorage;
    if (!store) return false;
    store.setItem(
      AGENT_STUDIO_STORAGE_KEY,
      JSON.stringify({ version: 1, agents }),
    );
    return true;
  } catch {
    return false;
  }
}

/** Inserts a new specialist or updates an existing one by id. */
export function upsertCustomAgent(
  agents: readonly CustomAgentSpec[],
  input: CustomAgentInput,
): CustomAgentSpec[] {
  const name = input.name.trim();
  if (!name) return [...agents];

  const existingIndex = input.id ? agents.findIndex((a) => a.id === input.id) : -1;
  if (existingIndex >= 0) {
    const existing = agents[existingIndex]!;
    const updated: CustomAgentSpec = {
      id: existing.id,
      name,
      description: input.description.trim(),
      mode: input.mode,
      roleAlias: input.roleAlias,
      instructions: input.instructions.trim(),
      enabled: input.enabled ?? existing.enabled,
      builtIn: existing.builtIn,
    };
    return agents.map((a, idx) => (idx === existingIndex ? updated : a));
  }

  const id = input.id?.trim() || slugifyAgentId(name, agents.map((a) => a.id));
  const created: CustomAgentSpec = {
    id,
    name,
    description: input.description.trim(),
    mode: input.mode,
    roleAlias: input.roleAlias,
    instructions: input.instructions.trim(),
    enabled: input.enabled ?? true,
    builtIn: false,
  };
  return [...agents, created];
}

/** Toggles (or explicitly sets) a specialist's enabled flag. */
export function toggleCustomAgent(
  agents: readonly CustomAgentSpec[],
  id: string,
  enabled?: boolean,
): CustomAgentSpec[] {
  return agents.map((agent) =>
    agent.id === id ? { ...agent, enabled: enabled ?? !agent.enabled } : agent,
  );
}

/** Deletes a user-created specialist; refuses deletion of built-in starter agents. */
export function deleteCustomAgent(
  agents: readonly CustomAgentSpec[],
  id: string,
): CustomAgentSpec[] {
  const target = agents.find((agent) => agent.id === id);
  if (!target || target.builtIn) return [...agents];
  return agents.filter((agent) => agent.id !== id);
}
