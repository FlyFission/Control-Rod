import { act, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderPage } from "../../test/render.js";
import { Annunciator } from "./Annunciator.js";
import type { AnnunciatorWindow, WindowState } from "./plant-instruments.js";

/** One window whose state the test drives between renders. */
let setState: (s: WindowState) => void = () => {};
let setScope: (s: string) => void = () => {};
function Driven() {
  const [state, set] = useState<WindowState>("dark");
  const [scope, setS] = useState("all");
  setState = set;
  setScope = setS;
  const w: AnnunciatorWindow = { id: "stuck", label: "Stuck", state, ...(state === "lit" || state === "dark" ? { count: state === "lit" ? 2 : 0 } : {}) };
  return <Annunciator windows={[w]} scope={scope} />;
}
const status = () => screen.getByRole("status").textContent;
const flashing = () => document.querySelector('.plant-window[data-window="stuck"]')!.hasAttribute("data-flash");

describe("the annunciator's announcements and flash", () => {
  it("says a window lit and flashes it only on a change between confirmed readings", async () => {
    await renderPage(<Driven />);
    expect(status()).toBe("");
    expect(flashing()).toBe(false);
    act(() => setState("lit"));
    expect(status()).toBe("Stuck lit");
    expect(flashing()).toBe(true);
  });

  it("never says clear when a lit window loses its read, and says it once a dark reading confirms it", async () => {
    await renderPage(<Driven />);
    act(() => setState("lit"));
    expect(status()).toBe("Stuck lit");
    act(() => setState("unavailable"));
    expect(status()).toBe("Stuck lit");
    act(() => setState("lit"));
    // Back to the same confirmed reading: nothing new to say, and no second flash cycle is started.
    expect(status()).toBe("Stuck lit");
    act(() => setState("dark"));
    expect(status()).toBe("Stuck clear");
  });

  it("starts again from a first reading when presenting changes who is counted, so hidden work is never announced as clear", async () => {
    await renderPage(<Driven />);
    act(() => setState("lit"));
    expect(status()).toBe("Stuck lit");
    act(() => {
      setScope("presenting");
      setState("dark");
    });
    // The old text is cleared, so the next real change is announced afresh.
    expect(status()).toBe("");
    expect(flashing()).toBe(false);
    act(() => setState("lit"));
    expect(status()).toBe("Stuck lit");
    expect(flashing()).toBe(true);
  });

  it("cancels a flash outright when a newer change arrives", async () => {
    await renderPage(<Driven />);
    act(() => setState("lit"));
    expect(flashing()).toBe(true);
    act(() => setState("unavailable"));
    expect(flashing()).toBe(false);
  });

  it("never arms a flash for a change that lands while the tab is hidden", async () => {
    await renderPage(<Driven />);
    const hide = (hidden: boolean) => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
      document.dispatchEvent(new Event("visibilitychange"));
    };
    try {
      act(() => hide(true));
      act(() => setState("lit"));
      expect(status()).toBe("Stuck lit");
      expect(flashing()).toBe(false);
      act(() => hide(false));
      expect(flashing()).toBe(false);
    } finally {
      delete (document as { visibilityState?: unknown }).visibilityState;
    }
  });

  it("draws each window in the instrument tile's language: dark when clear, lit with its lamp and a glyph, the count in mono", async () => {
    const windows: AnnunciatorWindow[] = [
      { id: "waiting-on-you", label: "Waiting on you", state: "lit", count: 3 },
      { id: "stuck", label: "Stuck", state: "dark", count: 0 },
      { id: "changed", label: "Input changed", state: "lit", count: 1 },
      { id: "scram", label: "SCRAM", state: "lit", count: 1 },
    ];
    await renderPage(<Annunciator windows={windows} linkInbox={false} />);
    const body = (id: string) => document.querySelector(`.plant-window[data-window="${id}"] .plant-window-body`)!;
    // Lit windows carry the tile's lamp, and a glyph by shape: bang (needs you), diamond (changed), cross (SCRAM).
    expect(body("waiting-on-you").getAttribute("data-lit")).toBe("true");
    expect(body("waiting-on-you").getAttribute("data-lamp")).toBe("needs-you");
    expect(body("waiting-on-you").querySelector('[data-glyph="bang"]')).not.toBeNull();
    expect(body("changed").getAttribute("data-lamp")).toBe("neutral");
    expect(body("changed").querySelector('[data-glyph="diamond"]')).not.toBeNull();
    expect(body("scram").getAttribute("data-lamp")).toBe("trip");
    expect(body("scram").querySelector('[data-glyph="cross"]')).not.toBeNull();
    // A clear window is dark and has no glyph, and still names itself.
    expect(body("stuck").getAttribute("data-lit")).toBe("false");
    expect(body("stuck").querySelector("svg")).toBeNull();
    expect(body("stuck").textContent).toContain("Stuck");
    // Every window is a tile, with the count in its own mono element.
    for (const id of ["waiting-on-you", "stuck", "changed", "scram"]) expect(body(id).classList.contains("annunciator-tile")).toBe(true);
    expect(body("waiting-on-you").querySelector(".plant-window-count")!.textContent).toBe("3");
  });
});

describe("the annunciator under reduced motion", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("never marks a lit window for full motion when the person asks for reduced motion", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener: () => {}, removeEventListener: () => {} }));
    await renderPage(<Driven />);
    act(() => setState("lit"));
    const tile = document.querySelector('.plant-window[data-window="stuck"] .annunciator-tile')!;
    expect(tile.getAttribute("data-lit")).toBe("true");
    expect(tile.getAttribute("data-motion")).toBe("paused");
  });
});

describe("the annunciator's tiles that do nothing", () => {
  it("are plain readouts, not links; only the waiting-on-you tile is a link", async () => {
    const windows: AnnunciatorWindow[] = [
      { id: "waiting-on-you", label: "Waiting on you", state: "lit", count: 3 },
      { id: "stuck", label: "Stuck", state: "lit", count: 1 },
      { id: "changed", label: "Input changed", state: "lit", count: 1 },
      { id: "scram", label: "SCRAM", state: "lit", count: 1 },
    ];
    await renderPage(<Annunciator windows={windows} />);
    const body = (id: string) => document.querySelector(`.plant-window[data-window="${id}"] .plant-window-body`)!;
    expect(body("waiting-on-you").tagName).toBe("A");
    for (const id of ["stuck", "changed", "scram"]) expect(body(id).tagName).toBe("SPAN");
  });
});
