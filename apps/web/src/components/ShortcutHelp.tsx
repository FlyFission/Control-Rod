import { useEffect, useRef } from "react";

export type Shortcut = { keys: string[]; what: string; where: string };

/** Every single-key shortcut the app answers, in one place, so the list cannot drift from a guess. */
export function shortcuts(mac: boolean): Shortcut[] {
  return [
    { keys: [mac ? "⌘" : "Ctrl", "K"], what: "Search places, packages and commands", where: "Anywhere" },
    { keys: ["C"], what: "New work; on the board, add a card in Ready", where: "Anywhere" },
    { keys: ["J"], what: "Next card", where: "Board" },
    { keys: ["K"], what: "Previous card", where: "Board" },
    { keys: ["N"], what: "Next card marked Needs you or Blocked", where: "Board" },
    { keys: ["Esc"], what: "Close the open drawer or dialog", where: "Anywhere" },
    { keys: ["?"], what: "Show this list", where: "Anywhere" },
  ];
}

/**
 * The keyboard shortcut list (pattern AW4). `?` opens it from anywhere outside a field. Single-letter
 * shortcuts never fire while typing in a field.
 */
export function ShortcutHelp({ open, mac, onClose }: { open: boolean; mac: boolean; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    close.current?.focus();
    return () => returnTo.current?.focus();
  }, [open]);

  if (!open) return null;
  return (
    <div className="palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="palette shortcut-help"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcut-help-title"
        onKeyDown={(e) => {
          // While the list is open no other shortcut fires behind it, and Escape closes only the list,
          // not a drawer underneath.
          e.stopPropagation();
          if (e.key === "Escape" || e.key === "?") {
            e.preventDefault();
            onClose();
          }
          // One control inside: Tab stays on it.
          if (e.key === "Tab") e.preventDefault();
        }}
      >
        <div className="shortcut-help-head">
          <h2 id="shortcut-help-title">Keyboard shortcuts</h2>
          <button ref={close} type="button" className="btn small" onClick={onClose}>
            Close
          </button>
        </div>
        <table className="shortcut-table">
          <thead>
            <tr>
              <th scope="col">Keys</th>
              <th scope="col">What it does</th>
              <th scope="col">Where</th>
            </tr>
          </thead>
          <tbody>
            {shortcuts(mac).map((s) => (
              <tr key={s.what}>
                <td>
                  {s.keys.map((k, i) => (
                    <span key={k}>
                      {i > 0 && " "}
                      <kbd>{k}</kbd>
                    </span>
                  ))}
                </td>
                <td>{s.what}</td>
                <td className="muted">{s.where}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">Single-letter keys do nothing while you are typing in a field.</p>
      </div>
    </div>
  );
}
