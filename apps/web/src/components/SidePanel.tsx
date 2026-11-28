import { createContext, type ReactNode, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  /** Brings an owner already open to the top (its content changed to something the person just chose). */
  promote: (owner: symbol) => void;
  /** The owner shown: the one opened last. Two at once (a page's drawer and a card opened from
   * elsewhere) never stack; closing the top one shows the one under it again. */
  top: symbol | undefined;
  /** Whether the slot has been placed on the page since the panel opened. Content mounts only then,
   * so the drawers' own focus effects find a connected element. */
  attached: boolean;
  markAttached: () => void;
  /** Asks for the panel's widest size while true (a file being read), and the person's own width after. */
  setWide: (wide: boolean) => void;
  /** Whether the panel covers the whole workspace (owner, 2026-11-25: "large and big workflows with
   * high context"). The page stays mounted under it; closing the panel ends it. */
  full: boolean;
  setFull: (full: boolean) => void;
}

const HostCtx = createContext<Host | null>(null);
/** Whether the owner around this content is the one showing (false while another sits on top of it). */
const ActiveCtx = createContext(true);

/**
 * True when this content is what the person sees in the panel. A drawer under another one stays
 * mounted (its typed text and open sections survive) but must not answer Esc or clicks meant for the
 * one on top.
 */
export function useSidePanelActive(): boolean {
  return useContext(ActiveCtx);
}

/** The shell's side of the panel: whether anything is showing in it, and the slot to place. */
export function useSidePanelHost(docked: boolean) {
  const [owners, setOwners] = useState<readonly symbol[]>([]);
  const [wide, setWide] = useState(false);
  const [attached, setAttached] = useState(false);
  const [full, setFull] = useState(false);
  const open = owners.length > 0;
  // A closed panel's slot is off the page: the next open waits for it again, at its usual width.
  if (!open && attached) setAttached(false);
  if (!open && full) setFull(false);
  const slot = useMemo(() => {
    const el = document.createElement("div");
    el.className = "side-panel-slot";
    return el;
  }, []);
  const host = useMemo<Host>(
    () => ({
      slot,
      // Covering the whole workspace, there is no page beside it to click: it stays open like a pane.
      docked: docked || full,
      full,
      setFull,
      register: (o) => setOwners((prev) => (prev.includes(o) ? prev : [...prev, o])),
      unregister: (o) => setOwners((prev) => prev.filter((x) => x !== o)),
      promote: (o) =>
        setOwners((prev) => (!prev.includes(o) || prev[prev.length - 1] === o ? prev : [...prev.filter((x) => x !== o), o])),
      setWide,
      top: owners[owners.length - 1],
      attached,
      markAttached: () => setAttached(true),
    }),
    [slot, docked, owners, attached, full],
  );
  return { host, open, slot, wide: open && wide, full: open && full };
}

export function SidePanelProvider({ host, children }: { host: Host; children: ReactNode }) {
  return <HostCtx.Provider value={host}>{children}</HostCtx.Provider>;
}

/** Puts the shell's stable slot element inside whatever renders this (the docked pane or the overlay). */
export function SidePanelSlot({ slot, overlay = false, full = false, wide = false }: { slot: HTMLElement; overlay?: boolean; full?: boolean; wide?: boolean }) {
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
  // Over the page (narrow windows) full width is the whole window; beside it, the whole workspace pane.
  if (overlay) return <OverlayFrame frameRef={ref} wide={wide} full={full} />;
  return full ? <div ref={ref} className="side-panel-full" /> : <div ref={ref} className="side-panel-dock" />;
}

