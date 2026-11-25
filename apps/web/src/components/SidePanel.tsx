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
  /** The owner shown: the one opened last. Two at once (a page's drawer and a card opened from
   * elsewhere) never stack; closing the top one shows the one under it again. */
  top: symbol | undefined;
  /** Whether the slot has been placed on the page since the panel opened. Content mounts only then,
   * so the drawers' own focus effects find a connected element. */
  attached: boolean;
  markAttached: () => void;
  /** Asks for the panel's widest size while true (a file being read), and the person's own width after. */
  setWide: (wide: boolean) => void;
}

const HostCtx = createContext<Host | null>(null);

/** The shell's side of the panel: whether anything is showing in it, and the slot to place. */
export function useSidePanelHost(docked: boolean) {
  const [owners, setOwners] = useState<readonly symbol[]>([]);
  const [wide, setWide] = useState(false);
  const [attached, setAttached] = useState(false);
  const open = owners.length > 0;
  // A closed panel's slot is off the page: the next open waits for it again.
  if (!open && attached) setAttached(false);
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
      setWide,
      top: owners[owners.length - 1],
      attached,
      markAttached: () => setAttached(true),
    }),
    [slot, docked, owners, attached],
  );
  return { host, open, slot, wide: open && wide };
}

export function SidePanelProvider({ host, children }: { host: Host; children: ReactNode }) {
  return <HostCtx.Provider value={host}>{children}</HostCtx.Provider>;
}

/** Puts the shell's stable slot element inside whatever renders this (the docked pane or the overlay). */
export function SidePanelSlot({ slot, overlay = false }: { slot: HTMLElement; overlay?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const host = useContext(HostCtx);
  const markAttached = host?.markAttached;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Moving the node keeps React's tree (and every field's value) intact.
    el.appendChild(slot);
    markAttached?.();
    return () => {
      if (slot.parentElement === el) el.removeChild(slot);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
export function SidePanel({ label, onClose, autoFocus = true, children }: { label: string; onClose: () => void; autoFocus?: boolean; children: ReactNode }) {
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
  // The content mounts a moment after its owner (once the slot is on the page), so an owner's own
  // focus-on-mount finds nothing yet: move focus in here, the first time the content shows.
  const shown = !host || (host.top === owner.current && host.attached);
  const focused = useRef(false);
  useLayoutEffect(() => {
    if (!shown || focused.current) return;
    focused.current = true;
    if (!autoFocus) return;
    const first = frame.current?.firstElementChild;
    if (first instanceof HTMLElement && !first.contains(document.activeElement)) first.focus();
  }, [shown, autoFocus]);
  const body = (
    <div ref={frame} className="side-panel" data-docked={host?.docked ? "" : undefined}>
      {children}
    </div>
  );
  if (!host) return body;
  return host.top === owner.current && host.attached ? createPortal(body, host.slot) : null;
}

/** While mounted, the panel takes its widest size (it returns to the person's width after). */
export function useWidePanel(): void {
  const host = useContext(HostCtx);
  useLayoutEffect(() => {
    if (!host) return;
    host.setWide(true);
    return () => host.setWide(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host?.slot]);
}
