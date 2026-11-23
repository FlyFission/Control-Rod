import type { AgentFigure } from "../../api/types.js";
import { STATE_INFO, StateMark } from "../../components/StateMark.js";
import type { OfficeThemeV1 } from "./contract.js";
import { REGION, REGIONS, type RegionId } from "./layout.js";
import type { PlantLayout, ZoneId } from "./plant-layout.js";
import { marksInWords } from "./OfficeStage.js";

/**
 * The Plant as a list (plant view design, section 10): every figure, none folded, grouped by zone and
 * place, each a button that opens the same agent card. It is the view on narrow screens and a choice
 * at any width, so nothing the drawing shows is reachable only by pointer at a size it fits.
 */
export function PlantList({ figures, layout, labels, selected, onSelect }: { figures: readonly AgentFigure[]; layout: PlantLayout | undefined; labels: OfficeThemeV1["regions"]; selected: string | undefined; onSelect: (id: string) => void }) {
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
                <p className="small muted" style={{ margin: "6px 0 2px" }}>
                  {REGION[p].name}, {labels[p].label}
                </p>
                <ul>
                  {byPlace
                    .get(p)!
                    .slice()
                    .sort((a, b) => Date.parse(a.since) - Date.parse(b.since) || a.package_id.localeCompare(b.package_id))
                    .map((f) => {
                      // The same marks the drawing carries, in words: gate, changed input, round, Safety grade.
                      const marks = marksInWords({ gate: f.marks.gate, changed: Boolean(f.marks.changed_input), ...(f.marks.loop ? { loop: f.marks.loop } : {}), safety: f.marks.safety });
                      return (
                        <li key={f.id}>
                          <button type="button" className="link" aria-pressed={selected === f.id} onClick={() => onSelect(f.id)}>
                            <StateMark kind={f.state} size={10} /> {f.package_id}: {STATE_INFO[f.state].label}. {f.cause}
                            {marks && <> <span className="plant-list-marks">Marks: {marks}.</span></>}
                          </button>
                        </li>
                      );
                    })}
                </ul>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