function OverlayFrame({ frameRef, wide, full }: { frameRef: React.RefObject<HTMLDivElement | null>; wide: boolean; full: boolean }) {
  // Below the top bar and any SCRAM banner, as the drawers always were, so neither is covered.
  useDockTop(frameRef);
  // A file or log being read takes more of the window, as the docked pane does.
  return <div ref={frameRef} className="side-panel-overlay" data-wide={wide ? "" : undefined} data-full={full ? "" : undefined} />;
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
  // A page that reuses its drawer for a new selection (another card on the Board) shows it, even when
  // something else was opened over the panel since: the label names what is shown, so a new label is
  // a new choice by the person.
  const lastLabel = useRef(label);
  useLayoutEffect(() => {
    if (lastLabel.current === label) return;
    lastLabel.current = label;
    host?.promote(owner.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label]);
  const top = !host || host.top === owner.current;
  // A pane beside the workspace stays open while the person works on the page; one that covers the
  // page closes on a click outside it, as the drawers did. Only the owner on top listens.
  useOutsideClose(frame, onClose, () => host?.docked === true || !top);
  // Esc hides the panel, one level at a time: a dialog or the palette over it takes Esc first, and a
  // file or log open over a card goes back to the card first (PanelScreenView, capture phase).
  useEffect(() => {
    if (!top) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector("dialog[open], .palette")) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [top, onClose]);
  // Over the page (a narrow window) the panel is a modal dialog: Tab and Shift+Tab stay inside it
  // until it closes. Beside the page it is a pane the person works next to, so focus moves freely.
  const modal = host !== null && top && !host.docked;
  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => {
      const el = frame.current;
      if (e.key !== "Tab" || !el || document.querySelector("dialog[open], .palette")) return;
      const items = focusables(el);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (!el.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modal]);
  // Closing gives focus back to what had it when the panel opened (the card or button clicked), when
  // focus was in the panel or nowhere, so keyboard users keep their place on the page.
  const opener = useRef<Element | null>(typeof document === "undefined" ? null : document.activeElement);
  useEffect(
    () => () => {
      const back = opener.current;
      const active = document.activeElement;
      const lost = !active || active === document.body || !active.isConnected || frame.current?.contains(active) === true;
      if (lost && back instanceof HTMLElement && back.isConnected) back.focus();
    },
    [],
  );
  // The content mounts a moment after its owner (once the slot is on the page), so an owner's own
  // focus-on-mount finds nothing yet: move focus in here, the first time the content shows.
  const shown = !host || (top && host.attached);
  const focused = useRef(false);
  useLayoutEffect(() => {
    if (!shown || focused.current) return;
    focused.current = true;
    if (!autoFocus) return;
    const first = frame.current?.firstElementChild;
    if (first instanceof HTMLElement && !first.contains(document.activeElement)) first.focus();
  }, [shown, autoFocus]);
  const body = (
    <ActiveCtx.Provider value={top}>
      <div
        ref={frame}
        className="side-panel"
        hidden={!top}
        data-docked={host?.docked ? "" : undefined}
        role={modal ? "dialog" : "region"}
        aria-modal={modal ? true : undefined}
        aria-label={label}
      >
        {children}
      </div>
    </ActiveCtx.Provider>
  );
  if (!host) return body;
  // Every owner stays mounted in the slot; only the top one is visible.
  return host.attached ? createPortal(body, host.slot) : null;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/** The panel's keyboard stops, in page order, leaving out hidden ones. */
function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => !x.closest("[hidden], [inert]"));
}

/** While mounted, the panel takes its widest size (it returns to the person's width after). */
export function useWidePanel(): void {
  const host = useContext(HostCtx);
  const active = useContext(ActiveCtx);
  useLayoutEffect(() => {
    if (!host || !active) return;
    host.setWide(true);
    return () => host.setWide(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host?.slot, active]);
}

/**
 * Switches the panel between its place beside the page and the whole workspace, for long files, logs
 * and cards with a lot to read. Nothing renders outside a shell.
 */
export function PanelFullToggle() {
  const host = useContext(HostCtx);
  if (!host) return null;
  const label = host.full ? "Show beside the page" : "Use the full width";
  return (
    <button type="button" className="close-x panel-full-x" onClick={() => host.setFull(!host.full)} aria-label={label} title={label} aria-pressed={host.full}>
      <span aria-hidden="true">{host.full ? "\u2921" : "\u2922"}</span>
    </button>
  );
}
