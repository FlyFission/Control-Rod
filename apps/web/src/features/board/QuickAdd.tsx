import { type ClipboardEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useActionLock } from "../../lib/scramLock.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { OPEN_MODAL, singleKeysOn } from "../../lib/singleKeys.js";
import { api, explain } from "../../api/client.js";
import { CAPTURE_LIMIT } from "../../components/CaptureBox.js";
import { useMode } from "../../lib/mode.js";
import { useActiveProject } from "../../lib/projects.js";

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
 * Quick add at the top of Ready (spec 6.3): "+ Quick add" or the `c` key opens an inline title field.
 * Enter posts one capture and leaves a fresh, focused field for the next; Escape closes; a typed draft
 * survives losing focus. Pasting several lines offers one card per line. The capture is posted with no
 * data lane, so nothing reaches an AI runtime until a person classifies it on the new card (M-0).
 */
export function QuickAdd() {
  const scramLock = useActionLock();
  const lockedRef = useRef(scramLock.locked);
  lockedRef.current = scramLock.locked;
  const qc = useQueryClient();
  const mode = useMode();
  const activeProject = useActiveProject();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [many, setMany] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  // Set by close(): the opener is not in the tree while the field is open, so it is focused after the swap.
  const returnFocus = useRef(false);
  // Set by onSuccess/onError: the input is disabled while pending, so focus runs once React clears disabled.
  const refocusInput = useRef(false);
  const batchProgress = useRef<{ titles: string[]; sent: number }>({ titles: [], sent: 0 });

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
      if (e.key.toLowerCase() !== "c" || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (!singleKeysOn()) return;
      if (inTypingContext(e.target)) return;
      if (document.querySelector(OPEN_MODAL)) return;
      if (lockedRef.current) return;
      e.preventDefault();
      setOpen(true);
      input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const capturePrefix = `[mode:${mode}]${
    activeProject
      ? ` [project-id:${activeProject.id}]${activeProject.repo ? ` [repo:${activeProject.repo}]` : ""}`
      : ""
  }\n\n`;

  const send = useMutation({
    mutationFn: async (titles: string[]) => {
      batchProgress.current = { titles, sent: 0 };
      // Cards are posted in the order typed, one request at a time, so a failure says which one stopped.
      for (const t of titles) {
        await api.capture({ text: `${capturePrefix}${t}`, source: "web" });
        batchProgress.current.sent += 1;
      }
    },
    onSuccess: () => {
      batchProgress.current = { titles: [], sent: 0 };
      setText("");
      setMany(null);
      setError(null);
      refocusInput.current = true;
      void qc.invalidateQueries({ queryKey: ["captures"] });
    },
    onError: (e) => {
      const { titles, sent } = batchProgress.current;
      batchProgress.current = { titles: [], sent: 0 };
      if (titles.length > 1) {
        const remaining = titles.slice(sent);
        if (sent > 0) void qc.invalidateQueries({ queryKey: ["captures"] });
        if (remaining.length <= 1) {
          setMany(null);
          setText(remaining[0] ?? "");
        } else {
          setMany(remaining);
          setText(remaining.join(" / "));
        }
      }
      setError(explain(e, "Could not add the card."));
      refocusInput.current = true;
    },
  });

  useEffect(() => {
    if (open && !send.isPending && refocusInput.current) {
      refocusInput.current = false;
      input.current?.focus();
    }
  }, [open, send.isPending]);

  function close() {
    returnFocus.current = true;
    refocusInput.current = false;
    batchProgress.current = { titles: [], sent: 0 };
    setOpen(false);
    setMany(null);
    setError(null);
  }

  function validateMany(titles: string[]): string | null {
    const maxTitle = Math.max(0, CAPTURE_LIMIT - capturePrefix.length);
    const over = titles.find((t) => capturePrefix.length + t.length > CAPTURE_LIMIT);
    return over === undefined
      ? null
      : `Too long for one card (${over.length.toLocaleString()} of ${maxTitle.toLocaleString()} available characters).`;
  }

  function submitMany() {
    if (many === null || many.length === 0 || send.isPending || scramLock.locked) return;
    const problem = validateMany(many);
    if (problem !== null) {
      setError(problem);
      return;
    }
    setError(null);
    send.mutate(many);
  }

  function submitOne() {
    const title = text.trim();
    if (title.length === 0 || send.isPending || scramLock.locked) return;
    const maxTitle = Math.max(0, CAPTURE_LIMIT - capturePrefix.length);
    if (capturePrefix.length + title.length > CAPTURE_LIMIT) {
      setError(`Too long for one card (${title.length.toLocaleString()} of ${maxTitle.toLocaleString()} available characters).`);
      return;
    }
    setError(null);
    send.mutate([title]);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (many !== null) submitMany();
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
    batchProgress.current = { titles: [], sent: 0 };
    setError(null);
    setMany(lines);
    setText(lines.join(" / "));
  }

  if (!open) {
    return (
      <button ref={opener} type="button" className="btn small bd-add" onClick={() => setOpen(true)} disabled={scramLock.locked} title={scramLock.why} aria-keyshortcuts="c">
        + Quick add
      </button>
    );
  }
  const descId = "bd-add-desc";
  return (
    <form
      className="bd-add-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (many !== null) submitMany();
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
          batchProgress.current = { titles: [], sent: 0 };
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
          <button type="submit" className="btn primary small" disabled={send.isPending || scramLock.locked} title={scramLock.why}>
            {send.isPending ? "Adding" : `Add ${many.length} cards`}
          </button>
        ) : (
          <button type="submit" className="btn primary small" disabled={send.isPending || scramLock.locked || text.trim().length === 0} title={scramLock.why}>
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
