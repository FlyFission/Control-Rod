import { describe, expect, it } from "vitest";
import { CANVAS, CAPACITY, CUBE_SETS, NAME_BAND, REGION, REGIONS, ROOMS, route, validateLayout } from "./layout.js";

/** The canonical layout graph (plan task 4.1; specification 13). */
describe("layout graph", () => {
  it("holds the six cube sets and seven rooms, each named, inside the canvas and clear of each other", () => {
    expect(REGIONS.map((r) => r.id)).toEqual([...CUBE_SETS, ...ROOMS]);
    expect(validateLayout()).toEqual([]);
    expect(REGION["your-office"].name).toBe("Your office");
  });

  it("seats four in Your office and queues the rest at its door", () => {
    expect(REGION["your-office"].seats).toHaveLength(4);
    expect(REGION["your-office"].queue.length).toBeGreaterThanOrEqual(4);
  });

  it("holds at least 40 figures before the floor has to fold", () => {
    expect(CAPACITY).toBeGreaterThanOrEqual(40);
  });

  it("routes every region to every other through the corridor", () => {
    const path = route("process", "quarantine");
    expect(path[0]).toEqual(REGION.process.door);
    expect(path.at(-1)).toEqual(REGION.quarantine.door);
    expect(path.every((p) => p.x >= 0 && p.x <= CANVAS.width)).toBe(true);
  });

  it("rejects a graph that breaks its invariants", () => {
    const moved = REGIONS.map((r) => (r.id === "bench" ? { ...r, x: REGION["your-office"].x } : r));
    expect(validateLayout(moved).some((p) => p.includes("overlaps"))).toBe(true);
    const crowded = REGIONS.map((r) => (r.id === "review" ? { ...r, seats: [{ x: r.x + 10, y: r.y + NAME_BAND / 2 }] } : r));
    expect(validateLayout(crowded)).toContain("review has a seat under its name plate");
    expect(validateLayout(REGIONS.filter((r) => r.id !== "quarantine"))).toContain("quarantine is missing");
    const stranger = [...REGIONS, { ...REGION.bench, id: "lobby" as never, x: 0, y: 0 }];
    expect(() => validateLayout(stranger)).not.toThrow();
    expect(validateLayout(stranger)).toContain("lobby is not a region of the office");
    const miskinded = REGIONS.map((r) => (r.id === "review" ? { ...r, kind: "cube-set" as const } : r));
    expect(validateLayout(miskinded)).toContain("review has the wrong kind");
  });
});
