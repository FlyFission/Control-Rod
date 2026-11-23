import { useSyncExternalStore } from "react";
import type { ColumnId } from "./board.js";
import { readString, writeString } from "./storage.js";

/**
 * Workspace engineering mode (Software, Capital Projects, or Nuclear-Grade PRO).
 * Controls terminology, board column titles, custody roles, project stages, and deliverable issue lists.
 */
export type EngineeringMode = "software" | "capital-projects" | "nuclear-grade";

const MODE_KEY = "cr.mode";
const MODES: readonly EngineeringMode[] = ["software", "capital-projects", "nuclear-grade"];

export function loadMode(): EngineeringMode {
  const v = readString(MODE_KEY);
  return MODES.find((m) => m === v) ?? "software";
}

const modeListeners = new Set<() => void>();

/** Persists the selected engineering mode and notifies all subscribed views. */
export function saveMode(mode: EngineeringMode): void {
  writeString(MODE_KEY, mode);
  for (const fn of modeListeners) fn();
}

/** Reactive engineering mode store backed by localStorage. */
export function useMode(): EngineeringMode {
  return useSyncExternalStore(
    (fn) => {
      modeListeners.add(fn);
      return () => void modeListeners.delete(fn);
    },
    loadMode,
    () => "software" as EngineeringMode,
  );
}

export interface ModeCopy {
  id: EngineeringMode;
  label: string;
  shortLabel: string;
  newCta: string;
  modalTitle: string;
  projectPlaceholder: string;
  objectiveLabel: string;
  objectivePlaceholder: string;
  columns: {
    ready: string;
    in_work: string;
    pre_check: string;
    awaiting_acceptance: string;
    accepted: string;
    blocked: string;
  };
  boardColumns: {
    ready: string;
    drafting: string;
    "agent-check": string;
    "person-verifies": string;
    "needs-signature": string;
    reached: string;
  };
  custodyRoles: readonly [string, string, string];
  specialGrade: { value: "safety"; label: string };
  projectStages: readonly string[];
  issuePurposes: readonly string[];
  disciplines: readonly string[];
}

