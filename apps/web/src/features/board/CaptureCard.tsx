import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, explain } from "../../api/client.js";
import type { CaptureView, DataLane } from "../../api/types.js";
import { useActiveProject } from "../../lib/projects.js";
import { LanePicker, defaultLaneFor } from "../../components/LanePicker.js";
import { useActionLock } from "../../lib/scramLock.js";
import { splitAttachments } from "../../lib/attachments.js";

/** Intake states a person can recover from with a retry (as on the Packages page). */
const RETRYABLE = new Set(["failed", "lost", "stopped"]);

/** The one line on a capture card: what the capture waits for, in the record's own terms. */
export type CaptureLine = { tone: "needs" | "wait" | "block"; text: string };

export function captureLine(c: CaptureView): CaptureLine {
  if (!c.lane) return { tone: "needs", text: "Classify the data lane" };
  const intake = c.intake;
  if (intake === undefined) return { tone: "wait", text: "Waiting for intake" };
  if (RETRYABLE.has(intake.status)) return { tone: "block", text: `Intake ${intake.status}${intake.error ? `: ${intake.error}` : ""}` };
  return { tone: "wait", text: "Intake drafting" };
}

/**
 * A capture that is not yet a package (spec 6.2, 6.3): it sits at the top of Ready with its own face.
 * Until classified, the lane choices are inline and no AI runtime sees the text. Once intake lists its
 * package ids the capture card gives way to those packages' cards (useBoardData).
 */
/** Strips a leading NewWorkModal metadata header line (`[mode:...] [stage:...]`) for card display. */
export function captureSummaryText(raw: string): string {
  const trimmed = raw.trim();
  const nl = trimmed.indexOf("\n");
  if (nl > 0) {
    const first = trimmed.slice(0, nl).trim();
    const rest = trimmed.slice(nl + 1).trim();
    if (rest.length > 0 && /^(\[[a-z0-9_-]+:[^\]]+\]\s*)+$/i.test(first)) {
      return rest;
    }
  }
  return trimmed;
}

export function CaptureCard({
  capture,
  selected = false,
  onOpen,
  onDismiss,
  onDragStartCard,
  onDragEndCard,
}: {
  capture: CaptureView;
  selected?: boolean;
  onOpen?: () => void;
  onDismiss?: () => void;
  onDragStartCard?: () => void;
  onDragEndCard?: () => void;
}) {
  const qc = useQueryClient();
  const scramLock = useActionLock();
  const shown = splitAttachments(capture.text);
  const displayTitle = captureSummaryText(shown.text);
  const line = captureLine(capture);
  const titleId = `bd-capture-${capture.id}`;
  const activeProject = useActiveProject();
  const [lane, setLane] = useState<DataLane>(defaultLaneFor(activeProject));
  const [showErrorDetail, setShowErrorDetail] = useState(false);
  const self = useRef<HTMLElement>(null);
  const classify = useMutation({
    mutationFn: () => api.classifyCapture(capture.id, lane),
    onSuccess: () => {
      // The lane picker and the Classify button go away once classified; keep a keyboard user's place
      // on this card instead of dropping focus to the page.
      const el = self.current;
      if (el && (el.contains(document.activeElement) || document.activeElement === document.body)) el.focus();
      void qc.invalidateQueries({ queryKey: ["captures"] });
    },
  });
  const requeue = useMutation({
    mutationFn: () => api.requeueRun(capture.id, capture.intake!.run_id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["captures"] }),
  });
  const symbol = line.tone === "needs" ? "▲" : line.tone === "block" ? "✕" : "○";
  const word = line.tone === "needs" ? "Needs you" : line.tone === "block" ? "Blocked" : "Waiting";
  const hasLongDetail = line.tone === "block" && Boolean(capture.intake?.error) && line.text.length > 72;
  const compactStatus = hasLongDetail ? `Intake ${capture.intake!.status}` : line.text;
  return (
    <article
      ref={self}
      tabIndex={-1}
      aria-labelledby={titleId}
      className={selected ? "bd-card bd-capture selected" : "bd-card bd-capture"}
      data-tone={line.tone}
      data-kind="capture"
      draggable={Boolean(onDragStartCard)}
      onDragStart={(e) => {
        e.dataTransfer.setData("application/x-cr-card", JSON.stringify({ kind: "capture", id: capture.id }));
        e.dataTransfer.effectAllowed = "move";
        onDragStartCard?.();
      }}
      onDragEnd={() => onDragEndCard?.()}
    >
      <div className="bd-kinds">
        <span className="bd-kind">Capture</span>
        {capture.effective_lane !== undefined && <span className="bd-chip">{capture.effective_lane}</span>}
        <span className="bd-id mono small muted">{capture.id}</span>
        {onDismiss && (
          <button
            type="button"
            className="bd-card-dismiss"
            aria-label={`Dismiss ${capture.id}`}
            title="Dismiss capture from board"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss();
            }}
          >
            ×
          </button>
        )}
      </div>
      <button
        type="button"
        id={titleId}
        className="bd-title bd-capture-title"
        title={displayTitle || shown.files.join(", ")}
        onClick={onOpen}
      >
        {displayTitle.length > 0 ? displayTitle : shown.files.join(", ")}
      </button>
      <p className="bd-next" title={line.text}>
        <span className="bd-sym">
          <span aria-hidden="true">{symbol} </span>
          <span className="bd-word">{word}: </span>
        </span>
        <span>{showErrorDetail ? line.text : compactStatus}</span>
      </p>
      {hasLongDetail && (
        <button
          type="button"
          className="bd-detail-toggle"
          aria-expanded={showErrorDetail}
          onClick={() => setShowErrorDetail((v) => !v)}
        >
          {showErrorDetail ? "Hide details ▴" : "Show error details ▾"}
        </button>
      )}
      {!capture.lane && (
        <div className="bd-capture-classify">
          <LanePicker id={`bd-lane-${capture.id}`} value={lane} onChange={setLane} />
          <button type="button" className="btn primary small" onClick={() => classify.mutate()} disabled={classify.isPending || scramLock.locked} title={scramLock.why}>
            Classify
          </button>
          {classify.isError && (
            <p role="alert" className="error small">
              {explain(classify.error, "Could not classify.")}
            </p>
          )}
        </div>
      )}
      {line.tone === "block" && capture.intake !== undefined && (
        <div className="bd-capture-classify">
          <button type="button" className="btn small" onClick={() => requeue.mutate()} disabled={requeue.isPending || scramLock.locked} title={scramLock.why}>
            Retry intake
          </button>
          {requeue.isError && (
            <p role="alert" className="error small">
              {explain(requeue.error, "Could not retry.")}
            </p>
          )}
        </div>
      )}
    </article>
  );
}
