import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SidePanel, SidePanelProvider, SidePanelSlot, useSidePanelHost } from "./SidePanel.js";
import { SIDE_DEFAULT_PX, SIDE_MAX_PX, SIDE_MIN_PX, clampSideWidth, loadSideWidth, saveSideWidth, sidePanelKey } from "../lib/sidePanelLayout.js";

/** A stand-in shell: the page, and the panel's slot either docked beside it or over it. */
function Host({ docked, children }: { docked: boolean; children: React.ReactNode }) {
  const side = useSidePanelHost(docked);
  return (
    <SidePanelProvider host={side.host}>
      <div data-testid="page">
        {children}
        <button type="button">elsewhere</button>
      </div>
      <p data-testid="state">{side.open ? "open" : "closed"}</p>
      {side.open && docked && (
        <div data-testid="dock">
          <SidePanelSlot slot={side.slot} />
        </div>
      )}
      {side.open && !docked && <SidePanelSlot slot={side.slot} overlay />}
    </SidePanelProvider>
  );
}

function Detail({ onClose }: { onClose: () => void }) {
  return (
    <SidePanel label="Card details" onClose={onClose}>
      <aside aria-label="Card details">
        <label>
          Note <textarea />
        </label>
      </aside>
    </SidePanel>
  );
}

function Page({ docked, onClose = () => undefined }: { docked: boolean; onClose?: () => void }) {
  const [shown, setShown] = useState(false);
  return (
    <Host docked={docked}>
      <button type="button" onClick={() => setShown(true)}>
        open
      </button>
      <button type="button" onClick={() => setShown(false)}>
        hide
      </button>
      {shown && (
        <Detail
          onClose={() => {
            onClose();
            setShown(false);
          }}
        />
      )}
    </Host>
  );
}

afterEach(() => localStorage.clear());

describe("SidePanel", () => {
  it("renders in place when no shell hosts it", () => {
    render(
      <div data-testid="here">
        <Detail onClose={() => undefined} />
      </div>,
    );
    expect(screen.getByTestId("here").querySelector(".side-panel")).toBeTruthy();
  });

  it("opens the shell's panel while mounted and closes it when unmounted", () => {
    render(<Page docked />);
    expect(screen.getByTestId("state").textContent).toBe("closed");
    fireEvent.click(screen.getByText("open"));
    expect(screen.getByTestId("state").textContent).toBe("open");
    // The details sit in the panel, not in the page.
    expect(screen.getByTestId("dock").querySelector("aside[aria-label='Card details']")).toBeTruthy();
    expect(screen.getByTestId("page").querySelector("aside")).toBeNull();
    fireEvent.click(screen.getByText("hide"));
    expect(screen.getByTestId("state").textContent).toBe("closed");
    expect(screen.queryByTestId("dock")).toBeNull();
  });

  it("stays open beside the page when the person clicks elsewhere", () => {
    const onClose = vi.fn();
    render(<Page docked onClose={onClose} />);
    fireEvent.click(screen.getByText("open"));
    fireEvent.pointerDown(screen.getByText("elsewhere"));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId("state").textContent).toBe("open");
  });

  it("closes on a click outside when it covers the page", () => {
    const onClose = vi.fn();
    render(<Page docked={false} onClose={onClose} />);
    fireEvent.click(screen.getByText("open"));
    expect(document.querySelector(".side-panel-overlay aside")).toBeTruthy();
    // A click inside does not close it.
    fireEvent.pointerDown(screen.getByRole("textbox"));
    expect(onClose).not.toHaveBeenCalled();
    act(() => {
      fireEvent.pointerDown(screen.getByText("elsewhere"));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps typed text when the window crosses between docked and covering", () => {
    const { rerender } = render(<Page docked />);
    fireEvent.click(screen.getByText("open"));
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "half a note" } });
    rerender(<Page docked={false} />);
    const after = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(after).toBe(box);
    expect(after.value).toBe("half a note");
    expect(document.querySelector(".side-panel-overlay")?.contains(after)).toBe(true);
  });
});

describe("side panel width", () => {
  it("clamps and falls back to the default", () => {
    expect(clampSideWidth(10)).toBe(SIDE_MIN_PX);
    expect(clampSideWidth(5000)).toBe(SIDE_MAX_PX);
    expect(clampSideWidth(Number.NaN)).toBe(SIDE_DEFAULT_PX);
    expect(loadSideWidth("ana")).toBe(SIDE_DEFAULT_PX);
    localStorage.setItem(sidePanelKey("ana"), "junk");
    expect(loadSideWidth("ana")).toBe(SIDE_DEFAULT_PX);
  });

  it("keeps each person's own width", () => {
    saveSideWidth("ana", 700);
    saveSideWidth("bo", 99999);
    expect(loadSideWidth("ana")).toBe(700);
    expect(loadSideWidth("bo")).toBe(SIDE_MAX_PX);
    expect(loadSideWidth(undefined)).toBe(SIDE_DEFAULT_PX);
  });
});
