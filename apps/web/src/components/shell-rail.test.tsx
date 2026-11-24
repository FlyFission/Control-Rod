import { afterEach, describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { server } from "../test/server.js";
import { renderPage } from "../test/render.js";
import type { Session } from "../api/types.js";
import { Shell } from "./Shell.js";
import { RAIL_DEFAULT_PX, RAIL_MAX_PX, RAIL_MIN_PX, loadRailLayout, railLayoutKey, saveRailLayout } from "../lib/railLayout.js";

const ben = { registered: true, signed_in: true, user: "ben" } as Session;
const longName = "Hanford Tank Side Cesium Removal Ion Exchange Column Redesign";

function api() {
  server.use(
    http.get("*/inbox", () => HttpResponse.json({ items: [] })),
    http.get("*/workspace/projects", () =>
      HttpResponse.json([{ id: "p1", name: longName, mode: "software", repo: "FlyFission/tank-side-cesium" }]),
    ),
  );
}

const rail = () => document.getElementById("cr-rail")!;
const toggle = () => screen.getByRole("button", { name: /navigation/ });

afterEach(() => window.localStorage.clear());

describe("the navigation rail", () => {
  it("hides and shows from the top bar button, keeping the rail out of the tab order while hidden", async () => {
    api();
    await renderPage(<Shell session={ben}><p>app</p></Shell>);
    const user = userEvent.setup();
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(rail().hasAttribute("inert")).toBe(false);
    await user.click(toggle());
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(toggle().textContent).toContain("Show navigation");
    expect(rail().hasAttribute("inert")).toBe(true);
    expect(loadRailLayout("ben").collapsed).toBe(true);
    await user.click(toggle());
    expect(rail().hasAttribute("inert")).toBe(false);
    expect(loadRailLayout("ben")).toEqual({ width: RAIL_DEFAULT_PX, collapsed: false });
  });

  it("toggles with [ outside a field, and types [ inside one", async () => {
    api();
    await renderPage(<Shell session={ben}><input aria-label="Notes" /></Shell>);
    const user = userEvent.setup();
    await user.keyboard("[[");
    expect(rail().hasAttribute("inert")).toBe(true);
    await user.keyboard("[[");
    expect(rail().hasAttribute("inert")).toBe(false);
    await user.click(screen.getByLabelText("Notes"));
    await user.keyboard("[[");
    expect(rail().hasAttribute("inert")).toBe(false);
    expect((screen.getByLabelText("Notes") as HTMLInputElement).value).toBe("[");
  });

  it("opens at the person's saved width and tucked state, and keeps each person's own", async () => {
    api();
    saveRailLayout("ben", { width: 360, collapsed: true });
    saveRailLayout("dora", { width: 210, collapsed: false });
    await renderPage(<Shell session={ben}><p>app</p></Shell>);
    expect(rail().hasAttribute("inert")).toBe(true);
    await userEvent.setup().click(toggle());
    expect(rail().closest("[data-panel]")?.getAttribute("data-size-px")).toBe("360");
    expect(loadRailLayout("dora")).toEqual({ width: 210, collapsed: false });
  });

  it("shows a project's full name and repository on hover", async () => {
    api();
    await renderPage(<Shell session={ben}><p>app</p></Shell>);
    const btn = await screen.findByRole("button", { name: new RegExp(longName) });
    expect(btn.getAttribute("title")).toBe(`${longName} (FlyFission/tank-side-cesium)`);
  });

  it("names the drag handle for assistive tech", async () => {
    api();
    await renderPage(<Shell session={ben}><p>app</p></Shell>);
    expect(screen.getByRole("separator", { name: "Navigation width" })).toBeTruthy();
  });
});

describe("saved rail layout", () => {
  it("clamps bad or out-of-range values and survives junk", () => {
    window.localStorage.setItem(railLayoutKey("ben"), "{not json");
    expect(loadRailLayout("ben")).toEqual({ width: RAIL_DEFAULT_PX, collapsed: false });
    window.localStorage.setItem(railLayoutKey("ben"), JSON.stringify({ width: 9999, collapsed: "yes" }));
    expect(loadRailLayout("ben")).toEqual({ width: RAIL_MAX_PX, collapsed: false });
    saveRailLayout("ben", { width: 10, collapsed: true });
    expect(loadRailLayout("ben")).toEqual({ width: RAIL_MIN_PX, collapsed: true });
  });
});
