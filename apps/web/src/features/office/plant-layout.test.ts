import { describe, expect, it } from "vitest";
import { CUBE_SETS, REGION, ROOMS } from "./layout.js";
import { PLANT_CAPACITY, PLANT_LABELS, PLANT_LAYOUT, type PlantLayout, validatePlantLayout } from "./plant-layout.js";

/** The plant's canonical layout (plant view design, section 5). */
describe("plant layout", () => {
  it("holds the same 13 places as the office, with the same functional names, and passes every invariant", () => {
    expect(PLANT_LAYOUT.regions.map((r) => r.id)).toEqual([...CUBE_SETS, ...ROOMS]);
    for (const r of PLANT_LAYOUT.regions) expect(r.name).toBe(REGION[r.id].name);
    expect(validatePlantLayout()).toEqual([]);
  });

  it("keeps the office's canvas width, so 960 pixels is still the 0.8 minimum zoom", () => {
    expect(PLANT_LAYOUT.canvas.width).toBe(1200);
  });

  it("seats four in the main control room and queues the rest on the inner walkway", () => {
    expect(PLANT_LAYOUT.region["your-office"].seats).toHaveLength(4);
    expect(PLANT_LAYOUT.region["your-office"].queue.length).toBeGreaterThanOrEqual(4);
    expect(PLANT_LABELS["your-office"]).toBe("Main control room");
  });

  it("puts the work bays in the auxiliary building, held work outside the fence, and no one in the reactor building", () => {
    for (const id of CUBE_SETS) expect(PLANT_LAYOUT.zoneOf[id]).toBe("auxiliary");
    expect(PLANT_LAYOUT.zoneOf.quarantine).toBe("site");
    expect(PLANT_LAYOUT.zoneOf.bench).toBe("site");
    expect(PLANT_LAYOUT.zoneOf["your-office"]).toBe("fence");
    expect(PLANT_LAYOUT.zones.find((z) => z.id === "reactor")).toMatchObject(PLANT_LAYOUT.core);
  });

  it("holds at least 40 figures before the floor has to fold", () => {
    expect(PLANT_CAPACITY).toBeGreaterThanOrEqual(40);
  });

  it("rejects a plant that breaks its invariants", () => {
    const with_ = (patch: Partial<PlantLayout>): PlantLayout => ({ ...PLANT_LAYOUT, ...patch });
    const intoCore = PLANT_LAYOUT.regions.map((r) => (r.id === "verification" ? { ...r, x: PLANT_LAYOUT.core.x + 10 } : r));
    expect(validatePlantLayout(with_({ regions: intoCore }))).toContain("verification stands in the reactor building");
    const outside = PLANT_LAYOUT.regions.map((r) => (r.id === "review" ? { ...r, x: 1100 } : r));
    expect(validatePlantLayout(with_({ regions: outside }))).toContain("review is not wholly inside the fence zone");
    const strayQueue = PLANT_LAYOUT.regions.map((r) => (r.id === "your-office" ? { ...r, queue: [{ x: 400, y: 600 }] } : r));
    expect(validatePlantLayout(with_({ regions: strayQueue }))).toContain("your-office queues off a walkway");
    const noGate = with_({ gates: [] });
    expect(validatePlantLayout(noGate)).toContain("the site-road walkway cannot be reached from the others");
    const crossing = PLANT_LAYOUT.zones.map((z) => (z.id === "auxiliary" ? { ...z, y: z.y - 100 } : z));
    expect(validatePlantLayout(with_({ zones: crossing })).some((p) => p.includes("cross"))).toBe(true);
    const doorless = PLANT_LAYOUT.regions.map((r) => (r.id === "bench" ? { ...r, door: { x: r.x + 10, y: r.y + r.h } } : r));
    expect(validatePlantLayout(with_({ regions: doorless }))).toContain("bench has no walkway at its door");
  });
});
