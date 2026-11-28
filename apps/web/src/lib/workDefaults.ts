import { MODE_COPY, type EngineeringMode } from "./mode.js";
import {
  CLI_ECOSYSTEMS,
  defaultAuthorSelection,
  defaultCheckerSelection,
  isValidModelName,
  resolveReasoningForModel,
  type AgentRuntimeSelection,
  type ReasoningLevel,
} from "./runtimes.js";
import type { DataLane } from "../api/types.js";
import { readString, writeString } from "./storage.js";

export type ModalDetailLevel = "simple" | "advanced";
export type RepoOutfallStrategy = "worktree" | "fresh-clone" | "branch";

const VALID_DETAIL_LEVELS: readonly ModalDetailLevel[] = ["simple", "advanced"];
// Only a linked worktree can be bound to a card's run (services/api/src/repos.ts bindCheckout), so the
// fresh-clone and branch strategies are hidden until they can be bound, and a saved one reads as worktree.
const VALID_STRATEGIES: readonly RepoOutfallStrategy[] = ["worktree"];
const VALID_LANES: readonly DataLane[] = [
  "public",
  "internal",
  "proprietary",
  "client-confidential",
  "restricted",
];
const VALID_GRADES: readonly ("general-service" | "safety")[] = ["general-service", "safety"];

export interface WorkDefaults {
  project: string;
  stage: string;
  purpose: string;
  discipline: string;
  lane: DataLane;
  grade: "general-service" | "safety";
  author: AgentRuntimeSelection;
  checker: AgentRuntimeSelection;
  detailLevel: ModalDetailLevel;
  workspaceRoot: string;
  repo: string;
  repoStrategy: RepoOutfallStrategy;
  /**
   * Whether the saved author and checker were picked on purpose. Only a picked agent goes on a card;
   * otherwise the board column's pick decides. Defaults saved before this field read as not picked.
   */
  agentsChosen: { author: boolean; checker: boolean };
}

const STORAGE_PREFIX = "cr.work-defaults.";

export function factoryDefaults(mode: EngineeringMode): WorkDefaults {
  const copy = MODE_COPY[mode];
  return {
    project: "",
    stage: copy.projectStages[0]!,
    purpose: copy.issuePurposes[0]!,
    discipline: copy.disciplines[0]!,
    lane: "internal",
    grade: "general-service",
    author: defaultAuthorSelection(),
    checker: defaultCheckerSelection(),
    detailLevel: "simple",
    workspaceRoot: "",
    repo: "",
    repoStrategy: "worktree",
    agentsChosen: { author: false, checker: false },
  };
}

/** Validates a persisted runtime selection against currently runnable ecosystems, models, and reasoning levels. */
export function sanitizeRuntimeSelection(
  sel: unknown,
  fallback: AgentRuntimeSelection,
): AgentRuntimeSelection {
  if (!sel || typeof sel !== "object" || Array.isArray(sel)) return fallback;
  const candidate = sel as Record<string, unknown>;
  if (typeof candidate.ecosystem !== "string") return fallback;
  const eco = CLI_ECOSYSTEMS.find((c) => c.id === candidate.ecosystem);
  if (!eco || !eco.runnable) return fallback;
  const model =
    typeof candidate.model === "string" && isValidModelName(candidate.model)
      ? candidate.model
      : eco.defaultModel;
  const preferredReasoning =
    typeof candidate.reasoning === "string" ? (candidate.reasoning as ReasoningLevel) : undefined;
  const reasoning = resolveReasoningForModel(eco.id, model, preferredReasoning);
  return {
    ecosystem: eco.id,
    model,
    reasoning,
  };
}

function pickString(val: unknown, fallback: string): string {
  return typeof val === "string" ? val : fallback;
}

function pickEnum<T extends string>(val: unknown, allowed: readonly T[], fallback: T): T {
  return typeof val === "string" && (allowed as readonly string[]).includes(val)
    ? (val as T)
    : fallback;
}

