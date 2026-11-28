import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { server } from "../test/server.js";
import { renderPage } from "../test/render.js";
import type { Session } from "../api/types.js";
import { Shell } from "./Shell.js";
import { setSingleKeys } from "../lib/singleKeys.js";
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
  it("marks the Inbox link when the inbox cannot be read, so a failed read never looks like an empty inbox", async () => {
    api();
    server.use(http.get("*/inbox", () => HttpResponse.json({ code: "internal", message: "down" }, { status: 500 })));
    await renderPage(<Shell session={ben}><p>app</p></Shell>);
    expect((await screen.findAllByLabelText("Inbox could not be read")).length).toBeGreaterThan(0);
  });

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

  it("hands focus to the toggle when [ hides the rail from inside it", async () => {
    api();
    await renderPage(<Shell session={ben}><p>app</p></Shell>);
    const user = userEvent.setup();
    const proj = await screen.findByRole("button", { name: new RegExp(longName) });
    proj.focus();
    await user.keyboard("[[");
    expect(rail().hasAttribute("inert")).toBe(true);
    expect(document.activeElement).toBe(toggle());
  });

  it("keeps the workspace mounted, with an unsaved draft, across the phone breakpoint", async () => {
    api();
    let matches = false;
    const listeners = new Set<() => void>();
    vi.stubGlobal("matchMedia", (query: string) => ({
      get matches() { return query === "(max-width: 820px)" ? matches : false; },
      media: query,
      addEventListener: (_: string, l: () => void) => listeners.add(l),
      removeEventListener: (_: string, l: () => void) => listeners.delete(l),
      addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false,
    }));
    try {
      await renderPage(<Shell session={ben}><input aria-label="Draft" /></Shell>);
      const draft = screen.getByLabelText("Draft") as HTMLInputElement;
      await userEvent.setup().type(draft, "half a thought");
      act(() => { matches = true; listeners.forEach((l) => l()); });
      expect(document.getElementById("cr-rail")).toBeNull();
      expect(screen.getByLabelText("Draft")).toBe(draft);
      act(() => { matches = false; listeners.forEach((l) => l()); });
      expect(document.getElementById("cr-rail")).not.toBeNull();
      expect(screen.getByLabelText("Draft")).toBe(draft);
      expect(draft.value).toBe("half a thought");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("Enter on the handle hides and shows the rail at the saved width, keeping focus on the handle", async () => {
    api();
    saveRailLayout("ben", { width: 450, collapsed: true });
    await renderPage(<Shell session={ben}><p>app</p></Shell>);
    const sep = screen.getByRole("separator", { name: "Navigation width" });
    sep.focus();
    fireEvent.keyDown(sep, { key: "Enter" });
    expect(rail().hasAttribute("inert")).toBe(false);
    expect(rail().closest("[data-panel]")?.getAttribute("data-size-px")).toBe("450");
    expect(document.activeElement).toBe(sep);
    fireEvent.keyDown(sep, { key: "Enter" });
    expect(rail().hasAttribute("inert")).toBe(true);
    // A held Enter does not keep toggling.
    fireEvent.keyDown(sep, { key: "Enter", repeat: true });
    expect(rail().hasAttribute("inert")).toBe(true);
  });

  it("ignores an auto-repeated [ from a held key", async () => {
    api();
    await renderPage(<Shell session={ben}><p>app</p></Shell>);
    fireEvent.keyDown(window, { key: "[" });
    fireEvent.keyDown(window, { key: "[", repeat: true });
    fireEvent.keyDown(window, { key: "[", repeat: true });
    expect(rail().hasAttribute("inert")).toBe(true);
  });

  it("does nothing on [ when single-key shortcuts are turned off", async () => {
    api();
    setSingleKeys(false);
    await renderPage(<Shell session={ben}><p>app</p></Shell>);
    await userEvent.setup().keyboard("[[");
    expect(rail().hasAttribute("inert")).toBe(false);
    // The toggle and the handle stop advertising a key that does nothing.
    expect(toggle().hasAttribute("aria-keyshortcuts")).toBe(false);
    expect(toggle().getAttribute("title")).not.toContain("[");
    expect(screen.getByRole("separator", { name: "Navigation width" }).getAttribute("title")).not.toContain("[");
  });

  it("showing the rail again never changes the saved width", async () => {
    api();
    saveRailLayout("ben", { width: 480, collapsed: true });
    await renderPage(<Shell session={ben}><p>app</p></Shell>);
    await userEvent.setup().click(toggle());
    await waitFor(() => expect(loadRailLayout("ben")).toEqual({ width: 480, collapsed: false }));
  });

  it("moves focus to the workspace when the breakpoint removes the focused control, and leaves it otherwise", async () => {
    api();
    let matches = false;
    const listeners = new Set<() => void>();
    vi.stubGlobal("matchMedia", (query: string) => ({
      get matches() { return query === "(max-width: 820px)" ? matches : false; },
      media: query,
      addEventListener: (_: string, l: () => void) => listeners.add(l),
      removeEventListener: (_: string, l: () => void) => listeners.delete(l),
      addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false,
    }));
    try {
      await renderPage(<Shell session={ben}><input aria-label="Draft" /></Shell>);
      toggle().focus();
      act(() => { matches = true; listeners.forEach((l) => l()); });
      expect(document.activeElement?.id).toBe("main");
      // Search is desktop-only too.
      act(() => { matches = false; listeners.forEach((l) => l()); });
      screen.getByRole("button", { name: /^Search/ }).focus();
      act(() => { matches = true; listeners.forEach((l) => l()); });
      expect(document.activeElement?.id).toBe("main");
      // A control that stays mounted keeps focus.
      act(() => { matches = false; listeners.forEach((l) => l()); });
      const draft = screen.getByLabelText("Draft");
      draft.focus();
      act(() => { matches = true; listeners.forEach((l) => l()); });
      expect(document.activeElement).toBe(draft);
    } finally {
      vi.unstubAllGlobals();
    }
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
