/**
 * Declarative workflow specification (WorkflowSpecV1), built-in pack catalog loader,
 * structural & safety validation, 3-way lane update merge with conflict pause/resolution,
 * version rollback, upstream HTTPS repo import, and custom pack export/import.
 *
 * Pure logic except for `buildCatalog` (reads verified packs from disk) and
 * `importSkillsFromRepoUrl` (uses injectable fetch for HTTPS repo inspection).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadNuclearPack } from "./context-profile.js";
import { loadWorkflowPacks, type PackWorkflow, type WorkflowPack } from "./workflow.js";

export const WORKFLOW_SPEC_VERSION = "1.0.0" as const;

export type WorkflowStageRole = "intake" | "author" | "pre-check" | "review" | "ship" | "custom";
export type UpdatePolicy = "auto" | "freeze";
export type LaneKind = "workflow" | "context" | "custom";
export type ContextDepth = "light" | "nuclear";
export type WorkflowPreset = "playbook" | "superpowers" | "pocock" | "pocock-superpowers" | "custom";
export type WorkflowCheckIn = "start" | "start-and-merge" | "every-step";

export interface SkillBlockSpec {
  id: string;
  packId: string;
  skill: string;
  label?: string;
  agent?: string | null;
}

export interface WorkflowStageSpec {
  id: string;
  label: string;
  role: WorkflowStageRole;
  built: boolean;
  isBlindChecker?: boolean;
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
  preset: WorkflowPreset;
  contextDepth: ContextDepth;
  checkIn: WorkflowCheckIn;
  stages: WorkflowStageSpec[];
  lanes: WorkflowLaneSpec[];
  userModels: string[];
  updatedAt?: string;
}

export interface WorkflowCatalog {
  workflowLanes: WorkflowLaneSpec[];
  contextLanes: WorkflowLaneSpec[];
  customLanes: WorkflowLaneSpec[];
  presets: readonly WorkflowPreset[];
}

export interface WorkflowRuleViolation {
  code: string;
  severity: "error" | "warning";
  message: string;
  stageId?: string;
  blockId?: string;
  laneId?: string;
}

export interface WorkflowValidationResult {
  valid: boolean;
  errors: WorkflowRuleViolation[];
  warnings: WorkflowRuleViolation[];
}

export interface CouncilSeats {
  author?: string | null;
  checker?: string | null;
  intake?: string | null;
}

export interface LaneDiff {
  modified: boolean;
  added: string[];
  removed: string[];
  reordered: boolean;
  reassigned: {
    skill: string;
    from?: string | null;
    to?: string | null;
    fromAgent?: string | null;
    toAgent?: string | null;
  }[];
}

export type LaneMergeResult =
  | { status: "up_to_date"; lane: WorkflowLaneSpec; summary: string }
  | { status: "updated"; lane: WorkflowLaneSpec; summary: string }
  | { status: "conflict_paused"; lane: WorkflowLaneSpec; conflicts: LaneConflict[]; summary: string };

export interface RepoFetcherResponse {
  ok: boolean;
  status: number;
  url?: string;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}

export type RepoFetcher = (url: string, init?: RequestInit) => Promise<RepoFetcherResponse>;

export interface CustomPackEnvelope {
  schema_version: "1.0.0";
  kind: "control-rod-custom-pack";
  exportedAt: string;
  lane: WorkflowLaneSpec;
}

/* ---------- helpers ---------- */

const VALID_ROLES = new Set<WorkflowStageRole>(["intake", "author", "pre-check", "review", "ship", "custom"]);
const VALID_UPDATE_POLICIES = new Set<UpdatePolicy>(["auto", "freeze"]);
const VALID_LANE_KINDS = new Set<LaneKind>(["workflow", "context", "custom"]);
const VALID_CONTEXT_DEPTHS = new Set<ContextDepth>(["light", "nuclear"]);
const VALID_PRESETS = new Set<WorkflowPreset>(["playbook", "superpowers", "pocock", "pocock-superpowers", "custom"]);
const VALID_CHECK_INS = new Set<WorkflowCheckIn>(["start", "start-and-merge", "every-step"]);
const VALID_SOURCE_TYPES = new Set(["builtin", "git-url", "custom", "file"]);

export function sha256Hex(data: string | Buffer): string {
  return `sha256:${createHash("sha256").update(data).digest("hex")}`;
}

function humanizeSlug(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function cloneEntry(e: LaneSkillEntry): LaneSkillEntry {
  const out: LaneSkillEntry = {
    skill: e.skill,
    defaultStage: e.defaultStage,
  };
  if (e.label !== undefined) out.label = e.label;
  if (e.digest !== undefined) out.digest = e.digest;
  if (e.agent !== undefined) out.agent = e.agent;
  return out;
}

function cloneSkills(entries: readonly LaneSkillEntry[]): LaneSkillEntry[] {
  return entries.map(cloneEntry);
}

function cloneLane(lane: WorkflowLaneSpec): WorkflowLaneSpec {
  return JSON.parse(JSON.stringify(lane)) as WorkflowLaneSpec;
}

/**
 * Normalizes a runtime / provider / agent name to its canonical vendor key, matching work.ts
 * `runtimeName` semantics so blind-checker independence checks cannot be bypassed via aliases.
 */
export function normalizeAgentVendor(agent: string | null | undefined): string | null {
  if (typeof agent !== "string") return null;
  const trimmed = agent.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed === "anthropic" || trimmed === "claude" || trimmed === "claude-code") return "claude";
  if (trimmed === "openai" || trimmed === "codex") return "codex";
  if (trimmed === "xai" || trimmed === "grok") return "grok";
  if (trimmed === "google" || trimmed === "gemini" || trimmed === "agy" || trimmed === "antigravity") return "agy";
  return trimmed;
}

/** Maps a workflow.json stage + skill name to one of the 6 default editor stages. */
function defaultStageForWorkflowSkill(stage: "intake" | "author" | "pre-check", skill: string): string {
  if (stage === "pre-check") return "check";
  if (stage === "author") return "author";
  // intake splits into brainstorm vs plan
  const lower = skill.toLowerCase();
  if (
    lower.includes("plan") ||
    lower.includes("spec") ||
    lower.includes("ticket") ||
    lower.includes("retro") ||
    lower.includes("subagent")
  ) {
    return "plan";
  }
  return "brainstorm";
}

function defaultStageForNuclearSkill(skill: string): string {
  switch (skill) {
    case "questioning-attitude":
      return "brainstorm";
    case "rating-change-risk":
    case "staying-on-mission":
      return "plan";
    case "proving-claims":
    case "double-checking-before-acting":
      return "author";
    case "checking-release-readiness":
    case "learning-from-experience":
      return "check";
    default:
      return "author";
  }
}

