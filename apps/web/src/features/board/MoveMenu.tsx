import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MenuItem } from "./actions.js";

/**
 * A card's Move to menu: a button that opens a list of currently enabled decisions (plus Stop run
 * at the top when active). Refused decisions collapse behind an "Unavailable (N) ▾" toggle so cards
 * do not dump pages of refusal text by default. Keyboard: Enter or Space or Down opens it on the
 * first item; Up and Down move; Home and End jump; Escape closes and returns focus to the button;
 * Tab closes. Refused items stay focusable (aria-disabled) when expanded so their reason can be read.
 */
export function MoveMenu({ items, onChoose, cardTitle, disabled = false }: { items: MenuItem[]; onChoose: (item: MenuItem) => void; cardTitle: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const itemEls = () => Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);

  // While the card has an operation in flight, the menu closes and cannot open.
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useLayoutEffect(() => {
    if (!open) return;

    function placeMenu() {
      const button = buttonRef.current;
      const menu = listRef.current;
      if (!button || !menu) return;
      const rect = button.getBoundingClientRect();
      const gutter = 8;
      const gap = 4;
      const width = Math.min(280, window.innerWidth - 2 * gutter);
      const left = Math.min(Math.max(rect.left, gutter), window.innerWidth - width - gutter);
      const below = window.innerHeight - rect.bottom - gap - gutter;
      const above = rect.top - gap - gutter;
      const height = menu.scrollHeight + 2;
      const flip = height > below && above > below;
      const maxHeight = Math.max(0, Math.min(360, flip ? above : below));
      const top = flip ? rect.top - gap - Math.min(height, maxHeight) : rect.bottom + gap;
      setPosition({ top, left, width, maxHeight });
    }

    placeMenu();
    window.addEventListener("resize", placeMenu);
    return () => window.removeEventListener("resize", placeMenu);
  }, [open, showUnavailable, items.length]);

  const positioned = position !== null;
  useLayoutEffect(() => {
    if (open && positioned) itemEls()[0]?.focus({ preventScroll: true });
  }, [open, positioned]);

  useEffect(() => {
    if (!open) {
      setShowUnavailable(false);
      setPosition(null);
      return;
    }
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !listRef.current?.contains(target)) setOpen(false);
    };
    const onScroll = (event: Event) => {
      if (event.target === listRef.current) return;
      if (listRef.current?.contains(document.activeElement)) buttonRef.current?.focus({ preventScroll: true });
      setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  function close() {
    setOpen(false);
    buttonRef.current?.focus({ preventScroll: true });
  }

  function onMenuKey(e: React.KeyboardEvent) {
    const els = itemEls();
    const idx = els.indexOf(document.activeElement as HTMLButtonElement);
    const focusAt = (i: number) => els[(i + els.length) % els.length]?.focus();
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        focusAt(idx + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        focusAt(idx - 1);
        break;
      case "Home":
        e.preventDefault();
        focusAt(0);
        break;
      case "End":
        e.preventDefault();
        focusAt(els.length - 1);
        break;
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        close();
        break;
      case "Tab":
        close();
        break;
    }
  }

  if (items.length === 0) return null;

  const stopItem = items.find((i) => i.id === "stop" && i.enabled);
  const enabledItems = [
    ...(stopItem ? [stopItem] : []),
    ...items.filter((i) => i.enabled && i.id !== "stop"),
  ];
  const refusedItems = items.filter((i) => !i.enabled);

  const portalRoot = rootRef.current?.closest(".bd") ?? document.body;

  const renderItem = (item: MenuItem) => (
    <li key={item.id} role="none">
      <button
        type="button"
        role="menuitem"
        tabIndex={-1}
        aria-disabled={item.enabled ? undefined : true}
        className={item.enabled ? "bd-menu-item" : "bd-menu-item refused"}
        onClick={() => {
          close();
          onChoose(item);
        }}
      >
        <span>{item.label}</span>
        {!item.enabled && (item.reason || item.change) && <span className="bd-menu-why small muted">{[item.reason, item.change].filter(Boolean).join(". ")}</span>}
      </button>
    </li>
  );

  return (
    <div className="bd-move" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="btn small ghost"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Move to, ${cardTitle}`}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        Move to <span aria-hidden="true">▾</span>
      </button>
      {open && createPortal(
        <ul
          id={menuId}
          ref={listRef}
          role="menu"
          aria-label={`Move to, ${cardTitle}`}
          className="bd-menu"
          style={position ?? { visibility: "hidden" }}
          onKeyDown={onMenuKey}
        >
          {enabledItems.map(renderItem)}
          {refusedItems.length > 0 && (
            <li role="none">
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                aria-expanded={showUnavailable}
                className="bd-menu-item small muted"
                style={enabledItems.length > 0 ? { borderTop: "1px solid var(--line-2)", borderRadius: 0, marginTop: 2, paddingTop: 6 } : undefined}
                onClick={() => setShowUnavailable((v) => !v)}
              >
                Unavailable ({refusedItems.length}) {showUnavailable ? "▴" : "▾"}
              </button>
            </li>
          )}
          {showUnavailable && refusedItems.map(renderItem)}
        </ul>,
        portalRoot,
      )}
    </div>
  );
}
