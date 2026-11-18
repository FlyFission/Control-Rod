import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, explain } from "../../api/client.js";
import type { CaptureView, DataLane } from "../../api/types.js";
import { LanePicker } from "../../components/LanePicker.js";
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
export function CaptureCard({ capture }: { capture: CaptureView }) {
  const qc = useQueryClient();
  const shown = splitAttachments(capture.text);
  const line = captureLine(capture);
  const titleId = `bd-capture-${capture.id}`;
  const [lane, setLane] = useState<DataLane>("internal");
  const classify = useMutation({
    mutationFn: () => api.classifyCapture(capture.id, lane),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["captures"] }),
  });
  const requeue = useMutation({
    mutationFn: () => api.requeueRun(capture.id, capture.intake!.run_id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["captures"] }),
  });
  const symbol = line.tone === "needs" ? "▲" : line.tone === "block" ? "✕" : "○";
  const word = line.tone === "needs" ? "Needs you" : line.tone === "block" ? "Blocked" : "Waiting";
  return (
    <article aria-labelledby={titleId} className="bd-card bd-capture" data-tone={line.tone}>
      <div className="bd-kinds">
        <span className="bd-kind">Capture</span>
        {capture.effective_lane !== undefined && <span className="bd-chip">{capture.effective_lane} lane</span>}
      </div>
      <p id={titleId} className="bd-title bd-capture-title">
        {shown.text.length > 0 ? shown.text : shown.files.join(", ")}
      </p>
      <span className="bd-id mono small muted">{capture.id}</span>
      <p className="bd-next">
        <span className="bd-sym">
          <span aria-hidden="true">{symbol} </span>
          <span className="bd-word">{word}: </span>
        </span>
        <span>{line.text}</span>
      </p>
      {!capture.lane && (
        <div className="bd-capture-classify">
          <LanePicker id={`bd-lane-${capture.id}`} value={lane} onChange={setLane} />
          <button type="button" className="btn primary small" onClick={() => classify.mutate()} disabled={classify.isPending}>
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
          <button type="button" className="btn small" onClick={() => requeue.mutate()} disabled={requeue.isPending}>
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