function computeSkillDigest(files: { name: string; bytes: Buffer }[]): string {
  const hash = createHash("sha256");
  for (const f of [...files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    hash.update(f.name);
    hash.update("\0");
    hash.update(f.bytes);
    hash.update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}

function computeLaneDigest(entries: readonly LaneSkillEntry[], commit: string): string {
  const hash = createHash("sha256");
  hash.update(commit);
  hash.update("\0");
  for (const e of entries) {
    hash.update(`${e.skill}:${e.defaultStage}:${e.digest ?? ""}\n`);
  }
  return `sha256:${hash.digest("hex")}`;
}

/* ---------- catalog loader ---------- */

interface PinEntry {
  upstream?: string;
  commit?: string;
  license?: string;
}

function readPins(workflowsDir: string): Record<string, PinEntry> {
  const p = join(workflowsDir, "pins.json");
  if (!existsSync(p)) return {};
  try {
    const raw = JSON.parse(readFileSync(p, "utf8"));
    return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, PinEntry>) : {};
  } catch {
    return {};
  }
}

function buildWorkflowLaneFromPack(
  id: "superpowers" | "pocock",
  pack: WorkflowPack,
  pin: PinEntry | undefined,
): WorkflowLaneSpec {
  const seen = new Set<string>();
  const entries: LaneSkillEntry[] = [];
  const stageOrder: readonly ("intake" | "author" | "pre-check")[] = ["intake", "author", "pre-check"];

  for (const st of stageOrder) {
    for (const ref of pack.stages[st].skills) {
      if (ref.pack !== id || seen.has(ref.skill)) continue;
      seen.add(ref.skill);
      const files = pack.skills[ref.skill] ?? [];
      entries.push({
        skill: ref.skill,
        label: humanizeSlug(ref.skill),
        defaultStage: defaultStageForWorkflowSkill(st, ref.skill),
        digest: computeSkillDigest(files),
      });
    }
  }

  // Include any remaining verified skills in the pack not yet listed in stages
  for (const skill of Object.keys(pack.skills).sort()) {
    if (seen.has(skill)) continue;
    seen.add(skill);
    entries.push({
      skill,
      label: humanizeSlug(skill),
      defaultStage: "author",
      digest: computeSkillDigest(pack.skills[skill] ?? []),
    });
  }

  const commit = pack.commits[id] ?? pin?.commit ?? "unknown";
  const digest = computeLaneDigest(entries, commit);

  return {
    id,
    name: pack.name,
    kind: "workflow",
    enabled: false,
    source: {
      type: "builtin",
      ...(pin?.upstream ? { url: pin.upstream } : {}),
      commit,
      digest,
      ...(pin?.license ? { license: pin.license } : {}),
    },
    forked: false,
    updatePolicy: "auto",
    nativeSkills: cloneSkills(entries),
    skills: cloneSkills(entries),
    versions: [],
    pendingConflict: null,
    packError: null,
  };
}

/**
 * Loads built-in workflow packs (`packs/workflows/`) and context packs (`packs/nuclear-grade/` + Light)
 * from `rootDir`. Any pack verification/integrity failure is captured cleanly into `lane.packError`
 * rather than crashing catalog construction.
 */
export function buildCatalog(rootDir: string, customLanes: WorkflowLaneSpec[] = []): WorkflowCatalog {
  const workflowsDir = join(rootDir, "packs", "workflows");
  const pins = readPins(workflowsDir);
  const workflowLanes: WorkflowLaneSpec[] = [];

  for (const id of ["superpowers", "pocock"] as const) {
    const pin = pins[id];
    try {
      const packs = loadWorkflowPacks(workflowsDir, id as PackWorkflow);
      const pack = packs[id];
      if (!pack) {
        workflowLanes.push({
          id,
          name: humanizeSlug(id),
          kind: "workflow",
          enabled: false,
          source: {
            type: "builtin",
            ...(pin?.upstream ? { url: pin.upstream } : {}),
            commit: pin?.commit ?? "uninstalled",
            digest: sha256Hex(`${id}:uninstalled`),
            ...(pin?.license ? { license: pin.license } : {}),
          },
          forked: false,
          updatePolicy: "auto",
          nativeSkills: [],
          skills: [],
          versions: [],
          pendingConflict: null,
          packError: `workflow pack ${id} is not installed`,
        });
      } else {
        workflowLanes.push(buildWorkflowLaneFromPack(id, pack, pin));
      }
    } catch (e) {
      workflowLanes.push({
        id,
        name: humanizeSlug(id),
        kind: "workflow",
        enabled: false,
        source: {
          type: "builtin",
          ...(pin?.upstream ? { url: pin.upstream } : {}),
          commit: pin?.commit ?? "unknown",
          digest: sha256Hex(`${id}:error`),
          ...(pin?.license ? { license: pin.license } : {}),
        },
        forked: false,
        updatePolicy: "auto",
        nativeSkills: [],
        skills: [],
        versions: [],
        pendingConflict: null,
        packError: (e as Error).message,
      });
    }
  }

  // Context lanes: Light + Nuclear-Grade
  const lightLane: WorkflowLaneSpec = {
    id: "light",
    name: "Light",
    kind: "context",
    enabled: true,
    source: {
      type: "builtin",
      commit: "builtin-light",
      digest: sha256Hex("control-rod:context:light"),
      license: "MIT",
    },
    forked: false,
    updatePolicy: "auto",
    nativeSkills: [],
    skills: [],
    versions: [],
    pendingConflict: null,
    nuclearRequired: false,
    packError: null,
  };

  const nuclearDir = join(rootDir, "packs", "nuclear-grade");
  let nuclearLane: WorkflowLaneSpec;
  try {
    const manifestPath = join(nuclearDir, "manifest.json");
    const rawManifest = existsSync(manifestPath)
      ? (JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>)
      : null;
    const pack = loadNuclearPack(nuclearDir);
    if (!pack) {
      nuclearLane = {
        id: "nuclear-grade",
        name: "Nuclear-Grade",
        kind: "context",
        enabled: false,
        source: {
          type: "builtin",
          commit: "uninstalled",
          digest: sha256Hex("nuclear-grade:uninstalled"),
          license: "MIT",
        },
        forked: false,
        updatePolicy: "auto",
        nativeSkills: [],
        skills: [],
        versions: [],
        pendingConflict: null,
        nuclearRequired: true,
        packError: "nuclear-grade pack is not installed",
      };
    } else {
      const entries: LaneSkillEntry[] = pack.core.skills.map((skill) => {
        const bytes = pack.skills[skill];
        return {
          skill,
          label: humanizeSlug(skill),
          defaultStage: defaultStageForNuclearSkill(skill),
          digest: bytes ? sha256Hex(bytes) : sha256Hex(skill),
        };
      });
      const digest = computeLaneDigest(entries, pack.commit);
      nuclearLane = {
        id: "nuclear-grade",
        name: "Nuclear-Grade",
        kind: "context",
        enabled: false,
        source: {
          type: "builtin",
          ...(typeof rawManifest?.upstream === "string" ? { url: rawManifest.upstream } : {}),
          commit: pack.commit,
          digest,
          license: typeof rawManifest?.license === "string" ? rawManifest.license : "MIT",
        },
        forked: false,
        updatePolicy: "auto",
        nativeSkills: cloneSkills(entries),
        skills: cloneSkills(entries),
        versions: [],
        pendingConflict: null,
        nuclearRequired: true,
        packError: null,
      };
    }
  } catch (e) {
    nuclearLane = {
      id: "nuclear-grade",
      name: "Nuclear-Grade",
      kind: "context",
      enabled: false,
      source: {
        type: "builtin",
        commit: "unknown",
        digest: sha256Hex("nuclear-grade:error"),
        license: "MIT",
      },
      forked: false,
      updatePolicy: "auto",
      nativeSkills: [],
      skills: [],
      versions: [],
      pendingConflict: null,
      nuclearRequired: true,
      packError: (e as Error).message,
    };
  }

  return {
    workflowLanes,
    contextLanes: [lightLane, nuclearLane],
    customLanes: customLanes.map(cloneLane),
    presets: ["playbook", "superpowers", "pocock", "pocock-superpowers", "custom"],
  };
}

/* ---------- preset builder ---------- */

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

const PRESET_NAMES: Record<WorkflowPreset, string> = {
  playbook: "Plain Playbook",
  superpowers: "Superpowers",
  pocock: "Pocock",
  "pocock-superpowers": "Pocock Superpowers",
  custom: "Custom Workflow",
};

/**
 * Builds a complete `WorkflowSpecV1` for a given preset and context depth from the loaded catalog.
 */
export function buildPresetSpec(
  preset: WorkflowPreset,
  contextDepth: ContextDepth,
  catalog: WorkflowCatalog,
  checkIn: WorkflowCheckIn = "start-and-merge",
): WorkflowSpecV1 {
  const stages = defaultStages();
  const stageById = new Map(stages.map((s) => [s.id, s]));

  const enabledWorkflowIds = new Set<string>(
    preset === "superpowers"
      ? ["superpowers"]
      : preset === "pocock"
        ? ["pocock"]
        : preset === "pocock-superpowers"
          ? ["pocock", "superpowers"]
          : [],
  );

  // Order workflow lanes so pocock-superpowers puts pocock first, matching the hybrid pack
  const orderedWorkflowLanes = [...catalog.workflowLanes].sort((a, b) => {
    if (preset === "pocock-superpowers") {
      if (a.id === "pocock" && b.id !== "pocock") return -1;
      if (b.id === "pocock" && a.id !== "pocock") return 1;
    }
    return 0;
  });

  const lanes: WorkflowLaneSpec[] = [
    ...orderedWorkflowLanes.map((l) => {
      const cloned = cloneLane(l);
      cloned.enabled = enabledWorkflowIds.has(cloned.id);
      return cloned;
    }),
    ...catalog.contextLanes.map((l) => {
      const cloned = cloneLane(l);
      if (cloned.id === "nuclear-grade") {
        cloned.enabled = contextDepth === "nuclear";
        cloned.nuclearRequired = contextDepth === "nuclear";
      } else if (cloned.id === "light") {
        cloned.enabled = contextDepth === "light";
      }
      return cloned;
    }),
    ...catalog.customLanes.map((l) => {
      const cloned = cloneLane(l);
      cloned.enabled = false;
      return cloned;
    }),
  ];

  // Populate stages from enabled lanes
  for (const lane of lanes) {
    if (!lane.enabled) continue;
    for (const entry of lane.skills) {
      const target = stageById.get(entry.defaultStage) ?? stageById.get("author")!;
      const block: SkillBlockSpec = {
        id: `${target.id}:${lane.id}:${entry.skill}`,
        packId: lane.id,
        skill: entry.skill,
        ...(entry.label !== undefined ? { label: entry.label } : {}),
        ...(entry.agent !== undefined ? { agent: entry.agent } : {}),
      };
      target.skills.push(block);
    }
  }

  return {
    schema_version: WORKFLOW_SPEC_VERSION,
    id: `${preset}-${contextDepth}`,
    name: PRESET_NAMES[preset] ?? humanizeSlug(preset),
    preset,
    contextDepth,
    checkIn,
    stages,
    lanes,
    userModels: [],
  };
}

/* ---------- serialization & parsing ---------- */

function assertString(v: unknown, field: string): string {
  if (typeof v !== "string" || !v.length) throw new Error(`Invalid workflow spec: ${field} must be a non-empty string`);
  return v;
}

const SLUG_SAFE = /^[a-z0-9][a-z0-9._-]*$/i;

function assertSafeSlug(v: unknown, field: string): string {
  const s = assertString(v, field);
  if (s.includes("..") || !SLUG_SAFE.test(s)) {
    throw new Error(`Invalid workflow spec: ${field} contains unsafe path characters`);
  }
  return s;
}

function assertSafeSkillRef(v: unknown, field: string): string {
  const s = assertString(v, field);
  if (s.includes("..") || s.includes("/") || s.includes("\\") || s.includes("\0")) {
    throw new Error(`Invalid workflow spec: ${field} contains unsafe path characters`);
  }
  if (s.includes(":")) {
    const idx = s.indexOf(":");
    const ns = s.slice(0, idx);
    const bare = s.slice(idx + 1);
    if (!SLUG_SAFE.test(ns) || !SLUG_SAFE.test(bare)) {
      throw new Error(`Invalid workflow spec: ${field} must be a valid skill reference`);
    }
    return s;
  }
  if (!SLUG_SAFE.test(s)) {
    throw new Error(`Invalid workflow spec: ${field} must be a valid skill slug`);
  }
  return s;
}

function assertBoolean(v: unknown, field: string): boolean {
  if (typeof v !== "boolean") throw new Error(`Invalid workflow spec: ${field} must be a boolean`);
  return v;
}

function parseLaneSkillEntry(raw: unknown, path: string): LaneSkillEntry {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`Invalid workflow spec: ${path} must be an object`);
  const o = raw as Record<string, unknown>;
  const entry: LaneSkillEntry = {
    skill: assertSafeSkillRef(o.skill, `${path}.skill`),
    defaultStage: assertSafeSlug(o.defaultStage, `${path}.defaultStage`),
  };
  if (o.label !== undefined) {
    if (typeof o.label !== "string") throw new Error(`Invalid workflow spec: ${path}.label must be a string`);
    entry.label = o.label;
  }
  if (o.digest !== undefined) {
    if (typeof o.digest !== "string") throw new Error(`Invalid workflow spec: ${path}.digest must be a string`);
    entry.digest = o.digest;
  }
  if (o.agent !== undefined) {
    if (o.agent !== null && typeof o.agent !== "string") throw new Error(`Invalid workflow spec: ${path}.agent must be a string or null`);
    entry.agent = o.agent;
  }
  return entry;
}

