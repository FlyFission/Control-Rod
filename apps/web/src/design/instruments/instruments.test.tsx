import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RodPosition } from "../../features/office/plant-instruments.js";
import { AnnunciatorTile } from "./AnnunciatorTile.js";
import { InstrumentFrame } from "./InstrumentFrame.js";
import { RodGauge } from "./RodGauge.js";

const reduced = (on: boolean) =>
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: on && q.includes("reduce"), media: q, addEventListener: () => {}, removeEventListener: () => {} }));
const setHidden = (hidden: boolean) => {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event("visibilitychange"));
};
afterEach(() => {
  vi.unstubAllGlobals();
  setHidden(false);
});

describe("InstrumentFrame", () => {
  it("names the region by its label and shows its children", () => {
    render(<InstrumentFrame label="Annunciator"><p>inside</p></InstrumentFrame>);
    expect(screen.getByRole("region", { name: "Annunciator" }).textContent).toContain("inside");
  });
  it.each(["normal", "needs", "trip"] as const)("carries the %s tone", (tone) => {
    render(<InstrumentFrame label="X" tone={tone}>y</InstrumentFrame>);
    expect(screen.getByRole("region").getAttribute("data-tone")).toBe(tone);
  });
  it("defaults to the normal tone", () => {
    render(<InstrumentFrame label="X">y</InstrumentFrame>);
    expect(screen.getByRole("region").getAttribute("data-tone")).toBe("normal");
  });
});

describe("RodGauge", () => {
  const cases: [RodPosition, RegExp, number][] = [
    ["withdrawn", /withdrawn, no SCRAM in force/, 0],
    ["bank", /project bank inserted/, 1],
    ["inserted", /all inserted/, 3],
    ["drill", /Drill SCRAM in force: work stopped/, 3],
    ["unknown", /SCRAM status unavailable/, 0],
  ];
  it.each(cases)("states %s in words and drops the right rods", (position, name, dropped) => {
    reduced(false);
    const { container } = render(<RodGauge position={position} />);
    expect(screen.getByRole("img", { name }).getAttribute("data-position")).toBe(position);
    expect(container.querySelectorAll('[data-dropped="true"]')).toHaveLength(dropped);
  });
  it("appends the caption to the name", () => {
    render(<RodGauge position="inserted" caption="stop not yet recorded" />);
    expect(screen.getByRole("img", { name: /all inserted.*stop not yet recorded/ })).toBeTruthy();
  });
  it("moves at once under reduced motion and in a hidden tab, and animates otherwise", () => {
    reduced(true);
    const { unmount } = render(<RodGauge position="withdrawn" />);
    expect(screen.getByRole("img").getAttribute("data-motion")).toBe("still");
    unmount();
    reduced(false);
    render(<RodGauge position="withdrawn" />);
    expect(screen.getByRole("img").getAttribute("data-motion")).toBe("full");
    act(() => setHidden(true));
    expect(screen.getByRole("img").getAttribute("data-motion")).toBe("still");
  });
});

describe("AnnunciatorTile", () => {
  it("is a button, dark and glyph-free when clear", () => {
    const { container } = render(<AnnunciatorTile label="Stuck" active={false} lamp="trip" />);
    const b = screen.getByRole("button", { name: "Stuck, clear" });
    expect(b.getAttribute("data-lit")).toBe("false");
    expect(container.querySelector("svg")).toBeNull();
  });
  it.each([
    ["needs-you", "bang"],
    ["trip", "cross"],
    ["neutral", "diamond"],
  ] as const)("lights a %s tile with its %s glyph, named lit", (lamp, glyph) => {
    const { container } = render(<AnnunciatorTile label="L" active lamp={lamp} readout="2" />);
    expect(screen.getByRole("button", { name: "L, 2, lit" }).getAttribute("data-lamp")).toBe(lamp);
    expect(container.querySelector("svg")!.getAttribute("data-glyph")).toBe(glyph);
  });
  it("accepts an explicit glyph, so waiting can be a pause on the neutral lamp", () => {
    const { container } = render(<AnnunciatorTile label="Waiting" active glyph="pause" />);
    expect(container.querySelector("svg")!.getAttribute("data-glyph")).toBe("pause");
  });
  it("activates on click and on Enter", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const onActivate = vi.fn();
    render(<AnnunciatorTile label="Stuck" active onActivate={onActivate} />);
    const b = screen.getByRole("button");
    b.focus();
    await userEvent.keyboard("{Enter}");
    expect(onActivate).toHaveBeenCalledTimes(1);
    fireEvent.click(b);
    expect(onActivate).toHaveBeenCalledTimes(2);
  });
  it("stops pulsing under reduced motion and in a hidden tab", () => {
    reduced(true);
    const { unmount } = render(<AnnunciatorTile label="S" active />);
    expect(screen.getByRole("button").getAttribute("data-motion")).toBe("still");
    unmount();
    reduced(false);
    render(<AnnunciatorTile label="S" active />);
    expect(screen.getByRole("button").getAttribute("data-motion")).toBe("full");
    act(() => setHidden(true));
    expect(screen.getByRole("button").getAttribute("data-motion")).toBe("still");
  });
});