export const MODE_COPY: Record<EngineeringMode, ModeCopy> = {
  software: {
    id: "software",
    label: "Software",
    shortLabel: "Software",
    newCta: "New change",
    modalTitle: "New change request",
    projectPlaceholder: "e.g., control-rod / auth-kernel",
    objectiveLabel: "Scope & acceptance criteria",
    objectivePlaceholder:
      "Describe what you are building end-to-end — goals, architecture, deliverables, constraints, and how completion is verified…",
    columns: {
      ready: "Ready",
      in_work: "Implementing",
      pre_check: "CI / Agent check",
      awaiting_acceptance: "Peer review",
      accepted: "Accepted",
      blocked: "Blocked",
    },
    boardColumns: {
      ready: "Ready",
      drafting: "Implementing",
      "agent-check": "CI / Agent check",
      "person-verifies": "Peer review",
      "needs-signature": "Needs signature",
      reached: "Accepted",
    },
    custodyRoles: ["1. Author (Agent)", "2. Reviewer (fresh ctx)", "3. Maintainer"],
    specialGrade: { value: "safety", label: "High-risk / security" },
    projectStages: [
      "General / Ad-hoc",
      "Spike / RFC",
      "Feature",
      "Bugfix",
      "Security / Hotfix",
      "Migration / Schema",
      "Release Candidate",
    ],
    issuePurposes: [
      "PR / Diff Review",
      "Design Doc / ADR",
      "CI Verification",
      "Hotfix Patch",
      "Release Tag",
    ],
    disciplines: ["Unspecified", "Backend", "Frontend", "Infra / Sandbox", "Security", "API / Spec"],
  },
  "capital-projects": {
    id: "capital-projects",
    label: "Capital Projects",
    shortLabel: "Capital Projects",
    newCta: "New deliverable",
    modalTitle: "New engineering deliverable",
    projectPlaceholder: "e.g., UNIT-400 / Flare Header Expansion",
    objectiveLabel: "Design basis & acceptance criteria",
    objectivePlaceholder: "Describe the calculation, datasheet, drawing, or code check required…",
    columns: {
      ready: "Issued for work",
      in_work: "Drafting",
      pre_check: "Pre-check",
      awaiting_acceptance: "Checker review",
      accepted: "Accepted",
      blocked: "Blocked",
    },
    boardColumns: {
      ready: "Issued for work",
      drafting: "Drafting",
      "agent-check": "Pre-check",
      "person-verifies": "Checker review",
      "needs-signature": "Needs approval",
      reached: "Accepted",
    },
    custodyRoles: ["1. Preparer (Drafting)", "2. Checker (O6)", "3. Approving Owner"],
    specialGrade: { value: "safety", label: "Safety-grade" },
    projectStages: [
      "Preconceptual",
      "Conceptual (10%)",
      "Preliminary (30%)",
      "Detailed Design (60%)",
      "Final Design (90%)",
      "IFC (100%)",
    ],
    issuePurposes: [
      "Issue for Review (IFR)",
      "Issue for Design (IFD)",
      "Issue for Permit (IFP)",
      "Issue for Bid / Tender (IFB)",
      "Issue for Construction (IFC)",
      "For Information Only (FIO)",
      "As-Built / Record",
    ],
    disciplines: ["Unspecified", "Process", "Mechanical", "Electrical", "I&C", "Civil / Structural", "Piping"],
  },
  "nuclear-grade": {
    id: "nuclear-grade",
    label: "Nuclear-Grade",
    shortLabel: "Nuclear-Grade",
    newCta: "New packet",
    modalTitle: "New change packet",
    projectPlaceholder: "e.g., control-rod / auth-boundary",
    objectiveLabel: "Decision question & acceptance criteria",
    objectivePlaceholder:
      "Describe the decision question, controlled items, assumptions, stop conditions, and verification evidence required…",
    columns: {
      ready: "P · Question & Plan",
      in_work: "R · Execute",
      pre_check: "R · Verify & Probe",
      awaiting_acceptance: "R · Independent Review",
      accepted: "O · Baseline & OPEX",
      blocked: "Blocked",
    },
    boardColumns: {
      ready: "P · Question & Plan",
      drafting: "R · Execute",
      "agent-check": "R · Verify & Probe",
      "person-verifies": "R · Independent Review",
      "needs-signature": "R · Decide (Ship/Block)",
      reached: "O · Baseline & OPEX",
    },
    custodyRoles: ["Executor (Author)", "Independent Verifier", "Release Authority"],
    specialGrade: { value: "safety", label: "High-consequence" },
    projectStages: [
      "Question & Discover",
      "Specify & Plan",
      "Execute",
      "Verify & Review",
      "Release Decision",
      "Baseline & Operate",
      "OPEX Learning",
    ],
    issuePurposes: [
      "Quick Change Packet",
      "Standard Change Packet",
      "Agent Authority Change",
      "Controlled Configuration Update",
      "Release Readiness Decision",
      "OPEX Learning Action",
    ],
    disciplines: [
      "Unspecified",
      "Agent Authority & Tooling",
      "Configuration & Baseline",
      "Dependency & Model Trust",
      "Source & Assurance Boundary",
      "Security & Red Team",
      "Runtime & Verification",
    ],
  },
};

export interface ProLaneSkill {
  name: string;
  summary: string;
}

