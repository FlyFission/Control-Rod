import { useEffect, useRef, useState } from "react";
import { CloseX } from "../../components/CloseX.js";
import { SidePanel } from "../../components/SidePanel.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Markdown from "react-markdown";
import { api, explain } from "../../api/client.js";
import type { CaptureView, DataLane } from "../../api/types.js";
import { LanePicker } from "../../components/LanePicker.js";
import { useActionLock } from "../../lib/scramLock.js";
import { splitAttachments } from "../../lib/attachments.js";
import { captureLine, captureSummaryText } from "./CaptureCard.js";

interface CaptureDrawerProps {
  capture: CaptureView;
  onClose: () => void;
}

/**
 * Unified slide-over drawer for Captures: shows full objective text, data-lane classification,
 * intake run status, full untruncated error details, and Retry intake action.
 */
export function CaptureDrawer({ capture, onClose }: CaptureDrawerProps) {
  const qc = useQueryClient();
  const asideRef = useRef<HTMLElement>(null);
  const shown = splitAttachments(capture.text);
  const summary = captureSummaryText(shown.text) || shown.files.join(", ");
  const line = captureLine(capture);
  const scramLock = useActionLock();
  const [lane, setLane] = useState<DataLane>(capture.lane ?? "internal");

  useEffect(() => {
    asideRef.current?.focus();
  }, [capture.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector("dialog[open], .palette")) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const classify = useMutation({
    mutationFn: () => api.classifyCapture(capture.id, lane),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["captures"] }),
  });

  const requeue = useMutation({
    mutationFn: () => api.requeueRun(capture.id, capture.intake!.run_id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["captures"] }),
  });

  const dismiss = useMutation({
    mutationFn: () => api.dismissCapture(capture.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["captures"] });
      onClose();
    },
  });

  return (
    <SidePanel label={`Capture ${capture.id}`} onClose={onClose}>
    <aside ref={asideRef} tabIndex={-1} className="bd-drawer" aria-label={`Capture ${capture.id}`}>
      <div className="bd-drawer-head">
        <div className="bd-drawer-id-row">
          <span className="mono small">{capture.id}</span>
          <span className="bd-chip">Capture</span>
          {capture.effective_lane && <span className="bd-chip">{capture.effective_lane} lane</span>}
        </div>
        <div className="bd-drawer-actions">
          <button
            type="button"
            className="btn small danger"
            disabled={dismiss.isPending}
            onClick={() => dismiss.mutate()}
          >
            {dismiss.isPending ? "Dismissing…" : "Dismiss"}
          </button>
          <CloseX onClose={onClose} label="Close capture drawer" />
        </div>
      </div>

      <div className="bd-drawer-body">
        {dismiss.isError && (
          <p role="alert" className="bd-alert small">
            {explain(dismiss.error, "Could not dismiss capture.")}
          </p>
        )}
        <h2 className="bd-drawer-title">{summary}</h2>

        {shown.files.length > 0 && (
          <section className="bd-drawer-sec">
            <h3>Attachments ({shown.files.length})</h3>
            <div className="bd-drawer-tags">
              {shown.files.map((f) => (
                <span key={f} className="bd-chip">
                  {f}
                </span>
              ))}
            </div>
          </section>
        )}

        <section className="bd-drawer-sec">
          <h3>Status</h3>
          <p className="small" style={{ margin: 0 }}>
            {line.text}
          </p>
        </section>

        {capture.disposition === "answered" && capture.answer && (
          <section className="bd-drawer-sec">
            <h3>Answer</h3>
            <div className="answer markdown small">
              <Markdown>{capture.answer}</Markdown>
            </div>
          </section>
        )}

        {!capture.lane && (
          <section className="bd-drawer-sec">
            <h3>Classify Data Lane</h3>
            <p className="small muted" style={{ margin: "0 0 8px" }}>
              No AI runtime can see this capture until you classify its data lane.
            </p>
            <div className="bd-capture-classify">
              <LanePicker id={`drawer-lane-${capture.id}`} value={lane} onChange={setLane} />
              <button
                type="button"
                className="btn primary small"
                disabled={classify.isPending || scramLock.locked}
                title={scramLock.why}
                onClick={() => classify.mutate()}
              >
                {classify.isPending ? "Classifying…" : "Classify & start intake"}
              </button>
              {classify.isError && (
                <p role="alert" className="error small">
                  {explain(classify.error, "Could not classify.")}
                </p>
              )}
            </div>
          </section>
        )}

        {capture.intake && (
          <section className="bd-drawer-sec">
            <h3>Intake Run</h3>
            <p className="mono small muted" style={{ margin: "0 0 6px" }}>
              Run {capture.intake.run_id} · {capture.intake.status}
            </p>
            {capture.intake.error && (
              <pre className="bd-drawer-error mono small">{capture.intake.error}</pre>
            )}
            {line.tone === "block" && (
              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="btn primary small"
                  disabled={requeue.isPending || scramLock.locked}
                  title={scramLock.why}
                  onClick={() => requeue.mutate()}
                >
                  {requeue.isPending ? "Retrying…" : "Retry intake"}
                </button>
                {requeue.isError && (
                  <p role="alert" className="error small" style={{ marginTop: 6 }}>
                    {explain(requeue.error, "Could not retry intake.")}
                  </p>
                )}
              </div>
            )}
          </section>
        )}

        {shown.text !== summary && (
          <section className="bd-drawer-sec">
            <h3>Raw Capture Metadata</h3>
            <pre className="bd-drawer-meta mono small muted">{shown.text}</pre>
          </section>
        )}
      </div>
    </aside>
    </SidePanel>
  );
}