function parseSkillBlock(raw: unknown, path: string): SkillBlockSpec {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`Invalid workflow spec: ${path} must be an object`);
  const o = raw as Record<string, unknown>;
  const block: SkillBlockSpec = {
    id: assertString(o.id, `${path}.id`),
    packId: assertSafeSlug(o.packId, `${path}.packId`),
    skill: assertSafeSkillRef(o.skill, `${path}.skill`),
  };
  if (o.label !== undefined) {
    if (typeof o.label !== "string") throw new Error(`Invalid workflow spec: ${path}.label must be a string`);
    block.label = o.label;
  }
  if (o.agent !== undefined) {
    if (o.agent !== null && typeof o.agent !== "string") throw new Error(`Invalid workflow spec: ${path}.agent must be a string or null`);
    block.agent = o.agent;
  }
  return block;
}

function parseStage(raw: unknown, idx: number): WorkflowStageSpec {
  const path = `stages[${idx}]`;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`Invalid workflow spec: ${path} must be an object`);
  const o = raw as Record<string, unknown>;
  const role = assertString(o.role, `${path}.role`) as WorkflowStageRole;
  if (!VALID_ROLES.has(role)) throw new Error(`Invalid workflow spec: ${path}.role "${role}" is not recognized`);
  if (!Array.isArray(o.skills)) throw new Error(`Invalid workflow spec: ${path}.skills must be an array`);

  const stage: WorkflowStageSpec = {
    id: assertSafeSlug(o.id, `${path}.id`),
    label: assertString(o.label, `${path}.label`),
    role,
    built: assertBoolean(o.built, `${path}.built`),
    allowFallback: assertBoolean(o.allowFallback, `${path}.allowFallback`),
    skills: o.skills.map((s, i) => parseSkillBlock(s, `${path}.skills[${i}]`)),
  };
  if (o.isBlindChecker !== undefined) {
    stage.isBlindChecker = assertBoolean(o.isBlindChecker, `${path}.isBlindChecker`);
  }
  return stage;
}

function parseVersionSnapshot(raw: unknown, path: string): LaneVersionSnapshot {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`Invalid workflow spec: ${path} must be an object`);
  const o = raw as Record<string, unknown>;
  if (typeof o.version !== "number" || !Number.isInteger(o.version) || o.version < 1) {
    throw new Error(`Invalid workflow spec: ${path}.version must be a positive integer`);
  }
  if (!Array.isArray(o.skills)) throw new Error(`Invalid workflow spec: ${path}.skills must be an array`);
  return {
    version: o.version,
    commit: assertString(o.commit, `${path}.commit`),
    digest: assertString(o.digest, `${path}.digest`),
    recordedAt: assertString(o.recordedAt, `${path}.recordedAt`),
    summary: typeof o.summary === "string" ? o.summary : "",
    skills: o.skills.map((s, i) => parseLaneSkillEntry(s, `${path}.skills[${i}]`)),
  };
}

