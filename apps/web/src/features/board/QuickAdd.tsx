import { type ClipboardEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, explain } from "../../api/client.js";
import { CAPTURE_LIMIT } from "../../components/CaptureBox.js";

/** The lines of a paste, one card each: trimmed, empty lines dropped. */
export function splitPaste(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/** Whether a key press landed in something that takes typing, so a single-letter shortcut must not fire. */
export function inTypingContext(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * Quick add at the top of Ready (spec 6.3): "+ Add a card" or the `c` key opens an inline title field.
 * Enter posts one capture and leaves a fresh, focused field for the next; Escape closes; a typed draft
 * survives losing focus. Pasting several lines offers one card per line. The capture is posted with no
 * data lane, so nothing reaches an AI runtime until a person classifies it on the new card (M-0).
 */
export function QuickAdd() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [many, setMany] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  // Set by close(): the opener is not in the tree while the field is open, so it is focused after the swap.
  const returnFocus = useRef(false);

  useEffect(() => {
    if (open) input.current?.focus();
    else if (returnFocus.current) {
      returnFocus.current = false;
      opener.current?.focus();
    }
  }, [open]);

  // `c` anywhere on the board, outside a field and with no modifier, opens the field.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "c" || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (inTypingContext(e.target)) return;
      e.preventDefault();
      setOpen(true);
      input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const send = useMutation({
    mutationFn: async (titles: string[]) => {
      // Cards are posted in the order typed, one request at a time, so a failure says which one stopped.
      for (const t of titles) await api.capture({ text: t, source: "web" });
    },
    onSuccess: () => {
      setText("");
      setMany(null);
      setError(null);
      void qc.invalidateQueries({ queryKey: ["captures"] });
      input.current?.focus();
    },
    onError: (e) => setError(explain(e, "Could not add the card.")),
  });

  function close() {
    returnFocus.current = true;
    setOpen(false);
    setMany(null);
    setError(null);
  }

  function submitOne() {
    const title = text.trim();
    if (title.length === 0 || send.isPending) return;
    if (title.length > CAPTURE_LIMIT) {
      setError(`Too long for one card (${title.length.toLocaleString()} of ${CAPTURE_LIMIT.toLocaleString()} characters).`);
      return;
    }
    send.mutate([title]);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (many !== null) send.mutate(many);
      else submitOne();
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const lines = splitPaste(e.clipboardData.getData("text"));
    if (lines.length < 2) return;
    e.preventDefault();
    setMany(lines);
    setText(lines.join(" / "));
  }

  if (!open) {
    return (
      <button ref={opener} type="button" className="btn small bd-add" onClick={() => setOpen(true)} aria-keyshortcuts="c">
        + Add a card
      </button>
    );
  }
  const descId = "bd-add-desc";
  return (
    <form
      className="bd-add-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (many !== null) send.mutate(many);
        else submitOne();
      }}
    >
      <label className="sr-only" htmlFor="bd-add-input">
        Card title
      </label>
      <input
        ref={input}
        id="bd-add-input"
        className="bd-add-input"
        type="text"
        value={text}
        placeholder="What needs doing? Enter adds it"
        aria-describedby={descId}
        onChange={(e) => {
          setText(e.target.value);
          if (many !== null) setMany(null);
        }}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        disabled={send.isPending}
      />
      <p id={descId} className="sr-only">
        Enter adds the card and opens a fresh field. Escape closes. Paste several lines for one card each.
      </p>
      <div className="bd-add-row">
        {many !== null ? (
          <button type="submit" className="btn primary small" disabled={send.isPending}>
            {send.isPending ? "Adding" : `Add ${many.length} cards`}
          </button>
        ) : (
          <button type="submit" className="btn primary small" disabled={send.isPending || text.trim().length === 0}>
            {send.isPending ? "Adding" : "Add"}
          </button>
        )}
        <button type="button" className="btn ghost small" onClick={close} disabled={send.isPending}>
          Close
        </button>
        <span className="muted small">Classify its data lane on the card before any agent sees it.</span>
      </div>
      {error !== null && (
        <p role="alert" className="error small">
          {error}
        </p>
      )}
    </form>
  );
}
