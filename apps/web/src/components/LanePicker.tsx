import type { DataLane } from "../api/types.js";

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

/** Picks the data lane that decides which AI runtimes may see a piece of work. */
export function LanePicker({ id, value, onChange }: { id: string; value: DataLane; onChange: (lane: DataLane) => void }) {
  return (
    <span className="lane-picker">
      <label htmlFor={id}>Data lane</label>{" "}
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as DataLane)}>
        {LANES.map((l) => (
          <option key={l.value} value={l.value}>{l.label}</option>
        ))}
      </select>
      {LOCAL_ONLY.has(value) && <span className="muted small"> Stays on this computer until a provider is approved for this lane.</span>}
    </span>
  );
}