function parseLaneConflict(raw: unknown, path: string): LaneConflict {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`Invalid workflow spec: ${path} must be an object`);
  const o = raw as Record<string, unknown>;
  const reason = assertString(o.reason, `${path}.reason`);
  if (reason !== "modified-both" && reason !== "removed-upstream-edited-locally" && reason !== "reordered-both") {
    throw new Error(`Invalid workflow spec: ${path}.reason "${reason}" is not recognized`);
  }
  const conflict: LaneConflict = {
    skill: assertString(o.skill, `${path}.skill`),
    reason,
  };
  if (o.localEntry !== undefined) conflict.localEntry = parseLaneSkillEntry(o.localEntry, `${path}.localEntry`);
  if (o.upstreamEntry !== undefined) conflict.upstreamEntry = parseLaneSkillEntry(o.upstreamEntry, `${path}.upstreamEntry`);
  return conflict;
}

export function parseLaneSpec(raw: unknown, path = "lane"): WorkflowLaneSpec {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`Invalid workflow spec: ${path} must be an object`);
  const o = raw as Record<string, unknown>;
  const kind = assertString(o.kind, `${path}.kind`) as LaneKind;
  if (!VALID_LANE_KINDS.has(kind)) throw new Error(`Invalid workflow spec: ${path}.kind "${kind}" is not recognized`);
  const updatePolicy = assertString(o.updatePolicy, `${path}.updatePolicy`) as UpdatePolicy;
  if (!VALID_UPDATE_POLICIES.has(updatePolicy)) throw new Error(`Invalid workflow spec: ${path}.updatePolicy "${updatePolicy}" is not recognized`);

  if (!o.source || typeof o.source !== "object" || Array.isArray(o.source)) {
    throw new Error(`Invalid workflow spec: ${path}.source must be an object`);
  }
  const src = o.source as Record<string, unknown>;
  const srcType = assertString(src.type, `${path}.source.type`);
  if (!VALID_SOURCE_TYPES.has(srcType)) throw new Error(`Invalid workflow spec: ${path}.source.type "${srcType}" is not recognized`);
  const source: WorkflowLaneSpec["source"] = {
    type: srcType as WorkflowLaneSpec["source"]["type"],
    commit: assertString(src.commit, `${path}.source.commit`),
    digest: assertString(src.digest, `${path}.source.digest`),
  };
  if (src.url !== undefined) {
    if (typeof src.url !== "string") throw new Error(`Invalid workflow spec: ${path}.source.url must be a string`);
    source.url = src.url;
  }
  if (src.license !== undefined) {
    if (typeof src.license !== "string") throw new Error(`Invalid workflow spec: ${path}.source.license must be a string`);
    source.license = src.license;
  }

  if (!Array.isArray(o.nativeSkills)) throw new Error(`Invalid workflow spec: ${path}.nativeSkills must be an array`);
  if (!Array.isArray(o.skills)) throw new Error(`Invalid workflow spec: ${path}.skills must be an array`);
  if (!Array.isArray(o.versions)) throw new Error(`Invalid workflow spec: ${path}.versions must be an array`);

  const lane: WorkflowLaneSpec = {
    id: assertSafeSlug(o.id, `${path}.id`),
    name: assertString(o.name, `${path}.name`),
    kind,
    enabled: assertBoolean(o.enabled, `${path}.enabled`),
    source,
    forked: assertBoolean(o.forked, `${path}.forked`),
    updatePolicy,
    nativeSkills: o.nativeSkills.map((s, i) => parseLaneSkillEntry(s, `${path}.nativeSkills[${i}]`)),
    skills: o.skills.map((s, i) => parseLaneSkillEntry(s, `${path}.skills[${i}]`)),
    versions: o.versions.map((v, i) => parseVersionSnapshot(v, `${path}.versions[${i}]`)),
  };

  if (o.pendingConflict !== undefined) {
    if (o.pendingConflict === null) {
      lane.pendingConflict = null;
    } else if (typeof o.pendingConflict === "object" && !Array.isArray(o.pendingConflict)) {
      const pc = o.pendingConflict as Record<string, unknown>;
      if (!Array.isArray(pc.upstreamSkills)) throw new Error(`Invalid workflow spec: ${path}.pendingConflict.upstreamSkills must be an array`);
      if (!Array.isArray(pc.conflicts)) throw new Error(`Invalid workflow spec: ${path}.pendingConflict.conflicts must be an array`);
      lane.pendingConflict = {
        fromCommit: assertString(pc.fromCommit, `${path}.pendingConflict.fromCommit`),
        toCommit: assertString(pc.toCommit, `${path}.pendingConflict.toCommit`),
        toDigest: assertString(pc.toDigest, `${path}.pendingConflict.toDigest`),
        upstreamSkills: pc.upstreamSkills.map((s, i) => parseLaneSkillEntry(s, `${path}.pendingConflict.upstreamSkills[${i}]`)),
        conflicts: pc.conflicts.map((c, i) => parseLaneConflict(c, `${path}.pendingConflict.conflicts[${i}]`)),
      };
    } else {
      throw new Error(`Invalid workflow spec: ${path}.pendingConflict must be an object or null`);
    }
  }

  if (o.nuclearRequired !== undefined) {
    lane.nuclearRequired = assertBoolean(o.nuclearRequired, `${path}.nuclearRequired`);
  }
  if (o.packError !== undefined) {
    if (o.packError !== null && typeof o.packError !== "string") {
      throw new Error(`Invalid workflow spec: ${path}.packError must be a string or null`);
    }
    lane.packError = o.packError;
  }

  return lane;
}

export function serializeWorkflowSpec(spec: WorkflowSpecV1): string {
  // Validate structurally before serializing so invalid specs are never persisted
  const checked = parseWorkflowSpec(spec);
  return JSON.stringify(checked, null, 2);
}

export function parseWorkflowSpec(raw: string | unknown): WorkflowSpecV1 {
  const parsed: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid workflow spec: root must be a JSON object");
  }
  const o = parsed as Record<string, unknown>;
  if (o.schema_version !== WORKFLOW_SPEC_VERSION) {
    throw new Error(`Invalid workflow spec: unsupported schema_version "${String(o.schema_version)}" (expected "${WORKFLOW_SPEC_VERSION}")`);
  }
  const preset = assertString(o.preset, "preset") as WorkflowPreset;
  if (!VALID_PRESETS.has(preset)) throw new Error(`Invalid workflow spec: unknown preset "${preset}"`);
  const contextDepth = assertString(o.contextDepth, "contextDepth") as ContextDepth;
  if (!VALID_CONTEXT_DEPTHS.has(contextDepth)) throw new Error(`Invalid workflow spec: unknown contextDepth "${contextDepth}"`);
  const checkIn = assertString(o.checkIn, "checkIn") as WorkflowCheckIn;
  if (!VALID_CHECK_INS.has(checkIn)) throw new Error(`Invalid workflow spec: unknown checkIn "${checkIn}"`);
  if (!Array.isArray(o.stages)) throw new Error("Invalid workflow spec: stages must be an array");
  if (!Array.isArray(o.lanes)) throw new Error("Invalid workflow spec: lanes must be an array");
  if (!Array.isArray(o.userModels) || o.userModels.some((m) => typeof m !== "string")) {
    throw new Error("Invalid workflow spec: userModels must be an array of strings");
  }

  const spec: WorkflowSpecV1 = {
    schema_version: WORKFLOW_SPEC_VERSION,
    id: assertString(o.id, "id"),
    name: assertString(o.name, "name"),
    preset,
    contextDepth,
    checkIn,
    stages: o.stages.map((s, i) => parseStage(s, i)),
    lanes: o.lanes.map((l, i) => parseLaneSpec(l, `lanes[${i}]`)),
    userModels: [...(o.userModels as string[])],
  };
  if (o.updatedAt !== undefined) {
    if (typeof o.updatedAt !== "string") throw new Error("Invalid workflow spec: updatedAt must be a string");
    spec.updatedAt = o.updatedAt;
  }
  return spec;
}

