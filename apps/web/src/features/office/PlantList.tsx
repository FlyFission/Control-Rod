import type { AgentFigure } from "../../api/types.js";
import { STATE_INFO, StateMark } from "../../components/StateMark.js";
import { REGION, REGIONS, type RegionId } from "./layout.js";
import type { PlantLayout, ZoneId } from "./plant-layout.js";
import { marksInWords } from "./OfficeStage.js";

/**
 * The Plant as a list (plant view design, section 10): every figure, none folded, grouped by zone and
 * place, each a button that opens the same agent card. It is the view on narrow screens and a choice
 * at any width, so nothing the drawing shows is reachable only by pointer at a size it fits.
 */
export function PlantList({ figures, layout, labels, selected, onSelect }: { figures: readonly AgentFigure[]; layout: PlantLayout | undefined; labels: Readonly<Record<string, { label: string }>>; selected: string | undefined; onSelect: (id: string) => void }) {
  // The view says why the floor is empty, once, under the list or the drawing.
  if (figures.length === 0) return null;
  const byPlace = new Map<RegionId, AgentFigure[]>();
  for (const f of figures) byPlace.set(f.place, [...(byPlace.get(f.place) ?? []), f]);
  // Zones outside in, as the drawing reads; the office layout has none, so one group.
  const zones: { id: ZoneId | "all"; name: string; places: RegionId[] }[] = layout
    ? layout.zones
        .filter((z) => z.id !== "reactor")
        .map((z) => ({ id: z.id, name: z.name, places: REGIONS.map((r) => r.id).filter((id) => layout.zoneOf[id] === z.id) }))
    : [{ id: "all", name: "Floor", places: REGIONS.map((r) => r.id) }];
  return (
    <div className="plant-list" aria-label="Every agent, by place">
      {zones.map((z) => {
        const places = z.places.filter((p) => byPlace.has(p));
        if (places.length === 0) return null;
        return (
          <section key={z.id} aria-labelledby={`plant-list-${z.id}`}>
            <h3 id={`plant-list-${z.id}`}>{z.name}</h3>
            {places.map((p) => (
              <div key={p}>
                <p className="plant-list-place">
                  {REGION[p].name}, {labels[p]?.label}
                </p>
                <ul>
                  {byPlace
                    .get(p)!
                    .slice()
                    .sort((a, b) => Date.parse(a.since) - Date.parse(b.since) || a.package_id.localeCompare(b.package_id))
                    .map((f) => <FigureRow key={f.id} figure={f} selected={selected === f.id} onSelect={onSelect} />)}
                </ul>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

/**
 * One agent as a list row: the state's shape and word, the title, the id in mono, then the real cause
 * and any marks, in words. Every list of figures (the Plant list, a room's "+N more" panel and the
 * archived office's overflow) uses it, so a figure reads the same everywhere.
 */
export function FigureRow({ figure: f, selected, onSelect }: { figure: AgentFigure; selected: boolean; onSelect: (id: string) => void }) {
  // The same marks the drawing carries, in words: gate, changed input, round, Safety grade.
  const marks = marksInWords({ gate: f.marks.gate, changed: Boolean(f.marks.changed_input), ...(f.marks.loop ? { loop: f.marks.loop } : {}), safety: f.marks.safety });
  // The cause is shown when it says something the state chip does not (not empty, not the state's own word).
  const bare = f.cause.trim().toLowerCase().replace(/[.\s]+$/, "");
  const extra = bare && bare !== STATE_INFO[f.state].label.toLowerCase() && !/^[a-z ]+ cause$/.test(bare) ? f.cause : "";
  return (
    <li>
      <button
        type="button"
        className="plant-list-row"
        data-state={f.state}
        aria-pressed={selected}
        aria-label={`${f.package_id}: ${STATE_INFO[f.state].label}. ${f.title}. ${f.cause}${marks ? ` Marks: ${marks}.` : ""}`}
        onClick={() => onSelect(f.id)}
      >
        <span className="plant-list-chip">
          <StateMark kind={f.state} size={11} />
          <span>{STATE_INFO[f.state].label}</span>
        </span>
        <span className="plant-list-title">{f.title}</span>
        <span className="plant-list-id">{f.package_id}</span>
        {extra && <span className="plant-list-cause">{extra}</span>}
        {marks && <span className="plant-list-marks">Marks: {marks}.</span>}
      </button>
    </li>
  );
}
