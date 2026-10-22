import type { OfficeItem, WorkPackage } from "../api/types.js";

export type ColumnId = "ready" | "drafting" | "agent-check" | "person-verifies" | "needs-signature" | "reached";

export const COLUMNS: { id: ColumnId; title: string }[] = [
  { id: "ready", title: "Ready" },
  { id: "drafting", title: "Drafting" },
  { id: "agent-check", title: "Agent check" },
  { id: "person-verifies", title: "Person verifies" },
  { id: "needs-signature", title: "Needs signature" },
  { id: "reached", title: "Reached next rung" },
];

/**
 * Board columns are work steps toward a package's next rung. A card's status is still its rung.
 * Closed packages leave the board.
 */
export function boardColumn(pkg: WorkPackage, hasPreCheck: boolean): ColumnId | null {
  switch (pkg.status) {
    case "draft":
      return "ready";
    case "released":
    case "in-work":
      return "drafting";
    case "in-verification":
      return hasPreCheck ? "needs-signature" : "agent-check";
    case "accepted":
      return "reached";
    case "closed":
      return null;
  }
}

/** A package whose acceptance is waiting in the office has finished its pre-check. */
export function preCheckDone(pkg: WorkPackage, office: OfficeItem[]): boolean {
  return office.some(
    (o) => o.package_id === pkg.id && o.package_revision === pkg.revision && (o.kind === "accept" || o.kind === "dispute"),
  );
}

export function groupBoard(packages: WorkPackage[], office: OfficeItem[]): Record<ColumnId, WorkPackage[]> {
  const out: Record<ColumnId, WorkPackage[]> = {
    ready: [],
    drafting: [],
    "agent-check": [],
    "person-verifies": [],
    "needs-signature": [],
    reached: [],
  };
  for (const p of packages) {
    const col = boardColumn(p, preCheckDone(p, office));
    if (col !== null) out[col].push(p);
  }
  return out;
}