/* ---------- diff & validation ---------- */

function sameSkillEntry(a: LaneSkillEntry, b: LaneSkillEntry): boolean {
  return (
    a.skill === b.skill &&
    a.defaultStage === b.defaultStage &&
    (a.label ?? "") === (b.label ?? "") &&
    (a.agent ?? null) === (b.agent ?? null) &&
    (a.digest ?? "") === (b.digest ?? "")
  );
}

function sameLocalCustomization(a: LaneSkillEntry, b: LaneSkillEntry): boolean {
  return (
    a.skill === b.skill &&
    a.defaultStage === b.defaultStage &&
    (a.label ?? "") === (b.label ?? "") &&
    (a.agent ?? null) === (b.agent ?? null)
  );
}

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function diffLaneFromUpstream(lane: WorkflowLaneSpec): LaneDiff {
  const nativeMap = new Map(lane.nativeSkills.map((e) => [e.skill, e]));
  const localMap = new Map(lane.skills.map((e) => [e.skill, e]));

  const added: string[] = [];
  for (const e of lane.skills) {
    if (!nativeMap.has(e.skill)) added.push(e.skill);
  }

  const removed: string[] = [];
  for (const e of lane.nativeSkills) {
    if (!localMap.has(e.skill)) removed.push(e.skill);
  }

  const commonNativeOrder = lane.nativeSkills.filter((e) => localMap.has(e.skill)).map((e) => e.skill);
  const commonLocalOrder = lane.skills.filter((e) => nativeMap.has(e.skill)).map((e) => e.skill);
  const reordered = !sameOrder(commonNativeOrder, commonLocalOrder);

  const reassigned: LaneDiff["reassigned"] = [];
  for (const skill of commonLocalOrder) {
    const nat = nativeMap.get(skill)!;
    const loc = localMap.get(skill)!;
    const stageChanged = nat.defaultStage !== loc.defaultStage;
    const agentChanged = (nat.agent ?? null) !== (loc.agent ?? null);
    if (stageChanged || agentChanged) {
      reassigned.push({
        skill,
        from: nat.defaultStage,
        to: loc.defaultStage,
        ...(agentChanged ? { fromAgent: nat.agent ?? null, toAgent: loc.agent ?? null } : {}),
      });
    }
  }

  const modified = added.length > 0 || removed.length > 0 || reordered || reassigned.length > 0;
  return { modified, added, removed, reordered, reassigned };
}

/**
 * Validates safety & integrity invariants on a `WorkflowSpecV1`:
 * - ERROR: Blind checker stage has `allowFallback: true` (ADR 0024).
 * - ERROR: Blind checker skill or seat resolves to the same vendor/agent as the Author stage.
 * - ERROR: `contextDepth === "nuclear"` and a required Nuclear lane has `packError` or is missing.
 * - WARNING: Nuclear lane is forked or modified from its native upstream skills.
 */
export function validateWorkflowSpec(spec: WorkflowSpecV1, council?: CouncilSeats): WorkflowValidationResult {
  const errors: WorkflowRuleViolation[] = [];
  const warnings: WorkflowRuleViolation[] = [];

  // 1. Collect effective author vendors
  const authorStages = spec.stages.filter((s) => s.role === "author");
  const authorVendors = new Set<string>();
  const councilAuthor = normalizeAgentVendor(council?.author);
  const councilChecker = normalizeAgentVendor(council?.checker);

  let authorUsesFallbackSeat = false;
  for (const st of authorStages) {
    if (st.skills.length === 0) {
      authorUsesFallbackSeat = true;
    }
    for (const block of st.skills) {
      const v = normalizeAgentVendor(block.agent);
      if (v) {
        authorVendors.add(v);
      } else {
        authorUsesFallbackSeat = true;
      }
    }
  }
  if (authorUsesFallbackSeat && councilAuthor) {
    authorVendors.add(councilAuthor);
  }

  // 2. Check blind checker stages
  const checkerStages = spec.stages.filter((s) => s.role === "pre-check" || s.isBlindChecker === true);
  for (const st of checkerStages) {
    if (st.allowFallback) {
      errors.push({
        code: "checker_fallback_forbidden",
        severity: "error",
        stageId: st.id,
        message: `Blind checker stage "${st.label}" cannot enable allowFallback (ADR 0024).`,
      });
    }

    if (st.skills.length === 0 && councilChecker && authorVendors.has(councilChecker)) {
      errors.push({
        code: "checker_same_as_author",
        severity: "error",
        stageId: st.id,
        message: `Blind checker stage "${st.label}" resolves to "${councilChecker}", which is the same vendor as the Author stage.`,
      });
    }

    for (const block of st.skills) {
      const effectiveChecker = normalizeAgentVendor(block.agent) ?? councilChecker;
      if (effectiveChecker && authorVendors.has(effectiveChecker)) {
        errors.push({
          code: "checker_same_as_author",
          severity: "error",
          stageId: st.id,
          blockId: block.id,
          message: `Blind checker skill "${block.skill}" resolves to "${effectiveChecker}", which matches the Author vendor. Independent verification requires a different vendor.`,
        });
      }
    }
  }

  // 3. Nuclear pack guarantees
  if (spec.contextDepth === "nuclear") {
    const nuclearLanes = spec.lanes.filter((l) => l.id === "nuclear-grade" || l.nuclearRequired === true);
    if (nuclearLanes.length === 0) {
      errors.push({
        code: "nuclear_pack_load_failed",
        severity: "error",
        laneId: "nuclear-grade",
        message: "Nuclear context depth requires the nuclear-grade pack lane, which is missing from this workflow spec.",
      });
    }
    for (const lane of nuclearLanes) {
      if (lane.packError) {
        errors.push({
          code: "nuclear_pack_load_failed",
          severity: "error",
          laneId: lane.id,
          message: `Required Nuclear pack "${lane.name}" failed verification and blocks execution: ${lane.packError}`,
        });
      }
    }
  }

  // 4. Flag modified Nuclear lane (warning before run) — checks both lane edits and stage-canvas edits
  for (const lane of spec.lanes) {
    if (lane.id !== "nuclear-grade" && !lane.nuclearRequired) continue;
    if (!lane.enabled && spec.contextDepth !== "nuclear") continue;
    const diff = diffLaneFromUpstream(lane);
    const stageBlocks = spec.stages.flatMap((st) =>
      st.skills
        .filter((b) => b.packId === lane.id)
        .map((b) => ({
          skill: b.skill.includes(":") ? b.skill.slice(b.skill.indexOf(":") + 1) : b.skill,
          stageId: st.id,
          agent: b.agent ?? null,
        })),
    );
    const nativeCore = lane.nativeSkills.map((e) => ({
      skill: e.skill.includes(":") ? e.skill.slice(e.skill.indexOf(":") + 1) : e.skill,
      defaultStage: e.defaultStage,
    }));
    const missingFromStages = nativeCore
      .filter((n) => !stageBlocks.some((b) => b.skill === n.skill))
      .map((n) => n.skill);
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
    const stageModified = missingFromStages.length > 0 || stageReassigned || stageOrderChanged;

    if (lane.forked || diff.modified || stageModified) {
      const parts: string[] = [];
      if (diff.added.length) parts.push(`added: ${diff.added.join(", ")}`);
      if (diff.removed.length) parts.push(`removed: ${diff.removed.join(", ")}`);
      if (missingFromStages.length) parts.push(`removed from stages: ${missingFromStages.join(", ")}`);
      if (diff.reordered || stageOrderChanged) parts.push("reordered");
      if (diff.reassigned.length || stageReassigned) parts.push("reassigned");
      warnings.push({
        code: "nuclear_lane_modified",
        severity: "warning",
        laneId: lane.id,
        message: `Nuclear lane "${lane.name}" has been modified from upstream${parts.length ? ` (${parts.join("; ")})` : " (forked)"}. This modification will be recorded on every run.`,
      });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Synchronizes stage skill blocks after an upstream lane update so the dispatcher and canvas execute
 * the updated lane skills while preserving per-block custom agent assignments.
 */
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
      id: `${updatedLane.id}:${entry.skill}:${i}`,
      packId: updatedLane.id,
      skill: entry.skill,
      ...(entry.label ? { label: entry.label } : {}),
      agent: entry.agent ?? prevAgent ?? null,
    });
  }
  return nextStages;
}

