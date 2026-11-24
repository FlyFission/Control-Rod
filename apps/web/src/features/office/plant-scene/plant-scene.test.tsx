import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
  title: `Title of ${id}`,
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
    const lits = [...container.querySelectorAll<HTMLElement>('[data-tile-layer="lit"]')];
    expect(lits.filter((r) => r.dataset.lit === "true").map((r) => r.dataset.room).sort()).toEqual(["process", "review"]);
    // Every room has its dark tile, its lit tile and its front layer, from the geometry alone.
    expect(lits).toHaveLength(PLACE_IDS.length);
    for (const layer of ["dark", "front"]) expect(container.querySelectorAll(`[data-tile-layer="${layer}"]`)).toHaveLength(PLACE_IDS.length);
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

  it("draws each state with its crew pose; an input that changed uses waiting plus a Changed chip, never a dot", async () => {
    // One room each, so every roster lists its figure.
    const figs = [fig("W", "working", "process"), fig("L", "waiting", "mechanical"), fig("S", "stuck", "electrical"), fig("N", "needs", "your-office"), fig("C", "changed", "interface")];
    const { container } = scene(figs);
    const pose = (id: string) => container.querySelector(`[data-figure-art="${id}"] img`)!.getAttribute("src");
    expect(pose("W")).toBe("/plant/crew/working.webp");
    expect(pose("L")).toBe("/plant/crew/waiting.webp");
    expect(pose("S")).toBe("/plant/crew/stuck.webp");
    expect(pose("N")).toBe("/plant/crew/needs-you.webp");
    expect(pose("C")).toBe("/plant/crew/waiting.webp");
    expect(POSE.changed).toBe("waiting");
    // Rooms without a needs-you or stuck figure start collapsed; hovering a figure opens its room's roster.
    const words: string[] = [];
    for (const f of figs) {
      await userEvent.hover(container.querySelector(`[data-figure="${f.id}"]`)!);
      const chip = container.querySelector(`[data-row="${f.id}"] .plant-chip`)!;
      words.push(chip.textContent!);
      // Every chip carries a shape as well as its word; there are no small state dots on the figures.
      expect(chip.querySelector("svg")).not.toBeNull();
    }
    expect(words).toEqual(["Working", "Waiting", "Stuck", "Needs you", "Changed"]);
    expect(container.querySelectorAll(".plant-figure-art .plant-lamp")).toHaveLength(0);
  });

  it("lists each room's agents on one roster plate: room name, rows with badge, short title and state chip, and the full name on a figure's focus", async () => {
    const { container } = scene([fig("A", "needs", "your-office"), fig("B", "working", "your-office", 1)]);
    const plates = container.querySelectorAll('[data-label="roster"][data-room="your-office"]');
    expect(plates).toHaveLength(1);
    const plate = plates[0] as HTMLElement;
    expect(plate.querySelector(".plant-roster-name")!.textContent).toBe("Your office");
    const rows = plate.querySelectorAll<HTMLElement>(".plant-row");
    expect(rows).toHaveLength(2);
    // The most urgent first; each row has a badge, a title and a chip with a shape and its word.
    expect(rows[0]!.textContent).toContain("Title of A");
    expect(rows[0]!.querySelector(".agent-badge")).not.toBeNull();
    expect(rows[0]!.querySelector(".plant-chip svg")).not.toBeNull();
    // No runtime is recorded for the figure yet: the badge is its role glyph.
    expect(rows[0]!.querySelector(".agent-badge")!.getAttribute("data-badge")).toBe("role-other");
    // The figure buttons carry no plate of their own any more; the rows are a picture, hidden from assistive technology.
    const b = screen.getByRole("button", { name: /^WP-A: Needs you/ });
    expect(b.querySelector(".plant-nameplate")).toBeNull();
    expect(rows[0]!.getAttribute("aria-hidden")).toBe("true");
    expect(b.getAttribute("aria-description")).toBe("Title of A");
    expect(b.getAttribute("aria-label")).toContain("Title of A");
    expect(b.querySelector(".plant-tip")!.textContent).toBe("WP-A: Title of A");
    expect(container.querySelector(".plant-tip")!.getAttribute("aria-hidden")).toBe("true");
  });

  it("links a figure and its roster row: focusing or hovering either highlights both", async () => {
    const { container } = scene([fig("A", "working", "process"), fig("B", "stuck", "process", 1)]);
    const row = (id: string) => container.querySelector(`[data-row="${id}"]`)!;
    const btn = screen.getByRole("button", { name: /^WP-B: Stuck/ });
    btn.focus();
    await waitFor(() => expect(row("B").hasAttribute("data-hot")).toBe(true));
    expect(btn.hasAttribute("data-hot")).toBe(true);
    expect(row("A").hasAttribute("data-hot")).toBe(false);
    btn.blur();
    await waitFor(() => expect(row("B").hasAttribute("data-hot")).toBe(false));
    await userEvent.hover(row("A"));
    expect(screen.getByRole("button", { name: /^WP-A: Working/ }).hasAttribute("data-hot")).toBe(true);
  });

  it("rings a needs-you figure at its feet, and no other", () => {
    const { container } = scene([fig("N", "needs", "your-office"), fig("W", "working", "process")]);
    expect(container.querySelectorAll('[data-overlay="halo"]')).toHaveLength(1);
    expect(container.querySelector('[data-figure-art="N"] [data-overlay="halo"]')).not.toBeNull();
  });

  it("shows the agent's icon when the figure records its runtime, and the generic glyph for an unknown provider", async () => {
    const withRuntime = (id: string, runtime: string, place: keyof typeof ROOMS): StageFigure => ({ ...fig(id, "working", place), runtime });
    scene([withRuntime("A", "codex", "process"), withRuntime("B", "some-new-agent", "review")]);
    const badge = async (id: string) => {
      await userEvent.hover(document.querySelector(`[data-figure="${id}"]`)!);
      return document.querySelector(`[data-row="${id}"] .agent-badge`)!.getAttribute("data-badge");
    };
    expect(await badge("A")).toBe("codex");
    expect(await badge("B")).toBe("generic");
    // The agent is also in the figure's accessible name.
    expect(screen.getByRole("button", { name: /^WP-A:.* Agent: codex\.$/ })).toBeTruthy();
  });

  it("shows three rows and a +N more button that opens the room, with every seated figure still a button", async () => {
    const onOpenRoom = vi.fn();
    const figs = [fig("A", "working", "process", 0), fig("B", "working", "process", 1), fig("C", "working", "process", 2), fig("D", "stuck", "process", 3)];
    const { container } = render(<PlantScene figures={figs} instruments={lit} occupancy={occ(figs)} onOpenRoom={onOpenRoom} />);
    const rows = container.querySelectorAll('[data-room="process"] .plant-row');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(3);
    const more = screen.getByRole("button", { name: /^Process: \d+ more agents?\. Show them/ });
    expect(Number(more.textContent!.replace(/\D/g, "")) + rows.length).toBe(4);
    expect(screen.getAllByRole("button", { name: /^WP-/ })).toHaveLength(4);
    // The stuck figure stands out: it is listed before the working ones.
    expect(rows[0]!.getAttribute("data-state")).toBe("stuck");
    await userEvent.click(more);
    expect(onOpenRoom).toHaveBeenCalledWith("process");
  });

  it("switches to a count plate per room when the scene is too small for readable figures", async () => {
    const spy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 342, height: 214, x: 0, y: 0, top: 0, left: 0, right: 342, bottom: 214, toJSON: () => ({}) });
    try {
      const onOpenRoom = vi.fn();
      const figs = [fig("A", "needs", "process"), fig("B", "working", "process", 1), fig("C", "working", "process", 2), fig("D", "stuck", "review")];
      const { container } = render(<PlantScene figures={figs} instruments={lit} occupancy={occ(figs)} onOpenRoom={onOpenRoom} />);
      expect(container.querySelector(".plant-scene")!.getAttribute("data-mode")).toBe("counts");
      expect(container.querySelectorAll("[data-hero='figure']")).toHaveLength(0);
      // The tiles are still drawn: the count is on them.
      expect(container.querySelectorAll("[data-tile-layer='dark']")).toHaveLength(PLACE_IDS.length);
      expect(screen.queryAllByRole("button", { name: /^WP-/ })).toHaveLength(0);
      const process = screen.getByRole("button", { name: "Process: 3 agents, 1 Needs you, 2 Working. Show them." });
      expect(screen.getByRole("button", { name: "Review: 1 agent, 1 Stuck. Show them." })).toBeTruthy();
      await userEvent.click(process);
      expect(onOpenRoom).toHaveBeenCalledWith("process");
    } finally {
      spy.mockRestore();
    }
  });

  it("draws a section for every room in the geometry, with no list of rooms in the component", () => {
    const { container } = scene([]);
    const drawn = [...container.querySelectorAll<HTMLElement>(".plant-room")].map((r) => r.dataset.region);
    expect(drawn).toEqual(PLACE_IDS);
  });

  it("relapse check: hero slots are raster images only, and vector shapes appear only inside named overlays", () => {
    const figs = [fig("W", "working", "process"), fig("N", "needs", "your-office"), fig("C", "changed", "interface")];
    const { container } = render(<PlantScene figures={figs} instruments={{ ...lit, waiting: true }} occupancy={occ(figs)} />);
    const heroes = [...container.querySelectorAll("[data-hero]")];
    expect(heroes.length).toBe(1 + PLACE_IDS.length * 3 + 2 + figs.length);
    for (const h of heroes) {
      expect(h.tagName).toBe("IMG");
      expect(h.getAttribute("src")).toMatch(/^\/plant\/.+\.webp$/);
      expect(h.querySelector("svg, path, circle, rect, polygon, canvas")).toBeNull();
      expect(h.closest("svg")).toBeNull();
    }
    // Every drawn shape belongs to a Lamp, a FlowStripe, a Halo, or a roster row's, count plate's or figure's own button.
    for (const shape of container.querySelectorAll("svg, path, polyline, circle, rect, polygon")) {
      expect(shape.closest('[data-overlay="lamp"], [data-overlay="flow"], [data-overlay="halo"], .plant-scene-flow, .plant-figure, .plant-count, .plant-roster, .plant-leaders')).not.toBeNull();
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