function pickChosen(val: unknown): { author: boolean; checker: boolean } {
  const o = val && typeof val === "object" && !Array.isArray(val) ? (val as Record<string, unknown>) : {};
  return { author: o.author === true, checker: o.checker === true };
}

/** A saved or project strategy the app can bind today: every other one reads as worktree. */
export function bindableStrategy(val: unknown): RepoOutfallStrategy {
  return pickEnum(val, VALID_STRATEGIES, "worktree");
}

export function loadWorkDefaults(mode: EngineeringMode): WorkDefaults {
  const base = factoryDefaults(mode);
  const raw = readString(`${STORAGE_PREFIX}${mode}`);
  if (!raw) return base;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return base;
    }
    const obj = parsed as Record<string, unknown>;
    return {
      project: pickString(obj.project, base.project),
      stage: pickString(obj.stage, base.stage),
      purpose: pickString(obj.purpose, base.purpose),
      discipline: pickString(obj.discipline, base.discipline),
      lane: pickEnum(obj.lane, VALID_LANES, base.lane),
      grade: pickEnum(obj.grade, VALID_GRADES, base.grade),
      author: sanitizeRuntimeSelection(obj.author, base.author),
      checker: sanitizeRuntimeSelection(obj.checker, base.checker),
      detailLevel: pickEnum(obj.detailLevel, VALID_DETAIL_LEVELS, base.detailLevel),
      workspaceRoot: pickString(obj.workspaceRoot, base.workspaceRoot),
      repo: pickString(obj.repo, base.repo),
      repoStrategy: pickEnum(obj.repoStrategy, VALID_STRATEGIES, base.repoStrategy),
      agentsChosen: pickChosen(obj.agentsChosen),
    };
  } catch {
    return base;
  }
}

export function saveWorkDefaults(mode: EngineeringMode, defaults: WorkDefaults): void {
  writeString(`${STORAGE_PREFIX}${mode}`, JSON.stringify(defaults));
}

export function resetWorkDefaults(mode: EngineeringMode): WorkDefaults {
  const base = factoryDefaults(mode);
  saveWorkDefaults(mode, base);
  return base;
}

export interface InferredHints {
  discipline?: string;
  stage?: string;
  purpose?: string;
  grade?: "general-service" | "safety";
  reason?: string;
}

/**
 * Infers likely discipline, stage, purpose, and grade from a short scope description
 * so Simple Mode starts with smart defaults before the user opens Advanced controls.
 */