/* ---------- 3-way merge, conflict resolution & rollback ---------- */

function nextVersionNumber(versions: readonly LaneVersionSnapshot[]): number {
  return versions.length > 0 ? Math.max(...versions.map((v) => v.version)) + 1 : 1;
}

function makeSnapshot(lane: WorkflowLaneSpec, summary: string): LaneVersionSnapshot {
  return {
    version: nextVersionNumber(lane.versions),
    commit: lane.source.commit,
    digest: lane.source.digest,
    recordedAt: new Date().toISOString(),
    summary,
    skills: cloneSkills(lane.skills),
  };
}

/**
 * Merges an upstream update into a lane:
 * - Untouched (`!forked`): applies cleanly and snapshots the previous version for rollback.
 * - Forked (`forked`): performs a 3-way merge between `lane.nativeSkills` (base), `lane.skills` (local),
 *   and `upstream.skills` (theirs). Pauses with `pendingConflict` on any conflicting edit, deletion,
 *   or reorder — NEVER silently overwrites user edits.
 */
export function mergeLaneUpdate(
  lane: WorkflowLaneSpec,
  upstream: { commit: string; digest: string; skills: LaneSkillEntry[] },
): LaneMergeResult {
  if (lane.source.commit === upstream.commit && lane.source.digest === upstream.digest) {
    return { status: "up_to_date", lane: cloneLane(lane), summary: "Lane is already up to date." };
  }

  const next = cloneLane(lane);

  if (!next.forked) {
    const snap = makeSnapshot(next, `Before auto-update from ${next.source.commit.slice(0, 12)} to ${upstream.commit.slice(0, 12)}`);
    next.versions = [...next.versions, snap];
    next.source = { ...next.source, commit: upstream.commit, digest: upstream.digest };
    next.nativeSkills = cloneSkills(upstream.skills);
    next.skills = cloneSkills(upstream.skills);
    next.pendingConflict = null;
    return {
      status: "updated",
      lane: next,
      summary: `Updated ${next.name} to ${upstream.commit.slice(0, 12)} (saved v${snap.version} for rollback).`,
    };
  }

  // 3-way merge for forked lane
  const baseMap = new Map(next.nativeSkills.map((e) => [e.skill, e]));
  const localMap = new Map(next.skills.map((e) => [e.skill, e]));
  const theirsMap = new Map(upstream.skills.map((e) => [e.skill, e]));

  const allSkills = new Set<string>([
    ...next.nativeSkills.map((e) => e.skill),
    ...next.skills.map((e) => e.skill),
    ...upstream.skills.map((e) => e.skill),
  ]);

  const conflicts: LaneConflict[] = [];
  const resolvedBySkill = new Map<string, LaneSkillEntry>();

  for (const skill of allSkills) {
    const base = baseMap.get(skill);
    const local = localMap.get(skill);
    const theirs = theirsMap.get(skill);

    if (base && local && theirs) {
      const localChanged = !sameLocalCustomization(base, local);
      const theirsChanged = !sameSkillEntry(base, theirs);
      if (localChanged && theirsChanged && !sameSkillEntry(local, theirs)) {
        conflicts.push({
          skill,
          reason: "modified-both",
          localEntry: cloneEntry(local),
          upstreamEntry: cloneEntry(theirs),
        });
      } else if (localChanged) {
        resolvedBySkill.set(skill, cloneEntry(local));
      } else if (theirsChanged) {
        resolvedBySkill.set(skill, cloneEntry(theirs));
      } else {
        resolvedBySkill.set(skill, cloneEntry(local));
      }
    } else if (base && local && !theirs) {
      // Removed upstream
      if (!sameLocalCustomization(base, local)) {
        conflicts.push({
          skill,
          reason: "removed-upstream-edited-locally",
          localEntry: cloneEntry(local),
        });
      }
      // If untouched locally, cleanly removed (not added to resolvedBySkill)
    } else if (base && !local && theirs) {
      // Removed locally
      if (!sameSkillEntry(base, theirs)) {
        conflicts.push({
          skill,
          reason: "modified-both",
          upstreamEntry: cloneEntry(theirs),
        });
      }
      // If untouched upstream, keep local deletion
    } else if (!base && local && !theirs) {
      // Added locally only
      resolvedBySkill.set(skill, cloneEntry(local));
    } else if (!base && !local && theirs) {
      // Added upstream only
      resolvedBySkill.set(skill, cloneEntry(theirs));
    } else if (!base && local && theirs) {
      // Added in both
      if (!sameSkillEntry(local, theirs)) {
        conflicts.push({
          skill,
          reason: "modified-both",
          localEntry: cloneEntry(local),
          upstreamEntry: cloneEntry(theirs),
        });
      } else {
        resolvedBySkill.set(skill, cloneEntry(local));
      }
    }
  }

  // Check for conflicting reorders among skills present in base, local, and theirs
  const commonSkills = new Set(
    [...allSkills].filter((s) => baseMap.has(s) && localMap.has(s) && theirsMap.has(s)),
  );
  const baseCommonOrder = next.nativeSkills.filter((e) => commonSkills.has(e.skill)).map((e) => e.skill);
  const localCommonOrder = next.skills.filter((e) => commonSkills.has(e.skill)).map((e) => e.skill);
  const theirsCommonOrder = upstream.skills.filter((e) => commonSkills.has(e.skill)).map((e) => e.skill);

  const localReordered = !sameOrder(baseCommonOrder, localCommonOrder);
  const theirsReordered = !sameOrder(baseCommonOrder, theirsCommonOrder);
  if (localReordered && theirsReordered && !sameOrder(localCommonOrder, theirsCommonOrder)) {
    const firstDiff = localCommonOrder.find((s, i) => theirsCommonOrder[i] !== s) ?? localCommonOrder[0]!;
    conflicts.push({
      skill: firstDiff,
      reason: "reordered-both",
      localEntry: cloneEntry(localMap.get(firstDiff)!),
      upstreamEntry: cloneEntry(theirsMap.get(firstDiff)!),
    });
  }

  if (conflicts.length > 0) {
    next.pendingConflict = {
      fromCommit: next.source.commit,
      toCommit: upstream.commit,
      toDigest: upstream.digest,
      upstreamSkills: cloneSkills(upstream.skills),
      conflicts,
    };
    return {
      status: "conflict_paused",
      lane: next,
      conflicts,
      summary: `Update paused for ${next.name}: ${conflicts.length} conflict(s) require resolution.`,
    };
  }

  // Assemble merged order cleanly
  const mergedSkills: LaneSkillEntry[] = [];
  const emitted = new Set<string>();
  const primaryOrder = localReordered
    ? [...next.skills.map((e) => e.skill), ...upstream.skills.map((e) => e.skill)]
    : [...upstream.skills.map((e) => e.skill), ...next.skills.map((e) => e.skill)];

  for (const skill of primaryOrder) {
    if (emitted.has(skill)) continue;
    const entry = resolvedBySkill.get(skill);
    if (entry) {
      mergedSkills.push(entry);
      emitted.add(skill);
    }
  }

  const snap = makeSnapshot(next, `Before 3-way merge from ${next.source.commit.slice(0, 12)} to ${upstream.commit.slice(0, 12)}`);
  next.versions = [...next.versions, snap];
  next.source = { ...next.source, commit: upstream.commit, digest: upstream.digest };
  next.nativeSkills = cloneSkills(upstream.skills);
  next.skills = mergedSkills;
  next.pendingConflict = null;

  return {
    status: "updated",
    lane: next,
    summary: `Merged upstream ${upstream.commit.slice(0, 12)} into forked lane ${next.name} without conflicts (saved v${snap.version}).`,
  };
}

