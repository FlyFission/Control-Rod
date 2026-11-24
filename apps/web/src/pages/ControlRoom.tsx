import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { UsageLimits } from "../components/UsageLimits.js";
import { loadLayout, moveTo, saveLayout, type Layout } from "../lib/control-room-layout.js";
import { MetricsPanel } from "./Usage.js";
import "./control-room.css";

/** One entry per module. Adding a module is adding an entry here. */
interface ModuleDef {
  id: string;
  title: string;
  /** Nameplate text on the instrument frame. */
  caption: string;
  /** Columns of 12 on a wide screen; a phone always shows one column. */
  width: 12 | 6;
  render: () => ReactNode;
}

export const MODULES: ModuleDef[] = [
  { id: "usage-limits", title: "Usage limits", caption: "Agent subscriptions", width: 12, render: () => <UsageLimits /> },
  { id: "earning-its-place", title: "Is it earning its place?", caption: "Work metrics", width: 6, render: () => <MetricsPanel bare /> },
];
const IDS = MODULES.map((m) => m.id);

function Grip(props: { title: string; onKey: (e: KeyboardEvent<HTMLButtonElement>) => void; onDown: (e: PointerEvent<HTMLButtonElement>) => void; gripRef: (el: HTMLButtonElement | null) => void }) {
  return (
    <button
      type="button"
      className="cr-grip"
      ref={props.gripRef}
      aria-label={`Move ${props.title}. Drag, or press the up and down arrow keys.`}
      onKeyDown={props.onKey}
      onPointerDown={props.onDown}
    >
      <svg viewBox="0 0 12 16" width="12" height="16" aria-hidden="true" focusable="false">
        {[3, 9].flatMap((x) => [3, 8, 13].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" fill="currentColor" />))}
      </svg>
    </button>
  );
}

export function ControlRoom() {
  const [layout, setLayout] = useState<Layout>(() => loadLayout(IDS));
  const [announce, setAnnounce] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  /** The pointer that owns the current drag; every other pointer is ignored. */
  const dragPointer = useRef<number | null>(null);
  const els = useRef(new Map<string, HTMLElement>());
  const grips = useRef(new Map<string, HTMLButtonElement>());
  const nudges = useRef(new Map<string, HTMLButtonElement>());
  const refocus = useRef<{ id: string; target: "grip" | "earlier" | "later" } | null>(null);

  useEffect(() => saveLayout(layout), [layout]);

  // Moving a node in the DOM can drop focus in some browsers; put it back on the control that moved it.
  useLayoutEffect(() => {
    if (refocus.current) {
      const { id, target } = refocus.current;
      const btn = target === "grip" ? grips.current.get(id) : nudges.current.get(`${id}:${target}`);
      // A button that is now disabled (moved to an end) cannot hold focus; fall back to the grip.
      (btn && !btn.disabled ? btn : grips.current.get(id))?.focus();
      refocus.current = null;
    }
  }, [layout.order]);

  const byId = useMemo(() => new Map(MODULES.map((m) => [m.id, m])), []);

  const move = (id: string, index: number) => {
    const order = moveTo(layout.order, id, index);
    if (order === layout.order) return;
    setLayout({ ...layout, order });
    setAnnounce(`${byId.get(id)?.title} moved to position ${order.indexOf(id) + 1} of ${order.length}`);
  };

  const onKey = (id: string) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const dir = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
    if (dir === 0) return;
    e.preventDefault();
    const at = layout.order.indexOf(id);
    const to = at + dir;
    if (to < 0 || to >= layout.order.length) {
      setAnnounce(`${byId.get(id)?.title} is already ${dir < 0 ? "first" : "last"}`);
      return;
    }
    refocus.current = { id, target: "grip" };
    move(id, to);
  };

  const nudge = (id: string, dir: -1 | 1) => () => {
    refocus.current = { id, target: dir < 0 ? "earlier" : "later" };
    move(id, layout.order.indexOf(id) + dir);
  };

  // The grip moves in the DOM when the order changes, which can drop its pointer capture. So the
  // stable grid container holds the capture and receives the moves; the drag ends when the
  // pointer is released, cancelled, or the capture is lost.
  const onDown = (id: string) => (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || dragPointer.current !== null) return;
    dragPointer.current = e.pointerId;
    grid.current?.setPointerCapture?.(e.pointerId);
    setDragging(id);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging === null || e.pointerId !== dragPointer.current) return;
    for (const [other, el] of els.current) {
      if (other === dragging) continue;
      const r = el.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        const to = layout.order.indexOf(other);
        if (to !== layout.order.indexOf(dragging)) move(dragging, to);
        break;
      }
    }
  };
  const onEnd = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== dragPointer.current) return;
    dragPointer.current = null;
    setDragging(null);
  };

  const toggle = (id: string) =>
    setLayout((cur) => ({ ...cur, collapsed: cur.collapsed.includes(id) ? cur.collapsed.filter((c) => c !== id) : [...cur.collapsed, id] }));

  return (
    <div className="place control-room">
      <header className="place-head">
        <h1>Control room</h1>
        <p className="muted">Instruments you can arrange: agent usage limits and how the work is going.</p>
      </header>
      <div className="cr-grid" ref={grid} onPointerMove={onMove} onPointerUp={onEnd} onPointerCancel={onEnd} onLostPointerCapture={onEnd}>
        {layout.order.map((id) => {
          const m = byId.get(id);
          if (!m) return null;
          const closed = layout.collapsed.includes(id);
          return (
            <section
              key={id}
              ref={(el) => {
                if (el) els.current.set(id, el);
                else els.current.delete(id);
              }}
              className={`cr-module w-${m.width}${dragging === id ? " is-dragging" : ""}${closed ? " is-collapsed" : ""}`}
              aria-labelledby={`cr-${id}-title`}
            >
              <header className="cr-strip">
                <Grip
                  title={m.title}
                  gripRef={(el) => {
                    if (el) grips.current.set(id, el);
                    else grips.current.delete(id);
                  }}
                  onKey={onKey(id)}
                  onDown={onDown(id)}
                />
                <h2 id={`cr-${id}-title`}>{m.title}</h2>
                <span className="cr-nudges">
                  <button
                    type="button"
                    className="cr-nudge"
                    ref={(el) => {
                      if (el) nudges.current.set(`${id}:earlier`, el);
                      else nudges.current.delete(`${id}:earlier`);
                    }}
                    aria-label={`Move ${m.title} earlier`}
                    title="Move earlier"
                    disabled={layout.order.indexOf(id) === 0}
                    onClick={nudge(id, -1)}
                  >
                    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false"><path d="M2 8 L6 4 L10 8" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
                  </button>
                  <button
                    type="button"
                    className="cr-nudge"
                    ref={(el) => {
                      if (el) nudges.current.set(`${id}:later`, el);
                      else nudges.current.delete(`${id}:later`);
                    }}
                    aria-label={`Move ${m.title} later`}
                    title="Move later"
                    disabled={layout.order.indexOf(id) === layout.order.length - 1}
                    onClick={nudge(id, 1)}
                  >
                    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false"><path d="M2 4 L6 8 L10 4" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
                  </button>
                </span>
                <span className="cr-caption" aria-hidden="true">{m.caption}</span>
                <button type="button" className="cr-fold" aria-expanded={!closed} aria-controls={`cr-${id}-body`} aria-label={`${closed ? "Expand" : "Collapse"} ${m.title}`} onClick={() => toggle(id)}>
                  {closed ? "Expand" : "Collapse"}
                </button>
              </header>
              <div className="cr-body" id={`cr-${id}-body`} hidden={closed}>
                {m.render()}
              </div>
            </section>
          );
        })}
      </div>
      <div className="sr-only" role="status" aria-live="polite">
        {announce}
      </div>
    </div>
  );
}