const PRO_SKILLS = {
  "questioning-attitude": {
    name: "questioning-attitude",
    summary: "Challenging assumptions before work, review, or release continues",
  },
  "using-nuclear-grade": {
    name: "using-nuclear-grade",
    summary: "Adopting the workflow for a change or repo with mode, packet, and evidence paths",
  },
  "classifying-change-risk": {
    name: "classifying-change-risk",
    summary: "Selecting Quick, Standard, or stronger human-reviewed mode and evidence obligations",
  },
  "identifying-controlled-items": {
    name: "identifying-controlled-items",
    summary: "Deciding what configuration must be controlled",
  },
  "screening-change-impact": {
    name: "screening-change-impact",
    summary: "Checking downstream impact and revalidation triggers",
  },
  "creating-change-packets": {
    name: "creating-change-packets",
    summary: "Creating or updating Quick or Standard change packet files",
  },
  "packing-agent-context": {
    name: "packing-agent-context",
    summary: "Preparing focused agent or reviewer context packs",
  },
  "self-checking-agent-actions": {
    name: "self-checking-agent-actions",
    summary: "Checking critical agent edits, commands, public claims, trust changes, or releases before action",
  },
  "turning-over-agent-work": {
    name: "turning-over-agent-work",
    summary: "Handing off unfinished agent, review, verification, release, or resumed-thread work",
  },
  "controlling-mission-drift": {
    name: "controlling-mission-drift",
    summary: "Re-anchoring, escalating, or stopping when work drifts, scope creeps, or rigor erodes",
  },
  "proving-claims": {
    name: "proving-claims",
    summary: "Mapping claims to evidence rows, tests, reviews, and gaps",
  },
  "reviewing-code-quality": {
    name: "reviewing-code-quality",
    summary: "Reviewing a diff or module for standards drift and needless complexity",
  },
  "red-teaming-agent-changes": {
    name: "red-teaming-agent-changes",
    summary: "Adversarially probing tool grants, dependencies, models, or releases for misuse or escalation",
  },
  "tracing-agent-execution": {
    name: "tracing-agent-execution",
    summary: "Capturing tool calls, decisions, inputs, outputs, token use, and approval gates as execution evidence",
  },
  "checking-dependency-and-model-trust": {
    name: "checking-dependency-and-model-trust",
    summary: "Reviewing dependency, model, API, SaaS, generated artifact, or vendor trust",
  },
  "checking-source-lineage": {
    name: "checking-source-lineage",
    summary: "Reviewing citation and source-family claims for source-safe wording",
  },
  "checking-license-and-assurance-boundaries": {
    name: "checking-license-and-assurance-boundaries",
    summary: "Reviewing license and assurance language for boundary-safe wording",
  },
  "reviewing-ship-readiness": {
    name: "reviewing-ship-readiness",
    summary: "Deciding ship, block, defer, or ship-with-risk from evidence, residual risk, and rollback",
  },
  "baselining-configuration": {
    name: "baselining-configuration",
    summary: "Recording accepted controlled configuration state as a baseline",
  },
  "learning-from-opex": {
    name: "learning-from-opex",
    summary: "Turning near misses, bad handoffs, review surprises, or operating signals into durable updates",
  },
} as const satisfies Record<string, ProLaneSkill>;

/**
 * All 20 Nuclear-Grade skills from SKILLS.md mapped across the PRO (Plan · Run · Operate) board lanes.
 */
export const PRO_LANE_SKILLS: Record<ColumnId, { name: string; summary: string }[]> = {
  ready: [
    PRO_SKILLS["questioning-attitude"],
    PRO_SKILLS["using-nuclear-grade"],
    PRO_SKILLS["classifying-change-risk"],
    PRO_SKILLS["identifying-controlled-items"],
    PRO_SKILLS["screening-change-impact"],
    PRO_SKILLS["creating-change-packets"],
    PRO_SKILLS["packing-agent-context"],
  ],
  drafting: [
    PRO_SKILLS["self-checking-agent-actions"],
    PRO_SKILLS["turning-over-agent-work"],
    PRO_SKILLS["controlling-mission-drift"],
  ],
  "agent-check": [
    PRO_SKILLS["proving-claims"],
    PRO_SKILLS["reviewing-code-quality"],
    PRO_SKILLS["red-teaming-agent-changes"],
    PRO_SKILLS["tracing-agent-execution"],
    PRO_SKILLS["checking-dependency-and-model-trust"],
    PRO_SKILLS["checking-source-lineage"],
    PRO_SKILLS["checking-license-and-assurance-boundaries"],
  ],
  "person-verifies": [
    PRO_SKILLS["proving-claims"],
    PRO_SKILLS["reviewing-code-quality"],
  ],
  "needs-signature": [
    PRO_SKILLS["reviewing-ship-readiness"],
  ],
  reached: [
    PRO_SKILLS["baselining-configuration"],
    PRO_SKILLS["learning-from-opex"],
  ],
};
