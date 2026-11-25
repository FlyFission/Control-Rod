import { createContext, type ReactNode, useContext, useEffect } from "react";
import { useWidePanel } from "./SidePanel.js";

/**
 * Something opened at the side panel's full size over a card: an output file, a run's full log.
 * The panel widens while it is open and returns to the person's width after. "Back to the card"
 * or Esc goes back one level; X still closes the panel.
 */
export interface PanelScreen {
  /** A stable name for what is open, so reopening the same thing keeps its place. */
  key: string;
  title: string;
  /** Titles that are file names read better in the monospace face. */
  mono?: boolean;
  /** Links shown beside "Back to the card" (open in a new tab, download). */
  links?: ReactNode;
  /** One short line under the bar: a path and digest, a run's status. */
  meta?: ReactNode;
  body: ReactNode;
}

export const PanelScreenContext = createContext<((s: PanelScreen) => void) | undefined>(undefined);

/** Opens a screen over the card when inside a card's side panel; undefined elsewhere (a full page). */
export function usePanelScreen() {
  return useContext(PanelScreenContext);
}

export function PanelScreenView({ screen, onBack }: { screen: PanelScreen; onBack: () => void }) {
  useWidePanel();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector("dialog[open], .palette")) {
        // Before the panel's own Esc (which closes it): one level at a time.
        e.preventDefault();
        e.stopImmediatePropagation();
        onBack();
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [onBack]);
  return (
    <div className="file-screen">
      <div className="file-screen-bar">
        <button type="button" className="btn ghost small" onClick={onBack}>
          <span aria-hidden="true">←</span> Back to the card
        </button>
        {screen.links && <span className="file-screen-links small">{screen.links}</span>}
      </div>
      {screen.meta && <div className="small muted file-screen-meta">{screen.meta}</div>}
      <div className="file-screen-body">{screen.body}</div>
    </div>
  );
}
