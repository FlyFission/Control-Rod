import { AGENTS, type AgentId } from "./agents.js";
import type { CheckIn } from "../api/types.js";
import type { Council } from "./councilFlow.js";

export type WorkflowStageRole = "intake" | "author" | "pre-check" | "review" | "ship" | "custom";
export type UpdatePolicy = "auto" | "freeze";
export type LaneKind = "workflow" | "context" | "custom";
export type ContextDepth = "light" | "nuclear";
export type WorkflowPresetId = "playbook" | "superpowers" | "pocock" | "pocock-superpowers" | "custom";

export interface SkillBlockSpec {
  id: string;
  packId: string;
  skill: string;
  label?: string;
  /** null/undefined => stage council seat; or "claude"|"codex"|"agy"|"opencode"|"grok"|"ollama"|"user:<model>" */
  agent?: string | null;
}

export interface WorkflowStageSpec {
  id: string;
  label: string;
  role: WorkflowStageRole;
  /** true for intake/author/pre-check; false for review/ship/custom ("Coming soon") */
  built: boolean;
  isBlindChecker?: boolean;
  /** ALWAYS false for blind checker (ADR 0024) */
  allowFallback: boolean;
  skills: SkillBlockSpec[];
}

export interface LaneSkillEntry {
  skill: string;
  label?: string;
  defaultStage: string;
  digest?: string;
  agent?: string | null;
}

export interface LaneVersionSnapshot {
  version: number;
  commit: string;
  digest: string;
  recordedAt: string;
  summary: string;
  skills: LaneSkillEntry[];
}

export interface LaneConflict {
  skill: string;
  reason: "modified-both" | "removed-upstream-edited-locally" | "reordered-both";
  localEntry?: LaneSkillEntry;
  upstreamEntry?: LaneSkillEntry;
}

export interface WorkflowLaneSpec {
  id: string;
  name: string;
  kind: LaneKind;
  enabled: boolean;
  source: {
    type: "builtin" | "git-url" | "custom" | "file";
    url?: string;
    commit: string;
    digest: string;
    license?: string;
  };
  forked: boolean;
  /** default "auto" when !forked, "freeze" when forked */
  updatePolicy: UpdatePolicy;
  nativeSkills: LaneSkillEntry[];
  skills: LaneSkillEntry[];
  versions: LaneVersionSnapshot[];
  pendingConflict?: {
    fromCommit: string;
    toCommit: string;
    toDigest: string;
    upstreamSkills: LaneSkillEntry[];
    conflicts: LaneConflict[];
  } | null;
  nuclearRequired?: boolean;
  packError?: string | null;
}

export interface WorkflowSpecV1 {
  schema_version: "1.0.0";
  id: string;
  name: string;
  preset: WorkflowPresetId;
  contextDepth: ContextDepth;
  checkIn: CheckIn;
  stages: WorkflowStageSpec[];
  lanes: WorkflowLaneSpec[];
  userModels: string[];
  updatedAt?: string;
}

export interface LaneDiff {
  hasChanges: boolean;
  added: LaneSkillEntry[];
  removed: LaneSkillEntry[];
  reordered: string[];
  reassigned: Array<{ skill: string; from?: string | null; to?: string | null }>;
  modified: string[];
}

export interface UpstreamLaneSnapshot {
  commit: string;
  digest: string;
  summary?: string;
  skills: LaneSkillEntry[];
}

export type ConflictChoice = "mine" | "upstream";

export interface WorkflowValidationIssue {
  code: string;
  severity: "error" | "warning";
  message: string;
  stageId?: string;
  blockId?: string;
  laneId?: string;
}

export interface WorkflowValidationResult {
  valid: boolean;
  errors: WorkflowValidationIssue[];
  warnings: WorkflowValidationIssue[];
  blockViolations: Record<string, WorkflowValidationIssue[]>;
}

