import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { harnessFigures } from "./fixtures.js";
import { REGIONS } from "./layout.js";
import { OfficeStage } from "./OfficeStage.js";
import bright from "./themes/harness-bright.js";
import standard from "./themes/standard-office.js";

/** The office stage's two layers (plan tasks 4.3 and 4.5; specification 18). */
describe("office stage", () => {
  it("names every region canonically beside its themed label, and hides the scene from assistive technology", () => {
    const { container } = render(<OfficeStage theme={bright} figures={[]} />);
    for (const r of REGIONS) {
      const region = screen.getByRole("region", { name: `${r.name}: ${r.purpose}` });
      expect(within(region).getByText(r.name)).toBeTruthy();
      expect(within(region).getByText(bright.regions[r.id].label)).toBeTruthy();
    }
    const scene = container.querySelector('[data-layer="scene"]')!;
    expect(scene.getAttribute("aria-hidden")).toBe("true");
    expect([...scene.querySelectorAll("img")].every((i) => i.getAttribute("alt") === "")).toBe(true);
    // The theme reaches the page only as image sources under its own folder and a backdrop colour.
    expect([...scene.querySelectorAll("img")].every((i) => i.getAttribute("src")!.startsWith("/office-themes/harness-bright/"))).toBe(true);
  });

  it("gives every figure a name that says its state and cause, and selects it on click", async () => {
    const onSelect = vi.fn();
    const figures = harnessFigures(5);
    render(<OfficeStage theme={standard} figures={figures} selected="f2" onSelect={onSelect} />);
    expect(screen.getByRole("button", { name: "WP-101: Working. Drafting the line sizing calculation" })).toBeTruthy();
    const needs = screen.getByRole("button", { name: "WP-102: Needs you. Your signature on revision 2" });
    expect(needs.getAttribute("aria-pressed")).toBe("true");
    await userEvent.click(screen.getByRole("button", { name: /^WP-104: Stuck/ }));
    expect(onSelect).toHaveBeenCalledWith("f4");
  });

  it("seats 40 figures by state, needs-you figures in Your office then at its door", () => {
    const figures = harnessFigures(40);
    const needs = figures.filter((f) => f.state === "needs");
    expect(needs.every((f) => f.region === "your-office")).toBe(true);
    expect(new Set(figures.map((f) => `${f.at.x},${f.at.y}`)).size).toBe(40);
    expect(() => harnessFigures(200)).toThrow(/no place/);
  });
});