export function inferScopeHints(mode: EngineeringMode, text: string): InferredHints {
  const s = text.toLowerCase();
  if (!s.trim()) return {};

  if (mode === "software") {
    if (/\b(auth|oauth|token|passkey|csrf|xss|secret|sandbox|security|cve)\b/.test(s)) {
      return {
        discipline: "Security",
        stage: "Security / Hotfix",
        purpose: "PR / Diff Review",
        grade: "safety",
        reason: "Security/auth boundary detected",
      };
    }
    if (/\b(migrat|schema|sql|postgres|database|table)\b/.test(s)) {
      return {
        discipline: "Backend",
        stage: "Migration / Schema",
        purpose: "CI Verification",
        grade: "safety",
        reason: "Schema/data migration detected",
      };
    }
    if (/\b(ui|css|button|modal|layout|accessibility|wcag|frontend|react)\b/.test(s)) {
      return {
        discipline: "Frontend",
        stage: "Feature",
        purpose: "PR / Diff Review",
        grade: "general-service",
        reason: "Frontend UI work detected",
      };
    }
    if (/\b(fix|bug|crash|regression|broken|error|500|404)\b/.test(s)) {
      return {
        discipline: "Backend",
        stage: "Bugfix",
        purpose: "PR / Diff Review",
        grade: "general-service",
        reason: "Bugfix/regression detected",
      };
    }
    return {};
  }

  if (mode === "nuclear-grade") {
    if (/\b(red[\s-]?team|probe|adversar|security|cve|bypass|exfil|injection|secret|auth)\b/.test(s)) {
      return {
        discipline: "Security & Red Team",
        stage: "Verify & Review",
        purpose: "Standard Change Packet",
        grade: "safety",
        reason: "Security & red-team boundary detected",
      };
    }
    if (/\b(authority|tool|grant|permission|agent|mcp|delegat|skill|harness)\b/.test(s)) {
      return {
        discipline: "Agent Authority & Tooling",
        stage: "Specify & Plan",
        purpose: "Agent Authority Change",
        grade: "safety",
        reason: "Agent authority & tooling scope detected",
      };
    }
    if (/\b(dependenc|model|vendor|saas|api|package|lockfile|supply[\s-]?chain|upgrade)\b/.test(s)) {
      return {
        discipline: "Dependency & Model Trust",
        stage: "Verify & Review",
        purpose: "Standard Change Packet",
        grade: "safety",
        reason: "Dependency or model trust scope detected",
      };
    }
    if (/\b(source|lineage|licen[cs]e|citation|assurance|claim|public[\s-]?word|compliance)\b/.test(s)) {
      return {
        discipline: "Source & Assurance Boundary",
        stage: "Verify & Review",
        purpose: "Standard Change Packet",
        grade: "general-service",
        reason: "Source & assurance boundary detected",
      };
    }
    if (/\b(opex|incident|near[\s-]?miss|retro|postmortem|lesson|drift)\b/.test(s)) {
      return {
        discipline: "Configuration & Baseline",
        stage: "OPEX Learning",
        purpose: "OPEX Learning Action",
        grade: "general-service",
        reason: "OPEX learning action detected",
      };
    }
    if (/\b(baseline|config|controlled[\s-]?item|release|ship|gate|rollout)\b/.test(s)) {
      return {
        discipline: "Configuration & Baseline",
        stage: "Release Decision",
        purpose: "Release Readiness Decision",
        grade: "safety",
        reason: "Configuration baseline / release decision detected",
      };
    }
    if (/\b(verify|verification|test|eval|trace|execution|runtime|evidence|packet)\b/.test(s)) {
      return {
        discipline: "Runtime & Verification",
        stage: "Verify & Review",
        purpose: "Quick Change Packet",
        grade: "general-service",
        reason: "Runtime verification scope detected",
      };
    }
    return {};
  }

  // Capital Projects heuristics
  if (/\b(relief|psv|flare|blowdown|safety|hazop|sil|sis|asme|pressure vessel)\b/.test(s)) {
    return {
      discipline: "Process",
      stage: "Detailed Design (60%)",
      purpose: "Issue for Review (IFR)",
      grade: "safety",
      reason: "Safety-critical process scope detected",
    };
  }
  if (/\b(grounding|substation|switchgear|transformer|lighting|cable|mcc)\b/.test(s)) {
    return {
      discipline: "Electrical",
      stage: "Preliminary (30%)",
      purpose: "Issue for Design (IFD)",
      grade: "general-service",
      reason: "Electrical discipline scope detected",
    };
  }
  if (/\b(pipe|piping|isometric|flange|nozzle|stress|line list)\b/.test(s)) {
    return {
      discipline: "Piping",
      stage: "Detailed Design (60%)",
      purpose: "Issue for Design (IFD)",
      grade: "general-service",
      reason: "Piping discipline scope detected",
    };
  }
  if (/\b(permit|epa|air|environmental|zoning|ifc|construction)\b/.test(s)) {
    return {
      discipline: "Civil / Structural",
      stage: "Final Design (90%)",
      purpose: "Issue for Permit (IFP)",
      grade: "general-service",
      reason: "Permitting/IFC scope detected",
    };
  }
  return {};
}