/** Human-readable label for a skill identifier such as `superpowers:writing-plans`. */
export function formatSkillLabel(skill: string): string {
  const raw = skill.includes(":") ? skill.split(":").slice(1).join(":") : skill;
  return raw
    .split(/[-_/]+/)
    .filter(Boolean)
    .map((part, idx) => (idx === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function cloneEntries(entries: readonly LaneSkillEntry[]): LaneSkillEntry[] {
  return entries.map((e) => ({ ...e }));
}

function makeBlockId(packId: string, skill: string, index = 0): string {
  const safe = `${packId}__${skill}`.replace(/[^a-zA-Z0-9_-]+/g, "_");
  return index === 0 ? `blk_${safe}` : `blk_${safe}_${index}`;
}

export const BUILTIN_LANE_CATALOG: Readonly<Record<string, WorkflowLaneSpec>> = {
  playbook: {
    id: "playbook",
    name: "Playbook",
    kind: "workflow",
    enabled: true,
    source: {
      type: "builtin",
      commit: "builtin-playbook-v1",
      digest: "sha256:playbook-core-v1",
      license: "MIT",
    },
    forked: false,
    updatePolicy: "auto",
    nativeSkills: [
      { skill: "playbook:intake-brief", label: "Intake brief", defaultStage: "plan" },
      { skill: "playbook:author-deliverable", label: "Author deliverable", defaultStage: "author" },
      { skill: "playbook:blind-verification", label: "Blind verification", defaultStage: "check" },
    ],
    skills: [
      { skill: "playbook:intake-brief", label: "Intake brief", defaultStage: "plan" },
      { skill: "playbook:author-deliverable", label: "Author deliverable", defaultStage: "author" },
      { skill: "playbook:blind-verification", label: "Blind verification", defaultStage: "check" },
    ],
    versions: [],
    pendingConflict: null,
  },
  superpowers: {
    id: "superpowers",
    name: "Superpowers",
    kind: "workflow",
    enabled: true,
    source: {
      type: "builtin",
      url: "https://github.com/obra/superpowers",
      commit: "22f0b463e7a5e579904dd6211a520321035526f7",
      digest: "sha256:7a4fb909117e338f53cf0ae7e282512347efc8d7cbf91f2b68bd41c0a5a649e9",
      license: "MIT",
    },
    forked: false,
    updatePolicy: "auto",
    nativeSkills: [
      { skill: "brainstorming", label: "Brainstorming", defaultStage: "brainstorm" },
      { skill: "writing-plans", label: "Writing plans", defaultStage: "plan" },
      { skill: "subagent-driven-development", label: "Subagent-driven dev", defaultStage: "author" },
      { skill: "test-driven-development", label: "Test-driven development", defaultStage: "author" },
      { skill: "systematic-debugging", label: "Systematic debugging", defaultStage: "author" },
      { skill: "requesting-code-review", label: "Requesting code review", defaultStage: "check" },
      { skill: "verification-before-completion", label: "Verification before completion", defaultStage: "check" },
    ],
    skills: [
      { skill: "brainstorming", label: "Brainstorming", defaultStage: "brainstorm" },
      { skill: "writing-plans", label: "Writing plans", defaultStage: "plan" },
      { skill: "subagent-driven-development", label: "Subagent-driven dev", defaultStage: "author" },
      { skill: "test-driven-development", label: "Test-driven development", defaultStage: "author" },
      { skill: "systematic-debugging", label: "Systematic debugging", defaultStage: "author" },
      { skill: "requesting-code-review", label: "Requesting code review", defaultStage: "check" },
      { skill: "verification-before-completion", label: "Verification before completion", defaultStage: "check" },
    ],
    versions: [],
    pendingConflict: null,
  },
  pocock: {
    id: "pocock",
    name: "Pocock",
    kind: "workflow",
    enabled: true,
    source: {
      type: "builtin",
      url: "https://github.com/mattpocock/skills",
      commit: "abeeaf95660ba9e8b7c753eb38f441ca707a8823",
      digest: "sha256:528d8a419119957d2fb52fea184215b30337466e0431c7ab62d74b705b587df4",
      license: "MIT",
    },
    forked: false,
    updatePolicy: "auto",
    nativeSkills: [
      { skill: "grilling", label: "Grilling", defaultStage: "brainstorm" },
      { skill: "domain-modeling", label: "Domain modeling", defaultStage: "brainstorm" },
      { skill: "to-spec", label: "To spec", defaultStage: "plan" },
      { skill: "to-tickets", label: "To tickets", defaultStage: "plan" },
      { skill: "implement", label: "Implement", defaultStage: "author" },
      { skill: "tdd", label: "TDD", defaultStage: "author" },
      { skill: "diagnosing-bugs", label: "Diagnosing bugs", defaultStage: "author" },
      { skill: "writing-for-agents", label: "Writing for agents", defaultStage: "author" },
      { skill: "code-review", label: "Code review", defaultStage: "check" },
      { skill: "retro", label: "Retro", defaultStage: "plan" },
    ],
    skills: [
      { skill: "grilling", label: "Grilling", defaultStage: "brainstorm" },
      { skill: "domain-modeling", label: "Domain modeling", defaultStage: "brainstorm" },
      { skill: "to-spec", label: "To spec", defaultStage: "plan" },
      { skill: "to-tickets", label: "To tickets", defaultStage: "plan" },
      { skill: "implement", label: "Implement", defaultStage: "author" },
      { skill: "tdd", label: "TDD", defaultStage: "author" },
      { skill: "diagnosing-bugs", label: "Diagnosing bugs", defaultStage: "author" },
      { skill: "writing-for-agents", label: "Writing for agents", defaultStage: "author" },
      { skill: "code-review", label: "Code review", defaultStage: "check" },
      { skill: "retro", label: "Retro", defaultStage: "plan" },
    ],
    versions: [],
    pendingConflict: null,
  },
  "nuclear-grade": {
    id: "nuclear-grade",
    name: "Nuclear-Grade",
    kind: "context",
    enabled: false,
    nuclearRequired: true,
    source: {
      type: "builtin",
      url: "https://github.com/FlyFission/nuclear-grade-context-engineering",
      commit: "395aa6ed161b773f1cf24abbf85e1c9ff95b969c",
      digest: "sha256:59ccd62464fbdf99adaa33ae635fda2b1221a5af3dfa21d3dd5325c884d31520",
      license: "MIT",
    },
    forked: false,
    updatePolicy: "auto",
    nativeSkills: [
      { skill: "questioning-attitude", label: "Questioning attitude", defaultStage: "brainstorm" },
      { skill: "rating-change-risk", label: "Rating change risk", defaultStage: "plan" },
      { skill: "proving-claims", label: "Proving claims", defaultStage: "author" },
      { skill: "double-checking-before-acting", label: "Double-checking before acting", defaultStage: "author" },
      { skill: "staying-on-mission", label: "Staying on mission", defaultStage: "plan" },
      { skill: "checking-release-readiness", label: "Checking release readiness", defaultStage: "check" },
      { skill: "learning-from-experience", label: "Learning from experience", defaultStage: "check" },
    ],
    skills: [
      { skill: "questioning-attitude", label: "Questioning attitude", defaultStage: "brainstorm" },
      { skill: "rating-change-risk", label: "Rating change risk", defaultStage: "plan" },
      { skill: "proving-claims", label: "Proving claims", defaultStage: "author" },
      { skill: "double-checking-before-acting", label: "Double-checking before acting", defaultStage: "author" },
      { skill: "staying-on-mission", label: "Staying on mission", defaultStage: "plan" },
      { skill: "checking-release-readiness", label: "Checking release readiness", defaultStage: "check" },
      { skill: "learning-from-experience", label: "Learning from experience", defaultStage: "check" },
    ],
    versions: [],
    pendingConflict: null,
    packError: null,
  },
  light: {
    id: "light",
    name: "Light",
    kind: "context",
    enabled: true,
    source: {
      type: "builtin",
      commit: "builtin-light",
      digest: "sha256:light-context-v1",
      license: "MIT",
    },
    forked: false,
    updatePolicy: "auto",
    nativeSkills: [],
    skills: [],
    versions: [],
    pendingConflict: null,
  },
};

function cloneLane(lane: WorkflowLaneSpec, enabled?: boolean): WorkflowLaneSpec {
  return {
    ...lane,
    enabled: enabled ?? lane.enabled,
    source: { ...lane.source },
    nativeSkills: cloneEntries(lane.nativeSkills),
    skills: cloneEntries(lane.skills),
    versions: lane.versions.map((v) => ({ ...v, skills: cloneEntries(v.skills) })),
    pendingConflict: lane.pendingConflict
      ? {
          ...lane.pendingConflict,
          upstreamSkills: cloneEntries(lane.pendingConflict.upstreamSkills),
          conflicts: lane.pendingConflict.conflicts.map((c) => ({
            ...c,
            ...(c.localEntry ? { localEntry: { ...c.localEntry } } : {}),
            ...(c.upstreamEntry ? { upstreamEntry: { ...c.upstreamEntry } } : {}),
          })),
        }
      : null,
  };
}

function defaultStages(): WorkflowStageSpec[] {
  return [
    { id: "brainstorm", label: "Brainstorm", role: "intake", built: true, allowFallback: true, skills: [] },
    { id: "plan", label: "Plan", role: "intake", built: true, allowFallback: true, skills: [] },
    { id: "author", label: "Author", role: "author", built: true, allowFallback: true, skills: [] },
    { id: "check", label: "Check", role: "pre-check", built: true, isBlindChecker: true, allowFallback: false, skills: [] },
    { id: "review", label: "Review", role: "review", built: false, allowFallback: true, skills: [] },
    { id: "ship", label: "Ship", role: "ship", built: false, allowFallback: true, skills: [] },
  ];
}

function populateStagesFromLanes(stages: WorkflowStageSpec[], lanes: WorkflowLaneSpec[]): WorkflowStageSpec[] {
  const next = stages.map((s) => ({ ...s, skills: [...s.skills] }));
  const stageMap = new Map(next.map((s) => [s.id, s]));
  const usedIds = new Set<string>(next.flatMap((s) => s.skills.map((b) => b.id)));

  for (const lane of lanes) {
    if (!lane.enabled) continue;
    for (const entry of lane.skills) {
      const target = stageMap.get(entry.defaultStage) ?? stageMap.get("author") ?? next[0];
      if (!target) continue;
      let idx = 0;
      let id = makeBlockId(lane.id, entry.skill, idx);
      while (usedIds.has(id)) {
        idx += 1;
        id = makeBlockId(lane.id, entry.skill, idx);
      }
      usedIds.add(id);
      target.skills.push({
        id,
        packId: lane.id,
        skill: entry.skill,
        label: entry.label ?? formatSkillLabel(entry.skill),
        agent: entry.agent ?? null,
      });
    }
  }
  return next;
}

const PRESET_NAMES: Record<WorkflowPresetId, string> = {
  playbook: "Playbook",
  superpowers: "Superpowers",
  pocock: "Pocock",
  "pocock-superpowers": "Pocock Superpowers",
  custom: "Custom workflow",
};

/**
 * Builds a complete, declarative WorkflowSpecV1 from a workflow preset, independent context depth
 * (Light or Nuclear), and check-in cadence.
 */
export function buildPresetSpec(
  preset: WorkflowPresetId = "superpowers",
  contextDepth: ContextDepth = "light",
  checkIn: CheckIn = "start-and-merge",
): WorkflowSpecV1 {
  const lanes: WorkflowLaneSpec[] = [];
  if (preset === "playbook") {
    lanes.push(cloneLane(BUILTIN_LANE_CATALOG.playbook!, true));
  } else if (preset === "superpowers") {
    lanes.push(cloneLane(BUILTIN_LANE_CATALOG.superpowers!, true));
  } else if (preset === "pocock") {
    lanes.push(cloneLane(BUILTIN_LANE_CATALOG.pocock!, true));
  } else if (preset === "pocock-superpowers") {
    lanes.push(cloneLane(BUILTIN_LANE_CATALOG.pocock!, true));
    lanes.push(cloneLane(BUILTIN_LANE_CATALOG.superpowers!, true));
  } else {
    lanes.push(cloneLane(BUILTIN_LANE_CATALOG.superpowers!, true));
  }

  lanes.push(cloneLane(BUILTIN_LANE_CATALOG.light!, contextDepth === "light"));
  lanes.push(cloneLane(BUILTIN_LANE_CATALOG["nuclear-grade"]!, contextDepth === "nuclear"));

  const stages = populateStagesFromLanes(defaultStages(), lanes);

  return {
    schema_version: "1.0.0",
    id: `wf-${preset}`,
    name: PRESET_NAMES[preset],
    preset,
    contextDepth,
    checkIn,
    stages,
    lanes,
    userModels: [],
  };
}

export function serializeWorkflowSpec(spec: WorkflowSpecV1): string {
  return JSON.stringify(spec, null, 2);
}

export function parseWorkflowSpec(raw: string | unknown): WorkflowSpecV1 {
  const parsed = typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Workflow spec must be a JSON object.");
  }
  const obj = parsed as Partial<WorkflowSpecV1>;
  if (obj.schema_version !== "1.0.0") {
    throw new Error(`Unsupported workflow spec schema_version: ${String(obj.schema_version)}`);
  }
  if (!Array.isArray(obj.stages) || !Array.isArray(obj.lanes)) {
    throw new Error("Workflow spec must contain stages and lanes arrays.");
  }
  return {
    schema_version: "1.0.0",
    id: typeof obj.id === "string" && obj.id ? obj.id : "wf-custom",
    name: typeof obj.name === "string" && obj.name ? obj.name : "Custom workflow",
    preset: obj.preset ?? "custom",
    contextDepth: obj.contextDepth === "nuclear" ? "nuclear" : "light",
    checkIn: obj.checkIn ?? "start-and-merge",
    stages: obj.stages.map((s) => ({
      ...s,
      allowFallback: s.isBlindChecker || s.role === "pre-check" ? Boolean(s.allowFallback) : s.allowFallback !== false,
      skills: Array.isArray(s.skills) ? s.skills.map((b) => ({ ...b })) : [],
    })),
    lanes: obj.lanes.map((l) => cloneLane(l)),
    userModels: Array.isArray(obj.userModels) ? [...obj.userModels] : [],
    ...(obj.updatedAt ? { updatedAt: obj.updatedAt } : {}),
  };
}

/* ─────────────────────────── Stage Reducers ─────────────────────────── */

export function addStage(
  spec: WorkflowSpecV1,
  stage: { id?: string; label: string; role?: WorkflowStageRole; built?: boolean },
  insertAt?: number,
): WorkflowSpecV1 {
  const baseId = (stage.id ?? stage.label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "stage";
  let id = baseId;
  let n = 2;
  while (spec.stages.some((s) => s.id === id)) {
    id = `${baseId}-${n++}`;
  }
  const role: WorkflowStageRole = stage.role ?? "custom";
  const isBlindChecker = role === "pre-check";
  const created: WorkflowStageSpec = {
    id,
    label: stage.label.trim() || "Custom stage",
    role,
    built: stage.built ?? (role === "intake" || role === "author" || role === "pre-check"),
    ...(isBlindChecker ? { isBlindChecker: true } : {}),
    allowFallback: !isBlindChecker,
    skills: [],
  };
  const stages = [...spec.stages];
  if (insertAt !== undefined && insertAt >= 0 && insertAt <= stages.length) {
    stages.splice(insertAt, 0, created);
  } else {
    stages.push(created);
  }
  return { ...spec, stages };
}

export function removeStage(spec: WorkflowSpecV1, stageId: string): WorkflowSpecV1 {
  if (spec.stages.length <= 1) return spec;
  return {
    ...spec,
    stages: spec.stages.filter((s) => s.id !== stageId),
  };
}

export function reorderStage(
  spec: WorkflowSpecV1,
  stageId: string,
  directionOrIndex: "earlier" | "later" | number,
): WorkflowSpecV1 {
  const idx = spec.stages.findIndex((s) => s.id === stageId);
  if (idx === -1) return spec;
  const target =
    typeof directionOrIndex === "number"
      ? Math.max(0, Math.min(spec.stages.length - 1, directionOrIndex))
      : directionOrIndex === "earlier"
        ? idx - 1
        : idx + 1;
  if (target < 0 || target >= spec.stages.length || target === idx) return spec;
  const stages = [...spec.stages];
  const [moved] = stages.splice(idx, 1);
  stages.splice(target, 0, moved!);
  return { ...spec, stages };
}

/* ─────────────────────────── Skill Reducers ─────────────────────────── */

export function addSkillToStage(
  spec: WorkflowSpecV1,
  stageId: string,
  skill: { packId: string; skill: string; label?: string; agent?: string | null },
  targetIndex?: number,
): WorkflowSpecV1 {
  const existingIds = new Set(spec.stages.flatMap((s) => s.skills.map((b) => b.id)));
  let idx = 0;
  let id = makeBlockId(skill.packId, skill.skill, idx);
  while (existingIds.has(id)) {
    idx += 1;
    id = makeBlockId(skill.packId, skill.skill, idx);
  }
  const block: SkillBlockSpec = {
    id,
    packId: skill.packId,
    skill: skill.skill,
    label: skill.label ?? formatSkillLabel(skill.skill),
    agent: skill.agent ?? null,
  };
  return {
    ...spec,
    stages: spec.stages.map((s) => {
      if (s.id !== stageId) return s;
      const skills = [...s.skills];
      if (targetIndex !== undefined && targetIndex >= 0 && targetIndex <= skills.length) {
        skills.splice(targetIndex, 0, block);
      } else {
        skills.push(block);
      }
      return { ...s, skills };
    }),
  };
}

export function removeSkillFromStage(spec: WorkflowSpecV1, stageId: string, blockId: string): WorkflowSpecV1 {
  return {
    ...spec,
    stages: spec.stages.map((s) =>
      s.id === stageId ? { ...s, skills: s.skills.filter((b) => b.id !== blockId) } : s,
    ),
  };
}

export function moveSkill(
  spec: WorkflowSpecV1,
  blockId: string,
  targetStageId: string,
  targetIndex?: number,
): WorkflowSpecV1 {
  let found: SkillBlockSpec | undefined;
  for (const s of spec.stages) {
    const match = s.skills.find((b) => b.id === blockId);
    if (match) {
      found = match;
      break;
    }
  }
  if (!found || !spec.stages.some((s) => s.id === targetStageId)) return spec;

  const stages = spec.stages.map((s) => {
    const filtered = s.skills.filter((b) => b.id !== blockId);
    if (s.id !== targetStageId) {
      return filtered.length === s.skills.length ? s : { ...s, skills: filtered };
    }
    const nextSkills = [...filtered];
    if (targetIndex !== undefined && targetIndex >= 0 && targetIndex <= nextSkills.length) {
      nextSkills.splice(targetIndex, 0, found!);
    } else {
      nextSkills.push(found!);
    }
    return { ...s, skills: nextSkills };
  });
  return { ...spec, stages };
}

export function reorderSkillInStage(
  spec: WorkflowSpecV1,
  stageId: string,
  blockId: string,
  direction: "earlier" | "later",
): WorkflowSpecV1 {
  return {
    ...spec,
    stages: spec.stages.map((s) => {
      if (s.id !== stageId) return s;
      const idx = s.skills.findIndex((b) => b.id === blockId);
      if (idx === -1) return s;
      const target = direction === "earlier" ? idx - 1 : idx + 1;
      if (target < 0 || target >= s.skills.length) return s;
      const skills = [...s.skills];
      const [moved] = skills.splice(idx, 1);
      skills.splice(target, 0, moved!);
      return { ...s, skills };
    }),
  };
}

export function assignAgentToSkill(
  spec: WorkflowSpecV1,
  blockId: string,
  agentId: string | null,
  _council?: Council,
): WorkflowSpecV1 {
  const normalized = agentId && agentId.trim().length > 0 ? agentId.trim() : null;
  return {
    ...spec,
    stages: spec.stages.map((s) => ({
      ...s,
      skills: s.skills.map((b) => (b.id === blockId ? { ...b, agent: normalized } : b)),
    })),
  };
}

/* ─────────────────────────── Composable Context Depth ─────────────────────────── */

/**
 * Independent composable toggle: switches between Light and Nuclear context depth by enabling or
 * disabling the context swim lanes and adding/removing their stage blocks without touching any of
 * the user's workflow lane edits.
 */
export function setContextDepth(spec: WorkflowSpecV1, depth: ContextDepth): WorkflowSpecV1 {
  if (spec.contextDepth === depth) return spec;

  const isLightId = (id: string) => id === "light" || id === "light-context";
  const hasNuclear = spec.lanes.some((l) => l.id === "nuclear-grade");
  const hasLight = spec.lanes.some((l) => isLightId(l.id));

  let lanes = spec.lanes.map((l) => {
    if (l.id === "nuclear-grade") return { ...l, enabled: depth === "nuclear" };
    if (isLightId(l.id)) return { ...l, enabled: depth === "light" };
    return l;
  });

  if (!hasLight) {
    lanes = [...lanes, cloneLane(BUILTIN_LANE_CATALOG.light!, depth === "light")];
  }
  if (!hasNuclear) {
    lanes = [...lanes, cloneLane(BUILTIN_LANE_CATALOG["nuclear-grade"]!, depth === "nuclear")];
  }

  const lightLaneId = lanes.find((l) => isLightId(l.id))?.id ?? "light";
  const removePackIds = new Set(depth === "nuclear" ? ["light", "light-context"] : ["nuclear-grade"]);
  const addPackId = depth === "nuclear" ? "nuclear-grade" : lightLaneId;

  // Remove blocks from the disabled context pack, preserving all workflow & custom blocks
  let stages = spec.stages.map((s) => ({
    ...s,
    skills: s.skills.filter((b) => !removePackIds.has(b.packId)),
  }));

  // Add blocks for the newly enabled context pack if not already present on stages
  const activeContextLane = lanes.find((l) => l.id === addPackId);
  if (activeContextLane && !activeContextLane.packError) {
    const alreadyPresent = new Set(
      stages.flatMap((s) => s.skills.filter((b) => b.packId === addPackId).map((b) => b.skill)),
    );
    const missingLane: WorkflowLaneSpec = {
      ...activeContextLane,
      enabled: true,
      skills: activeContextLane.skills.filter((e) => !alreadyPresent.has(e.skill)),
    };
    stages = populateStagesFromLanes(stages, [missingLane]);
  }

  return {
    ...spec,
    contextDepth: depth,
    lanes,
    stages,
  };
}

/* ─────────────────────────── Swim-Lane Fork, Diff, Merge, Rollback ─────────────────────────── */

export function forkLane(spec: WorkflowSpecV1, laneId: string): WorkflowSpecV1 {
  return {
    ...spec,
    lanes: spec.lanes.map((l) =>
      l.id === laneId ? { ...l, forked: true, updatePolicy: "freeze" } : l,
    ),
  };
}

export function syncStageSkillsFromLaneUpdate(
  stages: readonly WorkflowStageSpec[],
  updatedLane: WorkflowLaneSpec,
): WorkflowStageSpec[] {
  const bareOf = (s: string) => (s.includes(":") ? s.slice(s.indexOf(":") + 1) : s);
  const existingAgentBySkill = new Map<string, string | null>();
  for (const st of stages) {
    for (const b of st.skills) {
      if (b.packId === updatedLane.id) {
        existingAgentBySkill.set(bareOf(b.skill), b.agent ?? null);
      }
    }
  }

  const nextStages = stages.map((st) => ({
    ...st,
    skills: st.skills.filter((b) => b.packId !== updatedLane.id),
  }));
  if (!updatedLane.enabled) return nextStages;

  const byId = new Map(nextStages.map((s) => [s.id, s]));
  for (let i = 0; i < updatedLane.skills.length; i++) {
    const entry = updatedLane.skills[i]!;
    const target = byId.get(entry.defaultStage) ?? byId.get("author") ?? nextStages[0];
    if (!target) continue;
    const prevAgent = existingAgentBySkill.get(bareOf(entry.skill));
    target.skills.push({
      id: makeBlockId(updatedLane.id, entry.skill, i),
      packId: updatedLane.id,
      skill: entry.skill,
      label: entry.label ?? formatSkillLabel(entry.skill),
      agent: entry.agent ?? prevAgent ?? null,
    });
  }
  return nextStages;
}

export function resetLaneToUpstream(spec: WorkflowSpecV1, laneId: string): WorkflowSpecV1 {
  const lanes = spec.lanes.map((l) =>
    l.id === laneId
      ? {
          ...l,
          forked: false,
          updatePolicy: "auto" as const,
          skills: cloneEntries(l.nativeSkills),
          pendingConflict: null,
        }
      : l,
  );
  const reset = lanes.find((l) => l.id === laneId);
  return {
    ...spec,
    lanes,
    stages: reset ? syncStageSkillsFromLaneUpdate(spec.stages, reset) : spec.stages,
  };
}

export function setLaneUpdatePolicy(
  spec: WorkflowSpecV1,
  laneId: string,
  policy: UpdatePolicy,
): WorkflowSpecV1 {
  return {
    ...spec,
    lanes: spec.lanes.map((l) => (l.id === laneId ? { ...l, updatePolicy: policy } : l)),
  };
}

export function reorderLaneSkill(
  spec: WorkflowSpecV1,
  laneId: string,
  skillName: string,
  direction: "earlier" | "later",
): WorkflowSpecV1 {
  return {
    ...spec,
    lanes: spec.lanes.map((l) => {
      if (l.id !== laneId || !l.forked) return l;
      const idx = l.skills.findIndex((e) => e.skill === skillName);
      if (idx === -1) return l;
      const target = direction === "earlier" ? idx - 1 : idx + 1;
      if (target < 0 || target >= l.skills.length) return l;
      const skills = [...l.skills];
      const [moved] = skills.splice(idx, 1);
      skills.splice(target, 0, moved!);
      return { ...l, skills };
    }),
  };
}

export function removeLaneSkill(spec: WorkflowSpecV1, laneId: string, skillName: string): WorkflowSpecV1 {
  return {
    ...spec,
    lanes: spec.lanes.map((l) =>
      l.id === laneId && l.forked
        ? { ...l, skills: l.skills.filter((e) => e.skill !== skillName) }
        : l,
    ),
  };
}

export function assignLaneSkillAgent(
  spec: WorkflowSpecV1,
  laneId: string,
  skillName: string,
  agent: string | null,
): WorkflowSpecV1 {
  return {
    ...spec,
    lanes: spec.lanes.map((l) =>
      l.id === laneId && l.forked
        ? {
            ...l,
            skills: l.skills.map((e) => (e.skill === skillName ? { ...e, agent } : e)),
          }
        : l,
    ),
  };
}

export function diffLaneFromUpstream(lane: WorkflowLaneSpec): LaneDiff {
  const nativeMap = new Map(lane.nativeSkills.map((e, i) => [e.skill, { entry: e, index: i }]));
  const localMap = new Map(lane.skills.map((e, i) => [e.skill, { entry: e, index: i }]));

  const added: LaneSkillEntry[] = [];
  const removed: LaneSkillEntry[] = [];
  const reordered: string[] = [];
  const reassigned: Array<{ skill: string; from?: string | null; to?: string | null }> = [];
  const modifiedSet = new Set<string>();

  for (const e of lane.skills) {
    if (!nativeMap.has(e.skill)) {
      added.push(e);
      modifiedSet.add(e.skill);
    }
  }
  for (const e of lane.nativeSkills) {
    if (!localMap.has(e.skill)) {
      removed.push(e);
      modifiedSet.add(e.skill);
    }
  }

  const commonNativeOrder = lane.nativeSkills.filter((e) => localMap.has(e.skill)).map((e) => e.skill);
  const commonLocalOrder = lane.skills.filter((e) => nativeMap.has(e.skill)).map((e) => e.skill);

  for (let i = 0; i < commonLocalOrder.length; i++) {
    const sk = commonLocalOrder[i]!;
    if (commonNativeOrder[i] !== sk) {
      reordered.push(sk);
      modifiedSet.add(sk);
    }
    const nEntry = nativeMap.get(sk)!.entry;
    const lEntry = localMap.get(sk)!.entry;
    if ((nEntry.agent ?? null) !== (lEntry.agent ?? null)) {
      reassigned.push({ skill: sk, from: nEntry.agent ?? null, to: lEntry.agent ?? null });
      modifiedSet.add(sk);
    }
    if (nEntry.defaultStage !== lEntry.defaultStage || (nEntry.label ?? "") !== (lEntry.label ?? "")) {
      modifiedSet.add(sk);
    }
  }

  const modified = [...modifiedSet];
  const hasChanges = added.length > 0 || removed.length > 0 || reordered.length > 0 || reassigned.length > 0 || modified.length > 0;
  return { hasChanges, added, removed, reordered, reassigned, modified };
}

/**
 * 3-way merge check against an upstream snapshot:
 * - Unforked lanes update cleanly and snapshot the prior version into `versions`.
 * - Forked lanes compute conflicts against `nativeSkills` (base), `skills` (local), and `upstream.skills` (upstream).
 *   If any conflict exists, pauses with `pendingConflict` and NEVER overwrites user edits.
 */
export function applyUpstreamCheck(
  spec: WorkflowSpecV1,
  laneId: string,
  upstream: UpstreamLaneSnapshot,
  nowIso: string = new Date().toISOString(),
): WorkflowSpecV1 {
  const lanes = spec.lanes.map((lane) => {
    if (lane.id !== laneId) return lane;
    if (lane.source.commit === upstream.commit && lane.source.digest === upstream.digest) {
      return lane;
    }

    const snapshot: LaneVersionSnapshot = {
      version: lane.versions.length + 1,
      commit: lane.source.commit,
      digest: lane.source.digest,
      recordedAt: nowIso,
      summary: upstream.summary ?? `Before update to ${upstream.commit.slice(0, 7)}`,
      skills: cloneEntries(lane.skills),
    };

    if (!lane.forked) {
      return {
        ...lane,
        source: { ...lane.source, commit: upstream.commit, digest: upstream.digest },
        nativeSkills: cloneEntries(upstream.skills),
        skills: cloneEntries(upstream.skills),
        versions: [...lane.versions, snapshot],
        pendingConflict: null,
      };
    }

    // 3-way merge for a forked lane
    const baseMap = new Map(lane.nativeSkills.map((e, i) => [e.skill, { entry: e, index: i }]));
    const localMap = new Map(lane.skills.map((e, i) => [e.skill, { entry: e, index: i }]));
    const upMap = new Map(upstream.skills.map((e, i) => [e.skill, { entry: e, index: i }]));

    const conflicts: LaneConflict[] = [];
    const allSkills = new Set([...baseMap.keys(), ...localMap.keys(), ...upMap.keys()]);

    for (const sk of allSkills) {
      const base = baseMap.get(sk);
      const local = localMap.get(sk);
      const up = upMap.get(sk);

      const localChanged =
        Boolean(base) !== Boolean(local) ||
        (base &&
          local &&
          (base.entry.defaultStage !== local.entry.defaultStage ||
            (base.entry.agent ?? null) !== (local.entry.agent ?? null) ||
            (base.entry.label ?? "") !== (local.entry.label ?? "")));
      const upChanged =
        Boolean(base) !== Boolean(up) ||
        (base &&
          up &&
          (base.entry.defaultStage !== up.entry.defaultStage ||
            (base.entry.digest ?? "") !== (up.entry.digest ?? "") ||
            (base.entry.label ?? "") !== (up.entry.label ?? "")));

      if (base && local && !up && localChanged) {
        conflicts.push({ skill: sk, reason: "removed-upstream-edited-locally", localEntry: { ...local.entry } });
      } else if (localChanged && upChanged) {
        conflicts.push({
          skill: sk,
          reason: "modified-both",
          ...(local ? { localEntry: { ...local.entry } } : {}),
          ...(up ? { upstreamEntry: { ...up.entry } } : {}),
        });
      } else if (base && local && up && base.index !== local.index && base.index !== up.index && local.index !== up.index) {
        conflicts.push({
          skill: sk,
          reason: "reordered-both",
          localEntry: { ...local.entry },
          upstreamEntry: { ...up.entry },
        });
      }
    }

    if (conflicts.length > 0) {
      return {
        ...lane,
        pendingConflict: {
          fromCommit: lane.source.commit,
          toCommit: upstream.commit,
          toDigest: upstream.digest,
          upstreamSkills: cloneEntries(upstream.skills),
          conflicts,
        },
      };
    }

    // Clean 3-way merge: preserve local edits & add brand-new upstream skills
    const merged: LaneSkillEntry[] = lane.skills.map((e) => {
      const up = upMap.get(e.skill);
      const base = baseMap.get(e.skill);
      if (up && base && (e.agent ?? null) === (base.entry.agent ?? null) && e.defaultStage === base.entry.defaultStage) {
        return { ...up.entry };
      }
      return { ...e };
    });
    for (const upEntry of upstream.skills) {
      if (!baseMap.has(upEntry.skill) && !localMap.has(upEntry.skill)) {
        merged.push({ ...upEntry });
      }
    }

    return {
      ...lane,
      source: { ...lane.source, commit: upstream.commit, digest: upstream.digest },
      nativeSkills: cloneEntries(upstream.skills),
      skills: merged,
      versions: [...lane.versions, snapshot],
      pendingConflict: null,
    };
  });

  const updated = lanes.find((l) => l.id === laneId);
  const stages = updated && !updated.pendingConflict ? syncStageSkillsFromLaneUpdate(spec.stages, updated) : spec.stages;
  return { ...spec, lanes, stages };
}

export function resolveLaneConflict(
  spec: WorkflowSpecV1,
  laneId: string,
  resolutions: Record<string, ConflictChoice>,
  nowIso: string = new Date().toISOString(),
): WorkflowSpecV1 {
  const lanes = spec.lanes.map((lane) => {
    if (lane.id !== laneId || !lane.pendingConflict) return lane;
    const pending = lane.pendingConflict;
    const snapshot: LaneVersionSnapshot = {
      version: lane.versions.length + 1,
      commit: lane.source.commit,
      digest: lane.source.digest,
      recordedAt: nowIso,
      summary: `Resolved conflicts updating to ${pending.toCommit.slice(0, 7)}`,
      skills: cloneEntries(lane.skills),
    };

    const conflictMap = new Map(pending.conflicts.map((c) => [c.skill, c]));
    const upMap = new Map(pending.upstreamSkills.map((e) => [e.skill, e]));
    const nextSkills: LaneSkillEntry[] = [];
    const seen = new Set<string>();

    for (const localEntry of lane.skills) {
      const conflict = conflictMap.get(localEntry.skill);
      if (!conflict) {
        nextSkills.push({ ...localEntry });
        seen.add(localEntry.skill);
        continue;
      }
      const choice = resolutions[localEntry.skill] ?? "mine";
      if (choice === "mine") {
        nextSkills.push({ ...localEntry });
        seen.add(localEntry.skill);
      } else {
        const upEntry = upMap.get(localEntry.skill);
        if (upEntry) {
          nextSkills.push({ ...upEntry });
          seen.add(upEntry.skill);
        }
      }
    }

    // Add any new upstream entries not yet in local
    for (const upEntry of pending.upstreamSkills) {
      if (!seen.has(upEntry.skill)) {
        const conflict = conflictMap.get(upEntry.skill);
        const choice = conflict ? (resolutions[upEntry.skill] ?? "mine") : "upstream";
        if (choice === "upstream") {
          nextSkills.push({ ...upEntry });
          seen.add(upEntry.skill);
        }
      }
    }

    return {
      ...lane,
      source: { ...lane.source, commit: pending.toCommit, digest: pending.toDigest },
      nativeSkills: cloneEntries(pending.upstreamSkills),
      skills: nextSkills,
      versions: [...lane.versions, snapshot],
      pendingConflict: null,
    };
  });

  const updated = lanes.find((l) => l.id === laneId);
  return {
    ...spec,
    lanes,
    stages: updated ? syncStageSkillsFromLaneUpdate(spec.stages, updated) : spec.stages,
  };
}

export function rollbackLane(
  spec: WorkflowSpecV1,
  laneId: string,
  targetVersion?: number,
): WorkflowSpecV1 {
  const lanes = spec.lanes.map((lane) => {
    if (lane.id !== laneId || lane.versions.length === 0) return lane;
    const target =
      targetVersion !== undefined
        ? lane.versions.find((v) => v.version === targetVersion)
        : lane.versions[lane.versions.length - 1];
    if (!target) return lane;
    const nextVer = Math.max(...lane.versions.map((v) => v.version)) + 1;
    const preRollbackSnapshot: LaneVersionSnapshot = {
      version: nextVer,
      commit: lane.source.commit,
      digest: lane.source.digest,
      recordedAt: new Date().toISOString(),
      summary: `Before rollback to v${target.version}`,
      skills: cloneEntries(lane.skills),
    };
    return {
      ...lane,
      source: { ...lane.source, commit: target.commit, digest: target.digest },
      skills: cloneEntries(target.skills),
      versions: [...lane.versions, preRollbackSnapshot],
      pendingConflict: null,
    };
  });

  const updated = lanes.find((l) => l.id === laneId);
  return {
    ...spec,
    lanes,
    stages: updated ? syncStageSkillsFromLaneUpdate(spec.stages, updated) : spec.stages,
  };
}

/* ─────────────────────────── Custom Packs & Import/Export ─────────────────────────── */

export function createCustomPack(
  spec: WorkflowSpecV1,
  options: { name: string; fromLaneId?: string },
): WorkflowSpecV1 {
  const cleanName = options.name.trim() || "Custom pack";
  const slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "custom-pack";
  let id = `custom-${slug}`;
  let n = 2;
  while (spec.lanes.some((l) => l.id === id)) {
    id = `custom-${slug}-${n++}`;
  }
  const sourceLane = options.fromLaneId ? spec.lanes.find((l) => l.id === options.fromLaneId) : undefined;
  const skills = sourceLane ? cloneEntries(sourceLane.skills) : [];
  const newLane: WorkflowLaneSpec = {
    id,
    name: cleanName,
    kind: "custom",
    enabled: true,
    source: {
      type: "custom",
      commit: "local-v1",
      digest: `sha256:custom-${id}`,
      license: "MIT",
    },
    forked: true,
    updatePolicy: "freeze",
    nativeSkills: cloneEntries(skills),
    skills,
    versions: [],
    pendingConflict: null,
  };
  return {
    ...spec,
    lanes: [...spec.lanes, newLane],
  };
}

export function exportPackJson(lane: WorkflowLaneSpec): string {
  return JSON.stringify(
    {
      schema_version: "1.0.0",
      kind: "control-rod-custom-pack",
      exportedAt: new Date().toISOString(),
      lane: cloneLane(lane),
    },
    null,
    2,
  );
}

export function importPackJson(spec: WorkflowSpecV1, rawJson: string): WorkflowSpecV1 {
  const parsed = JSON.parse(rawJson) as {
    schema_version?: string;
    kind?: string;
    lane?: Partial<WorkflowLaneSpec>;
    pack?: {
      id?: string;
      name?: string;
      kind?: LaneKind;
      source?: WorkflowLaneSpec["source"];
      skills?: LaneSkillEntry[];
    };
  };
  const pack = parsed.lane ?? parsed.pack ?? (parsed as unknown as WorkflowLaneSpec);
  if (!pack || typeof pack.name !== "string" || !Array.isArray(pack.skills)) {
    throw new Error("Invalid pack JSON: expected name and skills array.");
  }
  const baseId = (pack.id ?? pack.name).toLowerCase().replace(/[^a-z0-9-]+/g, "-") || "imported-pack";
  let id = baseId;
  let n = 2;
  while (spec.lanes.some((l) => l.id === id)) {
    id = `${baseId}-${n++}`;
  }
  const skills = pack.skills.map((s) => ({
    skill: String(s.skill),
    label: s.label ?? formatSkillLabel(String(s.skill)),
    defaultStage: s.defaultStage || "author",
    ...(s.digest ? { digest: s.digest } : {}),
    ...(s.agent !== undefined ? { agent: s.agent } : {}),
  }));
  const lane: WorkflowLaneSpec = {
    id,
    name: pack.name,
    kind: "custom",
    enabled: true,
    source: {
      type: "file",
      ...(pack.source?.url ? { url: pack.source.url } : {}),
      commit: pack.source?.commit ?? "imported-file",
      digest: pack.source?.digest ?? `sha256:imported-${id}`,
      license: pack.source?.license ?? "MIT",
    },
    forked: true,
    updatePolicy: "freeze",
    nativeSkills: cloneEntries(skills),
    skills,
    versions: [],
    pendingConflict: null,
  };
  return {
    ...spec,
    lanes: [...spec.lanes, lane],
  };
}

export function addImportedRepoLane(
  spec: WorkflowSpecV1,
  lane: WorkflowLaneSpec,
): WorkflowSpecV1 {
  const exists = spec.lanes.some((l) => l.id === lane.id);
  return {
    ...spec,
    lanes: exists ? spec.lanes.map((l) => (l.id === lane.id ? cloneLane(lane) : l)) : [...spec.lanes, cloneLane(lane)],
  };
}

export function addUserModel(spec: WorkflowSpecV1, modelName: string): WorkflowSpecV1 {
  const trimmed = modelName.trim();
  if (!trimmed) return spec;
  const formatted = trimmed.startsWith("user:") ? trimmed : `user:${trimmed}`;
  if (spec.userModels.includes(formatted)) return spec;
  return {
    ...spec,
    userModels: [...spec.userModels, formatted],
  };
}

/* ─────────────────────────── Validation ─────────────────────────── */

function vendorForAgent(agentId: string): string {
  const builtin = AGENTS.find((a) => a.id === (agentId as AgentId));
  return builtin ? builtin.vendor.toLowerCase() : agentId.toLowerCase();
}

export function displayNameForAgent(agentId: string): string {
  const builtin = AGENTS.find((a) => a.id === (agentId as AgentId));
  if (builtin) return builtin.name;
  return agentId.startsWith("user:") ? agentId.slice(5) : agentId;
}

export function stageDefaultAgent(stage: WorkflowStageSpec, council: Council): string | null {
  if (stage.isBlindChecker || stage.role === "pre-check") {
    return council.checker?.id ?? null;
  }
  return council.author?.id ?? null;
}

export function validateWorkflowSpec(spec: WorkflowSpecV1, council: Council): WorkflowValidationResult {
  const errors: WorkflowValidationIssue[] = [];
  const warnings: WorkflowValidationIssue[] = [];
  const blockViolations: Record<string, WorkflowValidationIssue[]> = {};

  const recordBlock = (blockId: string, issue: WorkflowValidationIssue) => {
    if (!blockViolations[blockId]) blockViolations[blockId] = [];
    blockViolations[blockId]!.push(issue);
  };

  // Collect effective author agents
  const authorStages = spec.stages.filter((s) => s.role === "author");
  const effectiveAuthors = new Set<string>();
  for (const st of authorStages) {
    if (st.skills.length === 0 && council.author) {
      effectiveAuthors.add(council.author.id);
    }
    for (const blk of st.skills) {
      const eff = blk.agent ?? council.author?.id ?? null;
      if (eff) effectiveAuthors.add(eff);
    }
  }
  if (effectiveAuthors.size === 0 && council.author) {
    effectiveAuthors.add(council.author.id);
  }
  const effectiveAuthorVendors = new Set([...effectiveAuthors].map(vendorForAgent));

  // Validate blind checker stages
  for (const stage of spec.stages) {
    const isChecker = Boolean(stage.isBlindChecker) || stage.role === "pre-check";
    if (!isChecker) continue;

    if (stage.allowFallback) {
      errors.push({
        code: "BLIND_CHECKER_FALLBACK_FORBIDDEN",
        severity: "error",
        stageId: stage.id,
        message: `Blind checker stage "${stage.label}" cannot enable fallback (ADR 0024).`,
      });
    }

    if (stage.skills.length === 0 && council.checker) {
      const effChecker = council.checker.id;
      if (effectiveAuthors.has(effChecker) || effectiveAuthorVendors.has(vendorForAgent(effChecker))) {
        errors.push({
          code: "BLIND_CHECKER_SAME_AS_AUTHOR",
          severity: "error",
          stageId: stage.id,
          message: `Blind checker stage "${stage.label}" resolves to ${displayNameForAgent(effChecker)}, which matches the author.`,
        });
      }
    }

    for (const blk of stage.skills) {
      const effChecker = blk.agent ?? council.checker?.id ?? null;
      if (!effChecker) continue;
      if (effectiveAuthors.has(effChecker) || effectiveAuthorVendors.has(vendorForAgent(effChecker))) {
        const issue: WorkflowValidationIssue = {
          code: "BLIND_CHECKER_SAME_AS_AUTHOR",
          severity: "error",
          stageId: stage.id,
          blockId: blk.id,
          message: `Blind checker skill "${blk.label ?? blk.skill}" cannot use ${displayNameForAgent(effChecker)} because it matches the author.`,
        };
        errors.push(issue);
        recordBlock(blk.id, issue);
      }
    }
  }

  // Validate Nuclear-Grade pack requirements (lane-level and stage-canvas edits)
  if (spec.contextDepth === "nuclear") {
    const nuclearLane = spec.lanes.find((l) => l.id === "nuclear-grade" || l.nuclearRequired);
    if (!nuclearLane || !nuclearLane.enabled || nuclearLane.packError) {
      errors.push({
        code: "NUCLEAR_PACK_BLOCKED",
        severity: "error",
        ...(nuclearLane ? { laneId: nuclearLane.id } : {}),
        message: nuclearLane?.packError
          ? `Nuclear-Grade pack blocked: ${nuclearLane.packError}`
          : "Nuclear-Grade pack is required when Nuclear context depth is enabled.",
      });
    } else {
      const bareOf = (s: string) => (s.includes(":") ? s.slice(s.indexOf(":") + 1) : s);
      const stageBlocks = spec.stages.flatMap((st) =>
        st.skills
          .filter((b) => b.packId === nuclearLane.id)
          .map((b) => ({ skill: bareOf(b.skill), stageId: st.id, agent: b.agent ?? null })),
      );
      const nativeCore = nuclearLane.nativeSkills.map((e) => ({
        skill: bareOf(e.skill),
        defaultStage: e.defaultStage,
      }));
      const missingFromStages = nativeCore.some((n) => !stageBlocks.some((b) => b.skill === n.skill));
      const stageReassigned = stageBlocks.some((b) => Boolean(b.agent));
      const movedStage = stageBlocks.some((b) => {
        const expected = nativeCore.find((n) => n.skill === b.skill);
        return expected !== undefined && expected.defaultStage !== b.stageId;
      });
      const stageOrderChanged =
        movedStage ||
        spec.stages.some((st) => {
          const expectedInStage = nativeCore.filter((n) => n.defaultStage === st.id).map((n) => n.skill);
          const actualInStage = stageBlocks.filter((b) => b.stageId === st.id).map((b) => b.skill);
          if (expectedInStage.length !== actualInStage.length) return true;
          return expectedInStage.some((sk, idx) => actualInStage[idx] !== sk);
        });
      if (nuclearLane.forked || diffLaneFromUpstream(nuclearLane).hasChanges || missingFromStages || stageReassigned || stageOrderChanged) {
        warnings.push({
          code: "NUCLEAR_LANE_MODIFIED",
          severity: "warning",
          laneId: nuclearLane.id,
          message: "Nuclear lane modified — flagged before run",
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    blockViolations,
  };
}