/**
 * Resolves a paused conflict on a lane using per-skill `"mine" | "upstream"` choices.
 */
export function resolveLaneConflict(
  lane: WorkflowLaneSpec,
  resolutions: Record<string, "mine" | "upstream">,
): WorkflowLaneSpec {
  const pending = lane.pendingConflict;
  if (!pending) {
    throw new Error(`Lane "${lane.id}" has no pending conflict to resolve.`);
  }

  const next = cloneLane(lane);
  const baseMap = new Map(next.nativeSkills.map((e) => [e.skill, e]));
  const localMap = new Map(next.skills.map((e) => [e.skill, e]));
  const theirsMap = new Map(pending.upstreamSkills.map((e) => [e.skill, e]));
  const conflictMap = new Map<string, LaneConflict[]>();
  for (const c of pending.conflicts) {
    const list = conflictMap.get(c.skill) ?? [];
    list.push(c);
    conflictMap.set(c.skill, list);
  }

  // Ensure every conflict has a choice
  for (const c of pending.conflicts) {
    const choice = resolutions[c.skill];
    if (choice !== "mine" && choice !== "upstream") {
      throw new Error(`Missing resolution ("mine" | "upstream") for conflicted skill "${c.skill}".`);
    }
  }

  const reorderConflict = pending.conflicts.find((c) => c.reason === "reordered-both");
  const useUpstreamOrder = reorderConflict ? resolutions[reorderConflict.skill] === "upstream" : false;

  const resolvedBySkill = new Map<string, LaneSkillEntry>();
  const allSkills = new Set<string>([
    ...next.nativeSkills.map((e) => e.skill),
    ...next.skills.map((e) => e.skill),
    ...pending.upstreamSkills.map((e) => e.skill),
  ]);

  for (const skill of allSkills) {
    const base = baseMap.get(skill);
    const local = localMap.get(skill);
    const theirs = theirsMap.get(skill);
    const skillConflicts = (conflictMap.get(skill) ?? []).filter((c) => c.reason !== "reordered-both");

    if (skillConflicts.length > 0) {
      const choice = resolutions[skill]!;
      if (choice === "mine") {
        if (local) resolvedBySkill.set(skill, cloneEntry(local));
      } else {
        if (theirs) resolvedBySkill.set(skill, cloneEntry(theirs));
      }
      continue;
    }

    // Non-conflicting skill: apply same 3-way merge rule
    if (base && local && theirs) {
      const localChanged = !sameLocalCustomization(base, local);
      resolvedBySkill.set(skill, cloneEntry(localChanged ? local : theirs));
    } else if (base && local && !theirs) {
      // Untouched locally & removed upstream -> removed
    } else if (base && !local && theirs) {
      // Removed locally & untouched upstream -> keep removed
    } else if (!base && local) {
      resolvedBySkill.set(skill, cloneEntry(local));
    } else if (!base && theirs) {
      resolvedBySkill.set(skill, cloneEntry(theirs));
    }
  }

  const orderedIds = useUpstreamOrder
    ? [...pending.upstreamSkills.map((e) => e.skill), ...next.skills.map((e) => e.skill)]
    : [...next.skills.map((e) => e.skill), ...pending.upstreamSkills.map((e) => e.skill)];

  const mergedSkills: LaneSkillEntry[] = [];
  const emitted = new Set<string>();
  for (const skill of orderedIds) {
    if (emitted.has(skill)) continue;
    const entry = resolvedBySkill.get(skill);
    if (entry) {
      mergedSkills.push(entry);
      emitted.add(skill);
    }
  }

  const snap = makeSnapshot(next, `Before conflict resolution to ${pending.toCommit.slice(0, 12)}`);
  next.versions = [...next.versions, snap];
  next.source = { ...next.source, commit: pending.toCommit, digest: pending.toDigest };
  next.nativeSkills = cloneSkills(pending.upstreamSkills);
  next.skills = mergedSkills;
  next.pendingConflict = null;
  return next;
}

/**
 * Rolls back a lane to a previous version snapshot (defaults to the most recent snapshot).
 * Records the pre-rollback state as a new version snapshot so rollback itself is reversible.
 */
export function rollbackLane(lane: WorkflowLaneSpec, targetVersion?: number): WorkflowLaneSpec {
  if (lane.versions.length === 0) {
    throw new Error(`Lane "${lane.id}" has no previous versions to roll back to.`);
  }
  const target =
    targetVersion !== undefined
      ? lane.versions.find((v) => v.version === targetVersion)
      : lane.versions[lane.versions.length - 1];
  if (!target) {
    throw new Error(`Lane "${lane.id}" has no version snapshot v${String(targetVersion)}.`);
  }

  const next = cloneLane(lane);
  const beforeRollback = makeSnapshot(next, `Before rollback to v${target.version} (${target.commit.slice(0, 12)})`);
  next.versions = [...next.versions, beforeRollback];
  next.source = { ...next.source, commit: target.commit, digest: target.digest };
  next.skills = cloneSkills(target.skills);
  if (!next.forked) {
    next.nativeSkills = cloneSkills(target.skills);
  }
  next.pendingConflict = null;
  return next;
}

/* ---------- upstream repo URL import ---------- */

function isPrivateOrUnsafeHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost") || host === "0.0.0.0" || host === "::1" || host === "::") {
    return true;
  }
  // IPv4 literal check
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  // IPv6 private / link-local / mapped IPv4
  if (host.includes(":")) {
    if (host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80") || host.startsWith("::ffff:")) {
      return true;
    }
  }
  return false;
}

export function validateRepoUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid repository URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Repository URL must use https://.");
  }
  if (isPrivateOrUnsafeHost(parsed.hostname)) {
    throw new Error(`Refused unsafe or private host "${parsed.hostname}".`);
  }
  const rawPath = parsed.pathname + parsed.search;
  if (
    rawPath.includes("..") ||
    /%2e/i.test(rawPath) ||
    rawPath.includes("\\") ||
    rawPath.includes("\0")
  ) {
    throw new Error("Repository URL contains forbidden path traversal characters.");
  }
  return parsed;
}

function inferStageFromSkillName(skill: string): string {
  const s = skill.toLowerCase();
  if (s.includes("brainstorm") || s.includes("grill") || s.includes("discover") || s.includes("intake")) return "brainstorm";
  if (s.includes("plan") || s.includes("spec") || s.includes("ticket") || s.includes("design")) return "plan";
  if (s.includes("review") || s.includes("check") || s.includes("verify") || s.includes("audit")) return "check";
  return "author";
}

/**
 * Imports a skill pack from an `https://` repository URL (GitHub repo or HTTPS manifest endpoint)
 * into a new swim lane with `forked: false` and `updatePolicy: "auto"`.
 */
