import { createContext, type ReactNode, useContext, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDockTop } from "../features/board/dock.js";
import { useOutsideClose } from "../lib/dismiss.js";

/**
 * One side panel for details (owner, 2026-11-25: "a sidebar that breaks out when someone clicks on
 * something, versus these windows"). Clicking a card, a capture or an inbox item opens its details on
 * the right; the page stays where it was and stays usable. X or Esc hides it. Only quick confirms
 * stay small dialogs.
 *
 * The shell owns where the panel sits: on a wide screen it is a resizable pane beside the workspace
 * (react-resizable-panels, as the rail is); narrower, it slides over the page from the right and a
 * click outside it closes it. Content always renders into one stable element that the shell moves
 * between the two places, so crossing the breakpoint never loses a typed note or the open section.
 */
interface Host {
  /** The element the content portals into. Created once per shell, moved, never replaced. */
  slot: HTMLElement;
  /** Whether the panel is a pane beside the workspace (true) or slides over it (false). */
  docked: boolean;
  register: (owner: symbol) => void;
  unregister: (owner: symbol) => void;
}

const HostCtx = createContext<Host | null>(null);

/** The shell's side of the panel: whether anything is showing in it, and the slot to place. */
export function useSidePanelHost(docked: boolean) {
  const [owners, setOwners] = useState<readonly symbol[]>([]);
  const slot = useMemo(() => {
    const el = document.createElement("div");
    el.className = "side-panel-slot";
    return el;
  }, []);
  const host = useMemo<Host>(
    () => ({
      slot,
      docked,
      register: (o) => setOwners((prev) => (prev.includes(o) ? prev : [...prev, o])),
      unregister: (o) => setOwners((prev) => prev.filter((x) => x !== o)),
    }),
    [slot, docked],
  );
  return { host, open: owners.length > 0, slot };
}

export function SidePanelProvider({ host, children }: { host: Host; children: ReactNode }) {
  return <HostCtx.Provider value={host}>{children}</HostCtx.Provider>;
}

/** Puts the shell's stable slot element inside whatever renders this (the docked pane or the overlay). */
export function SidePanelSlot({ slot, overlay = false }: { slot: HTMLElement; overlay?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Moving the node keeps React's tree (and every field's value) intact.
    el.appendChild(slot);
    return () => {
      if (slot.parentElement === el) el.removeChild(slot);
    };
  }, [slot]);
  return overlay ? <OverlayFrame frameRef={ref} /> : <div ref={ref} className="side-panel-dock" />;
}

function OverlayFrame({ frameRef }: { frameRef: React.RefObject<HTMLDivElement | null> }) {
  // Below the top bar and any SCRAM banner, as the drawers always were, so neither is covered.
  useDockTop(frameRef);
  return <div ref={frameRef} className="side-panel-overlay" />;
}

/**
 * Shows its children in the side panel while it is mounted. Outside a shell (a page rendered on its
 * own) the children render in place, with the same close-on-outside-click as the overlay.
 */
export function SidePanel({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const host = useContext(HostCtx);
  const owner = useRef(Symbol(label));
  const frame = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!host) return;
    const o = owner.current;
    host.register(o);
    return () => host.unregister(o);
    // Registration follows the host, not its docked flag (the slot is the same element either way).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host?.slot]);
  // A pane beside the workspace stays open while the person works on the page; one that covers the
  // page closes on a click outside it, as the drawers did.
  useOutsideClose(frame, onClose, () => host?.docked === true);
  const body = (
    <div ref={frame} className="side-panel" data-docked={host?.docked ? "" : undefined}>
      {children}
    </div>
  );
  return host ? createPortal(body, host.slot) : body;
}
