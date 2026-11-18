import { MODE_COPY, type EngineeringMode } from "./mode.js";
import {
  CLI_ECOSYSTEMS,
  defaultAuthorSelection,
  defaultCheckerSelection,
  resolveReasoningForModel,
  type AgentRuntimeSelection,
} from "./runtimes.js";
import type { DataLane } from "../api/types.js";
import { readString, writeString } from "./storage.js";

export type ModalDetailLevel = "simple" | "advanced";
export type RepoOutfallStrategy = "worktree" | "fresh-clone" | "branch";

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
  };
}

/** Validates a persisted runtime selection against currently runnable ecosystems, models, and reasoning levels. */
function sanitizeSelection(
  sel: Partial<AgentRuntimeSelection> | undefined,
  fallback: AgentRuntimeSelection,
): AgentRuntimeSelection {
  if (!sel?.ecosystem) return fallback;
  const eco = CLI_ECOSYSTEMS.find((c) => c.id === sel.ecosystem);
  if (!eco || !eco.runnable) return fallback;
  const model = sel.model && eco.models.includes(sel.model) ? sel.model : eco.defaultModel;
  const reasoning = resolveReasoningForModel(eco.id, model, sel.reasoning);
  return {
    ecosystem: eco.id,
    model,
    reasoning,
  };
}

export function loadWorkDefaults(mode: EngineeringMode): WorkDefaults {
  const base = factoryDefaults(mode);
  const raw = readString(`${STORAGE_PREFIX}${mode}`);
  if (!raw) return base;
  try {
    const parsed = JSON.parse(raw) as Partial<WorkDefaults>;
    return {
      ...base,
      ...parsed,
      author: sanitizeSelection(parsed.author, base.author),
      checker: sanitizeSelection(parsed.checker, base.checker),
      detailLevel: parsed.detailLevel === "advanced" ? "advanced" : "simple",
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
