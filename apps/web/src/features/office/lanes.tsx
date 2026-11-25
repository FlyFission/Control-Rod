import { createContext, useContext } from "react";
import type { AgentFigure, WorkLaneSet } from "../../api/types.js";
import type { EngineeringMode } from "../../lib/mode.js";
import { CUBE_SETS, REGION, type RegionId } from "./layout.js";

/**
 * What the Plant's six work bays are called. A bay is a position on the floor (its id is a slot, as the
 * layout and the art know it); the project's work lanes say what each position is. The art, the
 * geometry and every figure's `place` stay as they are: only the words follow the project, so a
 * Software project reads Frontend, Backend, Platform, Data, Tests and Docs on the same six tiles.
 * A project without lanes reads as the capital-project preset, which is the layout's own names.
 */
export interface Bay {
  name: string;
  purpose: string;
}
export type BayNames = Readonly<Partial<Record<RegionId, Bay>>>;

const BayNamesContext = createContext<BayNames>({});
export const BayNamesProvider = BayNamesContext.Provider;

/** The words for one place: the project's lane for a work bay, the layout's own for every room. */
export function bayOf(names: BayNames, id: string): Bay {
  const own = names[id as RegionId];
  if (own) return own;
  const base = REGION[id as RegionId];
  return base ? { name: base.name, purpose: base.purpose } : { name: id, purpose: "" };
}

export function useBayNames() {
  const names = useContext(BayNamesContext);
  return {
    names,
    name: (id: string) => bayOf(names, id).name,
    purpose: (id: string) => bayOf(names, id).purpose,
  };
}

/** A bay no lane stands in (a custom set of fewer than six lanes). */
export const SPARE_BAY: Bay = { name: "Spare bay", purpose: "No work lane is set for this bay" };

/** Lane i stands in bay i. */
export function bayNamesFor(set: WorkLaneSet | undefined): BayNames {
  if (!set) return {};
  return Object.fromEntries(CUBE_SETS.map((slot, i) => [slot, set.lanes[i] ? { name: set.lanes[i]!.name, purpose: set.lanes[i]!.purpose } : SPARE_BAY]));
}

/**
 * The lane set the Plant's bays follow: the set of the project with the most work on the floor (the
 * lower project id on a tie). With one project, or projects that share a set, that is every project's
 * set. Work from a project with a different set is still named by its own lane on its card.
 */
export function plantLaneSet(figures: readonly AgentFigure[], sets: readonly { project_id: string; work_lanes: WorkLaneSet }[] | undefined): WorkLaneSet | undefined {
  if (!sets?.length) return undefined;
  const count = new Map<string, number>();
  for (const f of figures) if (f.project_id && f.lane) count.set(f.project_id, (count.get(f.project_id) ?? 0) + 1);
  const ranked = [...sets].sort((a, b) => (count.get(b.project_id) ?? 0) - (count.get(a.project_id) ?? 0) || a.project_id.localeCompare(b.project_id));
  return ranked[0]!.work_lanes;
}

/**
 * The six bays of the Software preset, as the server's `software` work-lane preset names them (services/api
 * src/work-lanes.ts). Shown when no project on the floor has chosen its own lanes and the mode is Software.
 */
const SOFTWARE_BAYS: readonly Bay[] = [
  { name: "Frontend", purpose: "User interface, browser code and styling" },
  { name: "Backend", purpose: "Services, APIs and server logic" },
  { name: "Platform", purpose: "Build, deploy, infrastructure and general engineering" },
  { name: "Data", purpose: "Schemas, migrations, storage and pipelines" },
  { name: "Tests", purpose: "Automated tests, fixtures and quality checks" },
  { name: "Docs", purpose: "Documentation, guides and decision records" },
];

/**
 * The shared rooms in each engineering mode's own words. The rooms do the same job in every mode (the
 * figures' places do not change); only what a person in that trade calls them does. Capital projects is
 * the layout's own wording.
 */
const MODE_ROOMS: Readonly<Record<EngineeringMode, BayNames>> = {
  software: {
    interface: { name: "Dependencies", purpose: "Work waiting on another team's change" },
    verification: { name: "CI and checks", purpose: "Independent pre-checks and automated checks" },
    "document-control": { name: "Releases", purpose: "Accepted work, release notes and records" },
  },
  "capital-projects": {},
  "nuclear-grade": {
    assurance: { name: "QA", purpose: "Quality assurance, safety and licensing work" },
    verification: { name: "Independent verification", purpose: "Checks by someone who did not do the work" },
    "document-control": { name: "Records", purpose: "Controlled documents, records and transmittals" },
  },
};

/** A word for the Plant header: what the bays and rooms are named after. */
export function bayModeWords(set: WorkLaneSet | undefined, mode: EngineeringMode): string {
  if (set) return set.preset === "software" ? "Software lanes" : set.preset === "custom" ? "Project lanes" : "Capital project lanes";
  return mode === "software" ? "Software lanes" : mode === "nuclear-grade" ? "Nuclear grade" : "Capital project lanes";
}

/**
 * The Plant's words for the engineering mode. A project's own lanes name the bays when it has them; without
 * them the bays follow the mode (Software lanes in Software, the capital-project disciplines otherwise). The
 * shared rooms always speak the mode's language.
 */
export function plantNamesFor(set: WorkLaneSet | undefined, mode: EngineeringMode): BayNames {
  const bays: BayNames = set
    ? bayNamesFor(set)
    : mode === "software"
      ? Object.fromEntries(CUBE_SETS.map((slot, i) => [slot, SOFTWARE_BAYS[i]!]))
      : {};
  // A project lane wins over the mode's room word where both name the same place.
  return { ...MODE_ROOMS[mode], ...bays };
}
