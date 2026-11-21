import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_LENS, type Lens } from "../../lib/lenses.js";
import { kindsOf } from "../../lib/kind.js";
import { pkg } from "../../test/fixtures.js";
import { LensBar } from "./LensBar.js";
import { deleteView, loadViews, saveView, viewsStorageKey } from "./savedViews.js";
import type { BoardCard } from "./useBoardData.js";

function makeCard(id: string, type: string): BoardCard {
  const p = pkg({ id, deliverables: [{ id: "D1", type }] });
  return {
    pkg: p,
    kinds: kindsOf(p),
    column: "ready",
    next: { tone: "wait", text: "Waiting" },
    runActive: false,
    lastKnown: false,
    nuclear: false,
  };
}

describe("savedViews", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("isolates saved views per user under cr.views.<user>", () => {
    expect(viewsStorageKey("ben")).toBe("cr.views.ben");
    const l1: Lens = { ...DEFAULT_LENS, kind: "code", density: "compact" };
    const l2: Lens = { ...DEFAULT_LENS, mine: true, groupBy: "person" };

    saveView({ name: "Code compact", lens: l1 }, "ben");
    saveView({ name: "My lane", lens: l2 }, "ana");

    expect(loadViews("ben")).toEqual([{ name: "Code compact", lens: l1 }]);
    expect(loadViews("ana")).toEqual([{ name: "My lane", lens: l2 }]);

    deleteView("Code compact", "ben");
    expect(loadViews("ben")).toEqual([]);
    expect(loadViews("ana")).toEqual([{ name: "My lane", lens: l2 }]);
  });

  it("replaces an existing view of the same name and ignores blank names", () => {
    saveView({ name: "   ", lens: DEFAULT_LENS }, "ben");
    expect(loadViews("ben")).toEqual([]);

    saveView({ name: "Review", lens: { ...DEFAULT_LENS, needs: true } }, "ben");
    saveView({ name: "Review", lens: { ...DEFAULT_LENS, mine: true } }, "ben");
    expect(loadViews("ben")).toEqual([{ name: "Review", lens: { ...DEFAULT_LENS, mine: true } }]);
  });

  it("falls back to [] on invalid JSON or localStorage errors", () => {
    window.localStorage.setItem("cr.views.ben", "{not-json");
    expect(loadViews("ben")).toEqual([]);

    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(loadViews("ben")).toEqual([]);

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => saveView({ name: "X", lens: DEFAULT_LENS }, "ben")).not.toThrow();
    expect(() => deleteView("X", "ben")).not.toThrow();
  });
});

describe("LensBar", () => {
  const cards = [
    makeCard("WP-1", "patch"),
    makeCard("WP-2", "scope of work"),
    makeCard("WP-3", "calculation"),
  ];

  it("renders kind counts, toggles, selects, density, and saved view controls", async () => {
    const onChange = vi.fn();
    const onSaveView = vi.fn();
    const onDeleteView = vi.fn();
    const saved = { name: "Code only", lens: { ...DEFAULT_LENS, kind: "code" as const } };

    render(
      <LensBar
        lens={DEFAULT_LENS}
        cards={cards}
        views={[saved]}
        onChange={onChange}
        onSaveView={onSaveView}
        onDeleteView={onDeleteView}
      />,
    );

    const user = userEvent.setup();
    expect(screen.getByRole("button", { name: /^All\s*3$/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /^Code\s*1$/ }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: /^Documents\s*2$/ }).getAttribute("aria-pressed")).toBe("false");

    await user.click(screen.getByRole("button", { name: /^Code\s*1$/ }));
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_LENS, kind: "code" });

    await user.click(screen.getByRole("button", { name: "Needs you" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_LENS, needs: true });

    await user.click(screen.getByRole("button", { name: "Mine" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_LENS, mine: true });

    await user.selectOptions(screen.getByLabelText("Color by"), "person");
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_LENS, colorBy: "person" });

    await user.selectOptions(screen.getByLabelText("Group by"), "project");
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_LENS, groupBy: "project" });

    await user.click(screen.getByRole("button", { name: "Compact" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_LENS, density: "compact" });

    await user.selectOptions(screen.getByLabelText("Saved view"), "Code only");
    expect(onChange).toHaveBeenLastCalledWith(saved.lens);

    await user.click(screen.getByRole("button", { name: "Save view" }));
    await user.type(screen.getByLabelText("View name"), "My sprint");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSaveView).toHaveBeenCalledWith("My sprint");
  });

  it("offers Delete view when a saved view is active", async () => {
    const onDeleteView = vi.fn();
    const saved = { name: "Code only", lens: { ...DEFAULT_LENS, kind: "code" as const } };
    render(
      <LensBar
        lens={saved.lens}
        cards={cards}
        views={[saved]}
        onChange={vi.fn()}
        onSaveView={vi.fn()}
        onDeleteView={onDeleteView}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Delete view" }));
    expect(onDeleteView).toHaveBeenCalledWith("Code only");
  });

  it("distinguishes an unsaved custom lens from Default view so Default view remains selectable to reset", async () => {
    const onChange = vi.fn();
    render(
      <LensBar
        lens={{ ...DEFAULT_LENS, needs: true }}
        cards={cards}
        views={[]}
        onChange={onChange}
        onSaveView={vi.fn()}
        onDeleteView={vi.fn()}
      />,
    );
    const select = screen.getByLabelText("Saved view") as HTMLSelectElement;
    expect(select.value).toBe("__custom__");
    expect(screen.getByRole("option", { name: "Custom view" })).toBeTruthy();

    const user = userEvent.setup();
    await user.selectOptions(select, "");
    expect(onChange).toHaveBeenCalledWith(DEFAULT_LENS);
  });

  it("hides zero counts when countsStatus is unknown and labels last-known counts when stale", () => {
    const { rerender } = render(
      <LensBar
        lens={DEFAULT_LENS}
        cards={[]}
        countsStatus="unknown"
        views={[]}
        onChange={vi.fn()}
        onSaveView={vi.fn()}
        onDeleteView={vi.fn()}
      />,
    );
    const kinds = screen.getByRole("group", { name: "Kind" });
    expect(kinds.textContent).not.toContain("0");
    expect(kinds.textContent).toContain("—");

    rerender(
      <LensBar
        lens={DEFAULT_LENS}
        cards={cards}
        countsStatus="last-known"
        views={[]}
        onChange={vi.fn()}
        onSaveView={vi.fn()}
        onDeleteView={vi.fn()}
      />,
    );
    expect(screen.getByText("Last known counts")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^All\s*3\s*\(last known\)$/ })).toBeTruthy();
  });
});