export async function importSkillsFromRepoUrl(
  url: string,
  fetcher: RepoFetcher = globalThis.fetch as unknown as RepoFetcher,
): Promise<WorkflowLaneSpec> {
  const parsed = validateRepoUrl(url);
  const pathParts = parsed.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);

  // GitHub repository URL: https://github.com/<owner>/<repo>
  if (parsed.hostname.toLowerCase() === "github.com" && pathParts.length >= 2) {
    const owner = pathParts[0]!;
    const repo = pathParts[1]!.replace(/\.git$/i, "");
    if (!SLUG_SAFE.test(owner) || !SLUG_SAFE.test(repo)) {
      throw new Error("Invalid GitHub repository owner or name.");
    }

    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`;
    const res = await fetcher(apiUrl, {
      redirect: "error",
      headers: { Accept: "application/vnd.github+json", "User-Agent": "control-rod-workflow-importer" },
    });
    if (res.url) validateRepoUrl(res.url);
    if (!res.ok) {
      throw new Error(`Failed to fetch repository tree (${res.status}).`);
    }
    const data = (await res.json()) as {
      sha?: string;
      tree?: { path?: string; type?: string; sha?: string }[];
      license?: string;
    };
    const commit = typeof data.sha === "string" && data.sha.length > 0 ? data.sha : sha256Hex(`${owner}/${repo}`).slice(7, 47);
    const tree = Array.isArray(data.tree) ? data.tree : [];

    // Discover SKILL.md files (e.g. skills/<name>/SKILL.md or <name>/SKILL.md)
    const entries: LaneSkillEntry[] = [];
    const seen = new Set<string>();
    for (const item of tree) {
      if (item.type !== "blob" || typeof item.path !== "string") continue;
      if (!item.path.endsWith("/SKILL.md") && item.path !== "SKILL.md") continue;
      const segs = item.path.split("/");
      const skillSlug = segs.length >= 2 ? segs[segs.length - 2]! : repo;
      if (!SLUG_SAFE.test(skillSlug) || seen.has(skillSlug)) continue;
      seen.add(skillSlug);
      entries.push({
        skill: skillSlug,
        label: humanizeSlug(skillSlug),
        defaultStage: inferStageFromSkillName(skillSlug),
        digest: sha256Hex(`${item.path}:${item.sha ?? commit}`),
      });
    }

    if (entries.length === 0) {
      throw new Error(`No SKILL.md files found in https://github.com/${owner}/${repo}.`);
    }

    const id = `${owner.toLowerCase()}-${repo.toLowerCase()}`.replace(/[^a-z0-9._-]+/g, "-");
    const digest = computeLaneDigest(entries, commit);

    return {
      id,
      name: humanizeSlug(repo),
      kind: "workflow",
      enabled: true,
      source: {
        type: "git-url",
        url: `https://github.com/${owner}/${repo}`,
        commit,
        digest,
        ...(typeof data.license === "string" ? { license: data.license } : {}),
      },
      forked: false,
      updatePolicy: "auto",
      nativeSkills: cloneSkills(entries),
      skills: cloneSkills(entries),
      versions: [],
      pendingConflict: null,
      packError: null,
    };
  }

  // Generic HTTPS manifest JSON endpoint
  const res = await fetcher(parsed.toString(), {
    redirect: "error",
    headers: { Accept: "application/json", "User-Agent": "control-rod-workflow-importer" },
  });
  if (res.url) validateRepoUrl(res.url);
  if (!res.ok) {
    throw new Error(`Failed to fetch skill manifest (${res.status}).`);
  }
  const body = (await res.json()) as {
    id?: string;
    name?: string;
    commit?: string;
    license?: string;
    skills?: { skill: string; label?: string; defaultStage?: string; content?: string; digest?: string }[];
  };

  if (!body || typeof body !== "object" || !Array.isArray(body.skills) || body.skills.length === 0) {
    throw new Error("Remote manifest must include a non-empty skills array.");
  }

  const commit = typeof body.commit === "string" && body.commit.length > 0 ? body.commit : sha256Hex(JSON.stringify(body)).slice(7, 47);
  const entries: LaneSkillEntry[] = body.skills.map((s) => {
    const skillName = assertSafeSkillRef(s.skill, "manifest.skills[].skill");
    const stage = typeof s.defaultStage === "string" && s.defaultStage ? assertSafeSlug(s.defaultStage, "manifest.skills[].defaultStage") : inferStageFromSkillName(skillName);
    return {
      skill: skillName,
      label: typeof s.label === "string" ? s.label : humanizeSlug(skillName),
      defaultStage: stage,
      digest: typeof s.digest === "string" ? s.digest : sha256Hex(typeof s.content === "string" ? s.content : skillName),
    };
  });

  const fallbackId = (pathParts[pathParts.length - 1] ?? parsed.hostname).replace(/\.json$/i, "").replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();
  const id = typeof body.id === "string" && SLUG_SAFE.test(body.id) ? body.id : fallbackId;
  const digest = computeLaneDigest(entries, commit);

  return {
    id,
    name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : humanizeSlug(id),
    kind: "workflow",
    enabled: true,
    source: {
      type: "git-url",
      url: parsed.toString(),
      commit,
      digest,
      ...(typeof body.license === "string" ? { license: body.license } : {}),
    },
    forked: false,
    updatePolicy: "auto",
    nativeSkills: cloneSkills(entries),
    skills: cloneSkills(entries),
    versions: [],
    pendingConflict: null,
    packError: null,
  };
}

/* ---------- custom packs ---------- */

export function createCustomPackLane(opts: {
  id: string;
  name: string;
  fromLane?: WorkflowLaneSpec;
  skills?: LaneSkillEntry[];
}): WorkflowLaneSpec {
  const id = opts.id.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  if (!id || !SLUG_SAFE.test(id)) throw new Error("Custom pack id must be a valid slug.");
  const name = opts.name.trim();
  if (!name) throw new Error("Custom pack name is required.");

  const baseSkills = opts.skills
    ? cloneSkills(opts.skills)
    : opts.fromLane
      ? cloneSkills(opts.fromLane.skills)
      : [];

  const commit = "custom-v1";
  const digest = computeLaneDigest(baseSkills, commit);

  return {
    id,
    name,
    kind: "custom",
    enabled: true,
    source: {
      type: "custom",
      commit,
      digest,
      license: opts.fromLane?.source.license ?? "MIT",
    },
    forked: false,
    updatePolicy: "freeze",
    nativeSkills: cloneSkills(baseSkills),
    skills: cloneSkills(baseSkills),
    versions: [],
    pendingConflict: null,
    packError: null,
  };
}

export function exportCustomPack(lane: WorkflowLaneSpec): CustomPackEnvelope {
  const checked = parseLaneSpec(lane);
  return {
    schema_version: WORKFLOW_SPEC_VERSION,
    kind: "control-rod-custom-pack",
    exportedAt: new Date().toISOString(),
    lane: cloneLane(checked),
  };
}

export function importCustomPackJson(raw: string | unknown): WorkflowLaneSpec {
  const parsed: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid custom pack JSON: expected an object.");
  }
  const o = parsed as Record<string, unknown>;
  let laneRaw: unknown;
  if (o.kind === "control-rod-custom-pack") {
    if (o.schema_version !== WORKFLOW_SPEC_VERSION) {
      throw new Error(`Unsupported custom pack schema_version "${String(o.schema_version)}".`);
    }
    laneRaw = o.lane;
  } else if (o.pack && typeof o.pack === "object" && !Array.isArray(o.pack)) {
    if (o.schema_version !== undefined && o.schema_version !== WORKFLOW_SPEC_VERSION) {
      throw new Error(`Unsupported custom pack schema_version "${String(o.schema_version)}".`);
    }
    const p = o.pack as Record<string, unknown>;
    const name = typeof p.name === "string" && p.name.trim() ? p.name.trim() : "Imported Pack";
    const id =
      typeof p.id === "string" && SLUG_SAFE.test(p.id)
        ? p.id
        : name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-|-$/g, "") || `custom-${Date.now()}`;
    const skills = Array.isArray(p.skills)
      ? p.skills.map((s, i) => parseLaneSkillEntry(s, `pack.skills[${i}]`))
      : [];
    return createCustomPackLane({ id, name, skills });
  } else {
    laneRaw = o;
  }

  const lane = parseLaneSpec(laneRaw, "customPack.lane");
  const digest = computeLaneDigest(lane.skills, lane.source.commit);
  return {
    ...lane,
    kind: "custom",
    source: {
      ...lane.source,
      type: "file",
      digest,
    },
    pendingConflict: null,
  };
}
