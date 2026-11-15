import { useSyncExternalStore } from "react";
import { readString, writeString } from "./storage.js";

/**
 * Workspace engineering mode (matches spec Mode = "general" | "software" | "capital-projects").
 * Controls terminology, board column titles, custody roles, project stages, and deliverable issue lists.
 */
export type EngineeringMode = "software" | "capital-projects";

const MODE_KEY = "cr.mode";
const MODES: readonly EngineeringMode[] = ["software", "capital-projects"];

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
    objectiveLabel: "Change scope & test criteria",
    objectivePlaceholder: "Describe the patch, invariant, or regression test required…",
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
    disciplines: ["Backend", "Frontend", "Infra / Sandbox", "Security", "API / Spec"],
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
    disciplines: ["Process", "Mechanical", "Electrical", "I&C", "Civil / Structural", "Piping"],
  },
};
