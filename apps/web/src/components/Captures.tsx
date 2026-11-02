import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Markdown from "react-markdown";
import { api } from "../api/client.js";
import type { CaptureView, DataLane } from "../api/types.js";
import { splitAttachments } from "../lib/attachments.js";
import { time } from "../lib/format.js";
import { LanePicker } from "./LanePicker.js";

/** The newest captures, with their intake state and what each became. */
export function RecentCaptures() {
  const q = useQuery({ queryKey: ["captures"], queryFn: api.captures });
  const items = useMemo(
    () => [...(q.data ?? [])].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 12),
    [q.data],
  );
  return (
    <section className="panel" aria-labelledby="captures-title">
      <h2 id="captures-title">Recent captures</h2>
      {q.isLoading && <p className="muted">Loading</p>}
      {items.length === 0 && !q.isLoading && <p className="muted">Nothing captured yet.</p>}
      <ul className="captures">
        {items.map((c) => (
          <CaptureRow key={c.id} c={c} />
        ))}
      </ul>
    </section>
  );
}

/** An unclassified capture: no AI runtime sees it until a person with lane authority picks its lane. */
function Classify({ id }: { id: string }) {
  const qc = useQueryClient();
  const [lane, setLane] = useState<DataLane>("internal");
  const save = useMutation({
    mutationFn: () => api.classifyCapture(id, lane),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["captures"] }),
  });
  return (
    <div className="capture-intake" role="status">
      <span>Needs a data lane before any AI sees it.</span>{" "}
      <LanePicker id={`lane-${id}`} value={lane} onChange={setLane} />{" "}
      <button type="button" className="btn small" onClick={() => save.mutate()} disabled={save.isPending}>Classify</button>
      {save.isError && <span className="error small"> {save.error instanceof Error ? save.error.message : "Could not classify."}</span>}
    </div>
  );
}

/** Intake states the owner can recover from with a retry. */
const RETRYABLE = new Set(["failed", "lost", "stopped"]);

function CaptureRow({ c }: { c: CaptureView }) {
  const disposition = c.disposition ?? "pending";
  const shown = splitAttachments(c.text);
  const qc = useQueryClient();
  const [retry, setRetry] = useState<"idle" | "busy" | "error">("idle");
  const intake = c.intake;
  async function requeue() {
    if (!intake) return;
    setRetry("busy");
    try {
      await api.requeueRun(c.id, intake.run_id);
      setRetry("idle");
      void qc.invalidateQueries({ queryKey: ["captures"] });
    } catch {
      setRetry("error");
    }
  }
  return (
    <li className="capture-row">
      <div className="capture-head">
        <span className={`tag ${disposition}`}>{disposition === "package" ? "Package" : disposition === "answered" ? "Answered" : "Intake"}</span>
        {c.effective_lane !== undefined && <span className="tag" title="Data lane">{c.effective_lane} lane</span>}
        <span className="muted small">{time(c.created_at)}</span>
      </div>
      {shown.text.length > 0 && <p className="capture-text">{shown.text}</p>}
      {!c.lane && <Classify id={c.id} />}
      {disposition === "pending" && intake !== undefined && RETRYABLE.has(intake.status) && (
        <div className="capture-intake" role="alert">
          <span>
            Intake {intake.status}
            {intake.error ? `: ${intake.error}` : ""}
          </span>{" "}
          <button type="button" className="btn small" onClick={() => void requeue()} disabled={retry === "busy"}>
            Retry intake
          </button>
          {retry === "error" && <span className="error small"> Could not retry.</span>}
        </div>
      )}
      {shown.files.length > 0 && (
        <p className="capture-files">
          {shown.files.map((f) => (
            <span key={f} className="chip">
              {f}
            </span>
          ))}
        </p>
      )}
      {disposition === "answered" && c.answer !== undefined && (
        <div className="answer markdown">
          <Markdown>{c.answer}</Markdown>
        </div>
      )}
      {disposition === "package" && (c.package_ids ?? (c.package_id ? [c.package_id] : [])).map(id => (
        <p key={id}><Link to="/packages/$id" params={{ id }} className="link">Open package {id}</Link></p>
      ))}
    </li>
  );
}

