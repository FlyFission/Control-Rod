import { MODE_COPY, type EngineeringMode } from "./mode.js";
import {
  defaultAuthorSelection,
  defaultCheckerSelection,
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

export function loadWorkDefaults(mode: EngineeringMode): WorkDefaults {
  const base = factoryDefaults(mode);
  const raw = readString(`${STORAGE_PREFIX}${mode}`);
  if (!raw) return base;
  try {
    const parsed = JSON.parse(raw) as Partial<WorkDefaults>;
    return {
      ...base,
      ...parsed,
      author: parsed.author?.ecosystem ? parsed.author : base.author,
      checker: parsed.checker?.ecosystem ? parsed.checker : base.checker,
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

export interface ClarifyingQuestion {
  id: string;
  prompt: string;
  options: readonly [string, string, string, string];
}

/**
 * Generates 3 targeted 4-option multiple-choice questions to expand a short scope
 * into unambiguous execution & verification criteria.
 */
export function buildClarifyingQuestions(
  mode: EngineeringMode,
  text: string,
  discipline: string,
  stage: string,
): ClarifyingQuestion[] {
  const shortTopic = text.trim().slice(0, 48) || (mode === "software" ? "this change" : "this deliverable");

  if (mode === "software") {
    return [
      {
        id: "verification",
        prompt: `How should the checker verify "${shortTopic}" (${discipline})?`,
        options: [
          "Unit + integration tests without mocks (Recommended)",
          "End-to-end Playwright flow + accessibility check",
          "Typecheck, lint, and static contract check only",
          "Reproduce bug first, then prove regression test passes",
        ],
      },
      {
        id: "blast_radius",
        prompt: `What is the blast radius and rollback posture for this ${stage}?`,
        options: [
          "Isolated module — directly revertible (Recommended)",
          "Cross-service or API schema change (needs compatibility check)",
          "Database migration (requires forward + rollback plan)",
          "Security / auth / sandbox boundary (requires O6 independent check)",
        ],
      },
      {
        id: "confinement",
        prompt: "What runtime environment & network posture should the agent use?",
        options: [
          "Local sandbox, no external egress (Recommended)",
          "CI runner with pinned package registry only",
          "Read-only research & plan first (no file writes)",
          "Full local dev harness against localhost daemon",
        ],
      },
    ];
  }

  return [
    {
      id: "code_basis",
      prompt: `Which governing basis applies to "${shortTopic}" (${discipline})?`,
      options: [
        "Applicable ASME / API / NFPA / NEC code + project spec (Recommended)",
        "Client / owner design basis memorandum only",
        "Preliminary vendor datasheet (mark unverified inputs as holds)",
        "For information / conceptual screening only",
      ],
    },
    {
      id: "maturity_gate",
      prompt: `What completeness level is expected for ${stage}?`,
      options: [
        "All assumptions & hold points explicitly listed (Recommended)",
        "Preliminary sizing & equipment count (±20–30%)",
        "Inter-discipline squad check ready (inputs frozen)",
        "Final stamped / IFC-ready calculation & datasheet package",
      ],
    },
    {
      id: "custody_level",
      prompt: "What verification rigor & sign-off is required before issue?",
      options: [
        "Independent O6 checker (different CLI) + owner passkey (Recommended)",
        "Same-discipline senior peer review + passkey",
        "Automated pre-check & unit consistency check only",
        "Hold at Checker Review pending vendor certified data",
      ],
    },
  ];
}
