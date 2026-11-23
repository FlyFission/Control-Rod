import { act, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
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
});
