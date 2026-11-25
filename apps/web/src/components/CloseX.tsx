/**
 * The one close button (owner, 2026-11-25: "Some have Xs, and others don't"). Every drawer, dialog
 * and panel uses it, in its top-right corner: the same ✕, the same size, the same name and hint.
 */
export function CloseX({ onClose, label = "Close", disabled = false, buttonRef }: { onClose: () => void; label?: string; disabled?: boolean; buttonRef?: React.Ref<HTMLButtonElement> }) {
  return (
    <button ref={buttonRef} type="button" className="close-x" onClick={onClose} aria-label={label} title="Close (Esc)" disabled={disabled}>
      <span aria-hidden="true">{"✕"}</span>
    </button>
  );
}
