import type { DataLane, WorkspaceProject } from "../api/types.js";
import { extractBracketTag, useProjects } from "../lib/projects.js";

/** Data lanes, least to most sensitive, in the words a person chooses by. */
export const LANES: { value: DataLane; label: string }[] = [
  { value: "public", label: "Public" },
  { value: "internal", label: "Internal" },
  { value: "proprietary", label: "Proprietary" },
  { value: "client-confidential", label: "Client confidential" },
  { value: "restricted", label: "Restricted" },
];

/** Lanes whose work stays on this computer until a provider is approved for them. */
export const LOCAL_ONLY = new Set<DataLane>(["proprietary", "client-confidential", "restricted"]);

/** The lane new work takes when nothing else says: the same default a new project starts with. */
export const STANDARD_LANE: DataLane = "internal";

/** The lane a new card takes with no extra step: the active project's default, else the standard lane. */
export function defaultLaneFor(project: Pick<WorkspaceProject, "lane"> | null | undefined): DataLane {
  return project?.lane ?? STANDARD_LANE;
}

/** Where a lane sits from least (0) to most sensitive. */
export function laneRank(lane: DataLane): number {
  return LANES.findIndex((l) => l.value === lane);
}

/**
 * The lane an existing capture is offered first: the default of the project its own [project-id] tag
 * names, not whichever project happens to be open, else the standard lane.
 */
export function useCaptureDefaultLane(text: string | undefined): DataLane {
  const projects = useProjects();
  const id = extractBracketTag(text, "project-id");
  return defaultLaneFor(id ? projects.find((p) => p.id === id) : undefined);
}

export function laneLabel(lane: DataLane): string {
  return LANES.find((l) => l.value === lane)?.label ?? lane;
}

/** What a lane changes today, in one line (disclosure.ts LANE_RUNTIMES, sandbox.ts NETWORK_LANES, figures.ts PRESENTABLE). */
export function laneEffect(lane: DataLane): string {
  return LOCAL_ONLY.has(lane)
    ? "From now on only agents on this computer take its work; no cloud agent is sent anything new."
    : "Cloud agents (Claude, Codex and the others) may be sent its work.";
}

/**
 * Picks the data lane that decides which AI runtimes may see a piece of work. `atLeast` leaves out the
 * lanes below it, for raising a card's lane: lowering one is a signed declassification, not a pick.
 */
export function LanePicker({
  id,
  value,
  onChange,
  atLeast,
  label = "Data lane",
}: {
  id: string;
  value: DataLane;
  onChange: (lane: DataLane) => void;
  atLeast?: DataLane;
  label?: string;
}) {
  const floor = atLeast ? LANES.findIndex((l) => l.value === atLeast) : 0;
  return (
    <span className="lane-picker">
      <label htmlFor={id}>{label}</label>{" "}
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as DataLane)}>
        {LANES.slice(Math.max(floor, 0)).map((l) => (
          <option key={l.value} value={l.value}>{l.label}</option>
        ))}
      </select>
      {LOCAL_ONLY.has(value) && <span className="muted small"> Stays on this computer until a provider is approved for this lane.</span>}
    </span>
  );
}
