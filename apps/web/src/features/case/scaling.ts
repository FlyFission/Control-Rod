import type { WorkPackage } from "../../api/types.js";

/**
 * Rigor and grade scaling (specification 14; plan task 3.7). Floors are identical in every tier;
 * only presentation scales: how much of each section opens by default. Nothing is removed: every
 * part stays one "Show everything" away, and the pre-check is shown in every tier, because the
 * kernel requires it in every tier.
 */
export interface Presentation {
  tier: "administrative" | "quick" | "standard" | "high-consequence";
  /** Asked: a line, a brief (objective and a few criteria), the full requirements, or full plus design inputs. */
  asked: "line" | "brief" | "full" | "full-inputs";
  /** Ran: a summary per run, the story with trace facts, or the full story with attestation. */
  ran: "summary" | "story" | "full";
  /** Checked: the pre-check compactly, with findings, or per criterion with custody. */
  checked: "compact" | "findings" | "criteria";
  /** Attestation claims are mandatory evidence (high consequence). */
  attestationRequired: boolean;
  /** The decision needs a hardware backed, credentialed signer (high consequence grade). */
  hardwareSigner: boolean;
  /** Agent checks are pre-checks only and a person must verify (Safety and Material grade). */
  personVerification: boolean;
  /** How many criteria the brief shows before "Show everything". */
  criteriaShown: number;
}

const highGrade = (pkg: WorkPackage) => pkg.grade === "safety" || pkg.grade === "material";

export function presentation(pkg: WorkPackage): Presentation {
  // Safety and Material grade work is presented at least as high consequence, whatever its rigor.
  const tier = highGrade(pkg) ? "high-consequence" : pkg.rigor_mode;
  const base = { tier, hardwareSigner: highGrade(pkg), personVerification: highGrade(pkg) } as const;
  switch (tier) {
    case "administrative":
      return { ...base, asked: "line", ran: "summary", checked: "compact", attestationRequired: false, criteriaShown: 2 };
    case "quick":
      return { ...base, asked: "brief", ran: "story", checked: "findings", attestationRequired: false, criteriaShown: 4 };
    case "standard":
      return { ...base, asked: "full", ran: "full", checked: "criteria", attestationRequired: false, criteriaShown: Infinity };
    case "high-consequence":
      return { ...base, asked: "full-inputs", ran: "full", checked: "criteria", attestationRequired: true, criteriaShown: Infinity };
  }
}

export const TIER_LABEL: Record<Presentation["tier"], string> = {
  administrative: "Administrative",
  quick: "Quick",
  standard: "Standard",
  "high-consequence": "High consequence",
};
