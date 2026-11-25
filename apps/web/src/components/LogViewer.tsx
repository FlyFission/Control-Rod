import { useEffect, useMemo, useRef, useState } from "react";
import { CloseX } from "./CloseX.js";
import { backdropClose } from "../lib/dismiss.js";

/** Lines worth a first look when something went wrong: errors, failures, warnings, refusals. */
const PROBLEM = /\b(error|errors|fail(ed|ure|s)?|fatal|panic|warn(ing)?|refused|denied|exception|timed? ?out|not found)\b/i;

export function problemLines(lines: readonly string[]): number[] {
  const out: number[] = [];
  lines.forEach((l, i) => {
    if (PROBLEM.test(l)) out.push(i);
  });
  return out;
}

/**
 * The run log at full size (owner, 2026-11-25: "the window is so small that it's hard to figure
 * anything out"). In a card's side panel it opens over the card (PanelScreen); on a full page it is a
 * modal over the whole screen. Either way: what happened in one sentence first, then every line,
 * wrapped and numbered, with a switch to show only the lines that look like problems.
 */
export function LogViewer({ title, summary, lines, onClose, live = false }: { title: string; summary: React.ReactNode; lines: readonly string[]; onClose: () => void; live?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dlg = ref.current;
    if (dlg && !dlg.open) dlg.showModal?.();
    return () => dlg?.close?.();
  }, []);
  return (
    <dialog
      ref={ref}
      className="log-viewer"
      aria-labelledby="log-viewer-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={backdropClose(onClose)}
    >
      <header className="log-viewer-head">
        <h2 id="log-viewer-title">{title}</h2>
        <CloseX onClose={onClose} label="Close full log" />
      </header>
      <LogBody title={title} summary={summary} lines={lines} live={live} />
    </dialog>
  );
}

/** The log itself, for the modal and for the side panel. */
export function LogBody({ title, summary, lines, live = false }: { title: string; summary: React.ReactNode; lines: readonly string[]; live?: boolean }) {
  const endRef = useRef<HTMLDivElement>(null);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [copied, setCopied] = useState(false);
  const problems = useMemo(() => problemLines(lines), [lines]);
  const problemSet = useMemo(() => new Set(problems), [problems]);
  const shown = onlyProblems ? problems : lines.map((_, i) => i);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <>
      <div className="log-viewer-summary">{summary}</div>
      <div className="log-viewer-bar">
        <label className="small">
          <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} disabled={problems.length === 0} /> Only problem lines ({problems.length})
        </label>
        <button type="button" className="btn ghost small" onClick={() => void copy()} disabled={lines.length === 0}>
          {copied ? "Copied" : "Copy log"}
        </button>
        <button type="button" className="btn ghost small" onClick={() => endRef.current?.scrollIntoView?.({ block: "end" })} disabled={lines.length === 0}>
          Jump to the end
        </button>
        <span className="muted small">
          {lines.length} {lines.length === 1 ? "line" : "lines"}
          {live ? ", still running" : ""}
        </span>
      </div>
      <div className="log-viewer-body" role="log" aria-label={`${title}, full log`} tabIndex={0}>
        {lines.length === 0 ? (
          <p className="muted">No log lines yet.</p>
        ) : (
          <ol className="log-viewer-lines">
            {shown.map((i) => (
              <li key={i} value={i + 1} data-problem={problemSet.has(i) || undefined}>
                {lines[i]}
              </li>
            ))}
          </ol>
        )}
        <div ref={endRef} />
      </div>
    </>
  );
}
