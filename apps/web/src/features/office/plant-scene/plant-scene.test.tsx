import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlantInstruments, StageFigure } from "../OfficeStage.js";
import { PlantScene, POSE } from "./PlantScene.js";
import { PLACE_IDS, ROOMS } from "./geometry.js";
import { flowSegments } from "./flow.js";

afterEach(cleanup);

const lit: PlantInstruments = { core: { lit: true, caption: "1 agent working" }, rods: { position: "withdrawn" }, waiting: false };
const fig = (id: string, state: StageFigure["state"], place: keyof typeof ROOMS, seat = 0): StageFigure => ({
  id,
  code: id,
  name: `WP-${id}`,
  state,
  cause: `${state} cause`,
  region: place,
  at: { x: ROOMS[place].seats[seat]!.x, y: ROOMS[place].seats[seat]!.y },
  body: 0,
});
const occ = (figs: StageFigure[]) => {
  const m = new Map<string, { count: number; working: number }>();
  for (const f of figs) {
    const o = m.get(f.region) ?? { count: 0, working: 0 };
    m.set(f.region, { count: o.count + 1, working: o.working + (f.state === "working" ? 1 : 0) });
  }
  return m;
};
const scene = (figures: StageFigure[], instruments = lit, onSelect?: (id: string) => void) =>
  render(<PlantScene figures={figures} instruments={instruments} occupancy={occ(figures)} onSelect={onSelect} />);

describe("PlantScene", () => {
  it("lights a room exactly when it holds a figure", () => {
    const { container } = scene([fig("A", "working", "process"), fig("B", "waiting", "review")]);
    const litRooms = [...container.querySelectorAll<HTMLElement>('[data-hero="room"]')].filter((r) => r.dataset.lit === "true").map((r) => r.dataset.room);
    expect(litRooms.sort()).toEqual(["process", "review"]);
    expect(container.querySelectorAll('[data-hero="room"]')).toHaveLength(PLACE_IDS.length);
  });

  it("shows the tripped core on a SCRAM and the healthy core otherwise; a drill is not a trip", () => {
    const shown = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('[data-hero="core"]')].filter((i) => i.dataset.shown === "true").map((i) => i.dataset.core);
    const a = scene([fig("A", "working", "process")]);
    expect(shown(a.container)).toEqual(["healthy"]);
    a.unmount();
    const b = scene([fig("A", "working", "process")], { ...lit, rods: { position: "inserted", caption: "SCRAM in force" } });
    expect(shown(b.container)).toEqual(["tripped"]);
    b.unmount();
    const c = scene([fig("A", "working", "process")], { ...lit, rods: { position: "bank" } });
    expect(shown(c.container)).toEqual(["tripped"]);
    c.unmount();
    const d = scene([fig("A", "working", "process")], { ...lit, rods: { position: "drill" } });
    expect(shown(d.container)).toEqual(["healthy"]);
  });

  it("keeps figure buttons focusable with their full names, and selects on click", async () => {
    const onSelect = vi.fn();
    scene([fig("A", "needs", "your-office"), fig("B", "stuck", "review")], lit, onSelect);
    const b = screen.getByRole("button", { name: /^WP-A: Needs you/ });
    screen.getByRole("button", { name: /^WP-B: Stuck/ });
    b.focus();
    expect(document.activeElement).toBe(b);
    await userEvent.click(b);
    expect(onSelect).toHaveBeenCalledWith("A");
  });

  it("draws each state with its crew pose; an input that changed uses waiting plus a diamond mark", () => {
    const figs = [fig("W", "working", "process"), fig("L", "waiting", "process", 1), fig("S", "stuck", "process", 2), fig("N", "needs", "your-office"), fig("C", "changed", "interface")];
    const { container } = scene(figs);
    const pose = (id: string) => container.querySelector(`[data-figure-art="${id}"] img`)!.getAttribute("src");
    expect(pose("W")).toBe("/plant/crew/working.webp");
    expect(pose("L")).toBe("/plant/crew/waiting.webp");
    expect(pose("S")).toBe("/plant/crew/stuck.webp");
    expect(pose("N")).toBe("/plant/crew/needs-you.webp");
    expect(pose("C")).toBe("/plant/crew/waiting.webp");
    expect(POSE.changed).toBe("waiting");
    expect(container.querySelector('[data-figure-art="C"] .plant-lamp path')!.getAttribute("d")).toMatch(/^M4 \.8/);
  });

  it("relapse check: hero slots are raster images only, and vector shapes appear only inside named overlays", () => {
    const figs = [fig("W", "working", "process"), fig("N", "needs", "your-office"), fig("C", "changed", "interface")];
    const { container } = render(<PlantScene figures={figs} instruments={{ ...lit, waiting: true }} occupancy={occ(figs)} />);
    const heroes = [...container.querySelectorAll("[data-hero]")];
    expect(heroes.length).toBe(1 + PLACE_IDS.length + 2 + figs.length);
    for (const h of heroes) {
      expect(h.tagName).toBe("IMG");
      expect(h.getAttribute("src")).toMatch(/^\/plant\/.+\.webp$/);
      expect(h.querySelector("svg, path, circle, rect, polygon, canvas")).toBeNull();
      expect(h.closest("svg")).toBeNull();
    }
    // Every drawn shape belongs to a Lamp, a FlowStripe, or a figure's own semantic button.
    for (const shape of container.querySelectorAll("svg, path, polyline, circle, rect, polygon")) {
      expect(shape.closest('[data-overlay="lamp"], [data-overlay="flow"], .plant-scene-flow, .office-figure')).not.toBeNull();
    }
    // Painted layers are hidden from assistive technology.
    expect(container.querySelector('[data-layer="scene"]')!.getAttribute("aria-hidden")).toBe("true");
  });

  it("draws steady stripes by the plan: lit into a room with a working figure, amber into the control room only while something waits, none in a SCRAM", () => {
    const figs = [fig("A", "working", "process"), fig("V", "working", "verification"), fig("R", "waiting", "review")];
    const o = occ(figs);
    expect(flowSegments(o, false, false).map((s) => s.id).sort()).toEqual(["process>verification"]);
    const waiting = flowSegments(o, true, false);
    expect(waiting.filter((s) => s.tone === "needs-you").map((s) => s.id).sort()).toEqual(["review>your-office", "verification>your-office"]);
    expect(flowSegments(o, true, true)).toEqual([]);
    expect(flowSegments(new Map(), true, false)).toEqual([]);
  });
});
