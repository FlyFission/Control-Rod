import { useId, useState } from "react";
import type { WorkLane, WorkLaneChoice, WorkLaneSet } from "../../api/types.js";

/**
 * The project's Plant bays: which set of work lanes the six work bays carry (Software, Capital project
 * or custom) and, for custom, the lanes themselves. It changes only what the bays are called and how
 * work is placed in them; the art does not change. Saving is a signed project update (the caller's job).
 * At most six lanes: the Plant has six work bays, and a seventh would have none to stand in.
 */
export const MAX_LANES = 6;

const PRESETS = [
  { id: "capital-project", label: "Capital project", names: "Process, Mechanical, Electrical, Civil, Assurance, Project controls" },
  { id: "software", label: "Software", names: "Frontend, Backend, Platform, Data, Tests, Docs" },
  { id: "custom", label: "Custom", names: "Up to six lanes you name" },
] as const;

export const presetLabel = (preset: string | undefined) => PRESETS.find((p) => p.id === preset)?.label ?? "Capital project";

interface Row {
  id: string;
  name: string;
  purpose: string;
  paths: string;
  keywords: string;
}

const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
const rowOf = (l: WorkLane): Row => ({ id: l.id, name: l.name, purpose: l.purpose, paths: (l.paths ?? []).join(", "), keywords: (l.keywords ?? []).join(", ") });

/** A lane id from its name: lowercase words joined by hyphens, starting with a letter, unique among the others. */
export function laneId(name: string, taken: readonly string[]): string {
  let base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 28);
  if (!/^[a-z]/.test(base)) base = `lane-${base}`.replace(/-$/, "");
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`;
  return id;
}

/** The request the form stands for, or why it cannot be sent. */
export function choiceOf(preset: WorkLaneChoice["preset"], rows: readonly Row[]): { choice: WorkLaneChoice } | { problem: string } {
  if (preset !== "custom") return { choice: { preset } };
  const named = rows.filter((r) => r.name.trim());
  if (named.length === 0) return { problem: "Name at least one lane." };
  if (named.length > MAX_LANES) return { problem: `A project has at most ${MAX_LANES} lanes: the Plant has ${MAX_LANES} work bays.` };
  if (new Set(named.map((r) => r.name.trim().toLowerCase())).size !== named.length) return { problem: "Lane names must be different from each other." };
  if (named.some((r) => r.name.trim().length > 24)) return { problem: "A lane name is 24 characters at most, to fit the bay's plate." };
  const taken: string[] = [];
  const lanes = named.map((r) => {
    const id = r.id && !taken.includes(r.id) ? r.id : laneId(r.name, taken);
    taken.push(id);
    const paths = list(r.paths);
    const keywords = list(r.keywords);
    return { id, name: r.name.trim(), purpose: r.purpose.trim(), ...(keywords.length ? { keywords } : {}), ...(paths.length ? { paths } : {}) };
  });
  return { choice: { preset, lanes } };
}

export function WorkLanesSetting({ current, pending, onSave }: { current: WorkLaneSet | undefined; pending: boolean; onSave: (choice: WorkLaneChoice) => void }) {
  const uid = useId();
  const [preset, setPreset] = useState<WorkLaneChoice["preset"]>(current?.preset ?? "capital-project");
  const [rows, setRows] = useState<Row[]>(() => (current?.preset === "custom" ? current.lanes.map(rowOf) : [{ id: "", name: "", purpose: "", paths: "", keywords: "" }]));
  const [problem, setProblem] = useState<string | null>(null);
  const shown = PRESETS.find((p) => p.id === preset)!;
  const change = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <details className="bd-lanes">
      <summary aria-label={`Plant bays: ${presetLabel(current?.preset)}. Change.`}>
        <span className="small muted">Plant bays:</span> {presetLabel(current?.preset)}
      </summary>
      <div className="bd-lanes-body">
        <label className="bd-lanes-field">
          <span>Bay names follow</span>
          <select
            className="bd-lens-select"
            value={preset}
            onChange={(e) => {
              setPreset(e.target.value as WorkLaneChoice["preset"]);
              setProblem(null);
            }}
          >
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </label>
        <p className="small muted" id={`${uid}-names`}>{shown.names}.{preset === "software" ? " Work no tag, path or keyword places stands in Platform." : preset === "capital-project" ? " Work with no recognised discipline stands in Process." : ""}</p>
        {preset === "custom" && (
          <>
            {rows.map((r, i) => (
              <fieldset className="bd-lanes-row" key={i}>
                <legend className="small">Lane {i + 1}</legend>
                <label>
                  <span>Lane {i + 1} name</span>
                  <input type="text" value={r.name} maxLength={24} onChange={(e) => change(i, { name: e.target.value })} />
                </label>
                <label>
                  <span>Lane {i + 1} purpose</span>
                  <input type="text" value={r.purpose} maxLength={120} onChange={(e) => change(i, { purpose: e.target.value })} />
                </label>
                <label>
                  <span>Lane {i + 1} repository paths</span>
                  <input type="text" value={r.paths} placeholder="apps/web/, docs/" onChange={(e) => change(i, { paths: e.target.value })} />
                </label>
                <label>
                  <span>Lane {i + 1} keywords</span>
                  <input type="text" value={r.keywords} placeholder="whole words in a card's discipline" onChange={(e) => change(i, { keywords: e.target.value })} />
                </label>
                <button type="button" className="btn small" disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                  Remove lane {i + 1}
                </button>
              </fieldset>
            ))}
            <button type="button" className="btn small" disabled={rows.length >= MAX_LANES} onClick={() => setRows((rs) => [...rs, { id: "", name: "", purpose: "", paths: "", keywords: "" }])}>
              Add lane
            </button>
            {rows.length >= MAX_LANES && <span className="small muted"> The Plant has {MAX_LANES} work bays, so {MAX_LANES} lanes is the most.</span>}
          </>
        )}
        {problem && <p className="small" role="alert">{problem}</p>}
        <button
          type="button"
          className="btn small"
          disabled={pending}
          onClick={() => {
            const r = choiceOf(preset, rows);
            if ("problem" in r) setProblem(r.problem);
            else {
              setProblem(null);
              onSave(r.choice);
            }
          }}
        >
          Save Plant bays
        </button>
      </div>
    </details>
  );
}
