import { useEffect, useId, useRef, useState } from "react";
import type { MenuItem } from "./actions.js";

/**
 * A card's Move to menu: a button that opens a list of decisions. Keyboard: Enter or Space or Down opens
 * it on the first item; Up and Down move; Home and End jump; Escape closes and returns focus to the
 * button; Tab closes. Refused items stay focusable (aria-disabled) so their reason can be read.
 */
export function MoveMenu({ items, onChoose, cardTitle, disabled = false }: { items: MenuItem[]; onChoose: (item: MenuItem) => void; cardTitle: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const itemEls = () => Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);

  // While the card has an operation in flight, the menu closes and cannot open.
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (!open) return;
    itemEls()[0]?.focus();
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
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
        close(true);
        break;
      case "Tab":
        close(false);
        break;
    }
  }

  if (items.length === 0) return null;

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
      {open && (
        <ul id={menuId} ref={listRef} role="menu" aria-label={`Move to, ${cardTitle}`} className="bd-menu" onKeyDown={onMenuKey}>
          {items.map((item) => (
            <li key={item.id} role="none">
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                aria-disabled={item.enabled ? undefined : true}
                className={item.enabled ? "bd-menu-item" : "bd-menu-item refused"}
                onClick={() => {
                  close(true);
                  onChoose(item);
                }}
              >
                <span>{item.label}</span>
                {!item.enabled && (item.reason || item.change) && <span className="bd-menu-why small muted">{[item.reason, item.change].filter(Boolean).join(". ")}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
