import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Markdown from "react-markdown";
import { api } from "../api/client.js";
import type { CaptureView, CrEvent, Metrics } from "../api/types.js";
import { CaptureBox } from "../components/CaptureBox.js";
import { StateMark } from "../components/StateMark.js";
import { LAST_SEEN_KEY, readNumber, writeNumber } from "../lib/storage.js";
import { splitAttachments } from "../lib/attachments.js";
import { time } from "../lib/format.js";

export function Home() {
  const office = useQuery({ queryKey: ["office"], queryFn: api.office });
  return (
    <div className="home">
      <div className="home-main">
        <CaptureBox />
        <RecentCaptures />
      </div>
      <aside className="home-side">
        <section className="panel needs" aria-labelledby="needs-title">
          <h2 id="needs-title">Needs you</h2>
          <p className="big">
            <StateMark kind="needs" size={14} />
            <span>{office.data?.length ?? 0}</span>
          </p>
          <Link to="/office" className="btn ghost small">
            Open your office
          </Link>
        </section>
        <SinceLastLooked />
        <MetricsPanel />
      </aside>
    </div>
  );
}

function RecentCaptures() {
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
        <span className="muted small">{time(c.created_at)}</span>
      </div>
      {shown.text.length > 0 && <p className="capture-text">{shown.text}</p>}
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
      {disposition === "package" && c.package_id !== undefined && (
        <Link to="/packages/$id" params={{ id: c.package_id }} className="link">
          Open package {c.package_id}
        </Link>
      )}
    </li>
  );
}

/** Events since this browser last marked them seen. Stored per viewer; works without storage. */
function SinceLastLooked() {
  const [lastSeen, setLastSeen] = useState<number | undefined>(() => readNumber(LAST_SEEN_KEY));
  const q = useQuery({ queryKey: ["events", "since", lastSeen ?? 0], queryFn: () => api.events(lastSeen ?? 0) });
  const events: CrEvent[] = q.data ?? [];
  const fresh = lastSeen === undefined ? [] : events.filter((e) => e.seq > lastSeen);
  const maxSeq = events.reduce((m, e) => Math.max(m, e.seq), lastSeen ?? 0);

  // First visit on this browser: start counting from now.
  useEffect(() => {
    if (lastSeen === undefined && q.data !== undefined) {
      writeNumber(LAST_SEEN_KEY, maxSeq);
      setLastSeen(maxSeq);
    }
  }, [lastSeen, q.data, maxSeq]);

  function markSeen() {
    writeNumber(LAST_SEEN_KEY, maxSeq);
    setLastSeen(maxSeq);
  }

  return (
    <section className="panel" aria-labelledby="since-title">
      <h2 id="since-title">Since you last looked</h2>
      {lastSeen === undefined ? (
        <p className="muted">First visit on this browser. New activity will collect here.</p>
      ) : fresh.length === 0 ? (
        <p className="muted">Nothing new.</p>
      ) : (
        <ul className="since">
          {fresh.slice(-6).reverse().map((e) => (
            <li key={e.seq}>
              <span className="mono small">{e.type}</span> <span>{e.subject}</span>
            </li>
          ))}
          {fresh.length > 6 && <li className="muted small">and {fresh.length - 6} more in Records</li>}
        </ul>
      )}
      <button type="button" className="btn ghost small" onClick={markSeen}>
        Mark as seen
      </button>
    </section>
  );
}

function MetricsPanel() {
  const q = useQuery({ queryKey: ["metrics"], queryFn: api.metrics });
  const m: Metrics | undefined = q.data;
  const rows: [string, string][] =
    m === undefined
      ? []
      : [
          ["Packages accepted", String(m.packages_accepted)],
          ["Accepted on first pass", String(m.first_pass_accepted)],
          ["Findings caught before review", String(m.findings_caught_before_review)],
          ["Median review minutes", m.median_review_minutes ?? "none yet"],
          ["Median minutes to done", m.median_minutes_to_done ?? "none yet"],
          ["Quick answers", String(m.quick_answers)],
        ];
  return (
    <section className="panel" aria-labelledby="metrics-title">
      <h2 id="metrics-title">Is it earning its place?</h2>
      {m === undefined ? (
        <p className="muted">{q.isError ? "Metrics unavailable." : "Loading"}</p>
      ) : (
        <dl className="metrics">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd className="mono">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
