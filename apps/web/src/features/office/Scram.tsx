import { useId, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client.js";
import type { AgentFigure, ScramDetail, ScramEvent, ScramSummary } from "../../api/types.js";
import { type Passkeys, browserPasskeys, signAdmin } from "../../lib/decide.js";
import { time } from "../../lib/format.js";

/**
 * SCRAM from the office (specification 22a; plan task 4.10; OV-12). The scope, and every agent it
 * will stop, is stated before anything fires; firing needs a reason and the person's passkey; the
 * control plane stops the runs, revokes their credentials and quarantines whatever they report. The
 * office then shows the stop as it happens and its recorded latency, and the staged way back: review
 * what each stopped run reported, then restart by package, discipline or everything, each with a reason.
 */

const seconds = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);

export function ScramControl({ passkeys = browserPasskeys }: { passkeys?: Passkeys }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  // Focus goes back to the control that opened the dialog.
  const close = () => {
    setOpen(false);
    queueMicrotask(() => trigger.current?.focus());
  };
  return (
    <>
      <button ref={trigger} type="button" className="btn small danger" onClick={() => setOpen(true)} aria-haspopup="dialog">
        SCRAM
      </button>
      {open && <ScramDialog passkeys={passkeys} onClose={close} />}
    </>
  );
}

function ScramDialog({ passkeys, onClose }: { passkeys: Passkeys; onClose: () => void }) {
  const qc = useQueryClient();
  const titleId = useId();
  const admin = useQuery({ queryKey: ["admin"], queryFn: () => api.admin() });
  // The whole floor, never the presenting view: SCRAM stops restricted work too, and the count says so.
  const floor = useQuery({ queryKey: ["office-figures", false], queryFn: () => api.officeFigures(false) });
  const figures: readonly AgentFigure[] = floor.data?.figures ?? [];
  const [scope, setScope] = useState<"organization" | "project">("organization");
  const [project, setProject] = useState("");
  const [reason, setReason] = useState("");
  const [drill, setDrill] = useState(false);
  const inScope = figures.filter((f) => scope === "organization" || f.project_id === project);
  const running = inScope.filter((f) => f.run_status === "running").length;
  const queued = inScope.filter((f) => f.run_status === "queued").length;
  const projects = admin.data?.projects ?? [];
  const where = scope === "organization" ? "the whole organization" : `the project ${projects.find((p) => p.id === project)?.name ?? project}`;
  const pull = useMutation({
    mutationFn: () => signAdmin<ScramEvent>("scram.pull", { scope, ...(scope === "project" ? { project_id: project } : {}), reason: reason.trim(), ...(drill ? { drill: true } : {}) }, passkeys),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["scrams"] });
      void qc.invalidateQueries({ queryKey: ["office-figures"] });
      onClose();
    },
  });
  const ready = reason.trim().length > 0 && (scope === "organization" || project !== "");
  return (
    <div className="office-dialog-backdrop">
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="office-dialog" onKeyDown={(e) => e.key === "Escape" && !pull.isPending && onClose()}>
        <h2 id={titleId}>Pull SCRAM</h2>
        <fieldset>
          <legend>Scope</legend>
          <label className="office-choice">
            {/* A dialog takes focus when it opens. */}
            <input type="radio" name="scram-scope" autoFocus checked={scope === "organization"} onChange={() => setScope("organization")} /> The whole organization
          </label>
          <label className="office-choice">
            <input type="radio" name="scram-scope" checked={scope === "project"} onChange={() => setScope("project")} /> One project
          </label>
          {scope === "project" && (
            <label className="field">
              <span>Project</span>
              <select value={project} onChange={(e) => setProject(e.target.value)}>
                <option value="">Choose a project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </fieldset>
        {/* The scope stated before anything fires (OV-12). */}
        <p className="office-scram-scope" role="status">
          {scope === "project" && !project
            ? "Choose the project to see what this stops."
            : floor.isError
              ? `This stops every running agent in ${where} where it stands. How many could not be counted just now.`
              : !floor.data
                ? "Counting what this stops…"
            : `This stops every running agent in ${where} where it stands: ${running} running now ${running === 1 ? "stops" : "stop"}, and ${queued} queued ${queued === 1 ? "is" : "are"} held. Their credentials are revoked at once and anything they report afterwards is quarantined, never applied.`}
        </p>
        <label className="field">
          <span>Why (required)</span>
          <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <label className="office-choice">
          <input type="checkbox" checked={drill} onChange={(e) => setDrill(e.target.checked)} /> This is a drill (everything still stops for real; the time to stop is recorded as a drill)
        </label>
        {pull.error && (
          <p className="error" role="alert">
            {pull.error.message}
          </p>
        )}
        <div className="office-dialog-actions">
          <button type="button" className="btn small danger" disabled={!ready || pull.isPending} onClick={() => pull.mutate()}>
            Sign with your passkey and stop
          </button>
          <button type="button" className="btn small" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/** Every SCRAM in force, above the floor, with its stop as it happens and the way back. */
export function ScramBanner({ passkeys = browserPasskeys }: { passkeys?: Passkeys }) {
  const q = useQuery({ queryKey: ["scrams"], queryFn: () => api.scrams(), refetchInterval: (query) => (query.state.data?.scrams.some((s) => !s.stopped) ? 2000 : 30_000) });
  if (q.isError) return <p className="office-error" role="alert">Whether a SCRAM is in force could not be loaded.</p>;
  if (!q.data?.scrams.length) return null;
  return (
    <section className="office-scram" aria-label="SCRAM in force">
      {q.data.scrams.map((s) => (
        <ScramStatus key={s.scram.id} summary={s} passkeys={passkeys} />
      ))}
    </section>
  );
}

function ScramStatus({ summary: s, passkeys }: { summary: ScramSummary; passkeys: Passkeys }) {
  const [open, setOpen] = useState(false);
  const scope = s.scram.scope === "organization" ? "the whole organization" : `project ${s.scram.project_id}`;
  return (
    <div className="office-scram-item">
      <p>
        <strong>SCRAM {s.scram.id}</strong> {s.scram.drill ? "(drill) " : ""}stopped {scope}
        {s.pulled_at ? ` at ${time(s.pulled_at)}` : ""}: {s.scram.reason}
      </p>
      {/* Stop latency, once every run in scope has stopped (OV-12). */}
      <p role="status">
        {s.stopped
          ? `Stopped in ${seconds(s.stopped.ms_to_stop)}: ${s.stopped.runs} ${s.stopped.runs === 1 ? "run" : "runs"} stopped where ${s.stopped.runs === 1 ? "it" : "they"} stood.`
          : `Stopping ${s.scram.quarantine.length} ${s.scram.quarantine.length === 1 ? "run" : "runs"}; each stops at its next heartbeat.`}
      </p>
      <button type="button" className="btn small" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        Review and restart
      </button>
      {open && <ScramDetailPanel id={s.scram.id} passkeys={passkeys} />}
    </div>
  );
}

function ScramDetailPanel({ id, passkeys }: { id: string; passkeys: Passkeys }) {
  const q = useQuery({ queryKey: ["scram", id], queryFn: () => api.scram(id) });
  if (q.isError) return <p className="error" role="alert">This SCRAM could not be loaded.</p>;
  if (!q.data) return <p className="office-note">Loading…</p>;
  return (
    <div className="office-scram-detail">
      <h3>What it stopped</h3>
      {q.data.runs.length === 0 ? (
        <p className="small">No run was running when it was pulled; nothing is quarantined.</p>
      ) : (
        <ul>
          {q.data.runs.map((r) => (
            <RunReview key={r.run_id} scramId={id} run={r} passkeys={passkeys} />
          ))}
        </ul>
      )}
      <Restart detail={q.data} passkeys={passkeys} />
    </div>
  );
}

function RunReview({ scramId, run: r, passkeys }: { scramId: string; run: ScramDetail["runs"][number]; passkeys: Passkeys }) {
  const qc = useQueryClient();
  const [disposition, setDisposition] = useState<"discard" | "retain">("discard");
  const [reason, setReason] = useState("");
  const newest = r.batches.at(-1)?.id ?? 0;
  const reviewedThrough = Math.max(0, ...r.reviews.map((v) => v.covers_batch ?? 0));
  const needsReview = r.status !== "running" && (r.reviews.length === 0 || reviewedThrough < newest);
  const review = useMutation({
    mutationFn: () => signAdmin("scram.review", { scram_id: scramId, run_id: r.run_id, disposition, reason: reason.trim(), ...(newest > 0 ? { covers_batch: newest } : {}) }, passkeys),
    onSuccess: () => {
      setReason("");
      void qc.invalidateQueries({ queryKey: ["scram", scramId] });
      void qc.invalidateQueries({ queryKey: ["scrams"] });
    },
  });
  const outputs = r.batches.reduce((n, b) => n + b.output_count, 0);
  return (
    <li className="office-scram-run">
      <p className="small">
        <span className="mono">{r.run_id}</span>: {r.status === "running" ? "still stopping" : r.status}
        {r.outcome_unknown ? "; its outcome is unknown and must be reconciled before it can restart" : ""}. Quarantined: {outputs} {outputs === 1 ? "output" : "outputs"} in {r.batches.length} {r.batches.length === 1 ? "report" : "reports"}.
        {r.reviews.length > 0 ? ` Reviewed: ${r.reviews.map((v) => v.disposition).join(", ")}.` : ""}
      </p>
      {needsReview && (
        <div className="office-scram-form">
          <label className="office-choice">
            <input type="radio" name={`disp-${r.run_id}`} checked={disposition === "discard"} onChange={() => setDisposition("discard")} /> Discard the partial work
          </label>
          <label className="office-choice">
            <input type="radio" name={`disp-${r.run_id}`} checked={disposition === "retain"} onChange={() => setDisposition("retain")} /> Keep it as reference only, never applied
          </label>
          <label className="field">
            <span>What the review found (required)</span>
            <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <button type="button" className="btn small" disabled={!reason.trim() || review.isPending} onClick={() => review.mutate()}>
            Sign the review
          </button>
          {review.error && (
            <p className="error" role="alert">
              {review.error.message}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function Restart({ detail, passkeys }: { detail: ScramDetail; passkeys: Passkeys }) {
  const qc = useQueryClient();
  const [scope, setScope] = useState<"all" | "package" | "discipline">("package");
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const restart = useMutation({
    mutationFn: () =>
      signAdmin("scram.restart", {
        scram_id: detail.scram.id,
        scope,
        ...(scope === "package" ? { package_id: target.trim() } : scope === "discipline" ? { discipline: target.trim() } : {}),
        reason: reason.trim(),
      }, passkeys),
    onSuccess: () => {
      setReason("");
      void qc.invalidateQueries({ queryKey: ["scram", detail.scram.id] });
      void qc.invalidateQueries({ queryKey: ["scrams"] });
      void qc.invalidateQueries({ queryKey: ["office-figures"] });
    },
  });
  const ready = reason.trim().length > 0 && (scope === "all" || target.trim().length > 0);
  return (
    <div className="office-scram-form">
      <h3>Staged restart</h3>
      {detail.restarts.length > 0 && (
        <ul className="small">
          {detail.restarts.map((r) => (
            <li key={r.id}>
              Restarted {r.scope === "all" ? "everything" : r.scope === "package" ? `package ${r.package_id}` : `the ${r.discipline} discipline`}: {r.reason}
            </li>
          ))}
        </ul>
      )}
      <fieldset>
        <legend>Restart</legend>
        {(["package", "discipline", "all"] as const).map((s) => (
          <label key={s} className="office-choice">
            <input type="radio" name={`restart-${detail.scram.id}`} checked={scope === s} onChange={() => setScope(s)} /> {s === "package" ? "One package" : s === "discipline" ? "One discipline" : "Everything it stopped"}
          </label>
        ))}
      </fieldset>
      {scope !== "all" && (
        <label className="field">
          <span>{scope === "package" ? "Package" : "Discipline"}</span>
          <input value={target} onChange={(e) => setTarget(e.target.value)} />
        </label>
      )}
      <label className="field">
        <span>Why it is safe to restart (required)</span>
        <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <p className="muted small">The control plane refuses a restart while anything in its scope has an unknown outcome or unreviewed quarantine, and says what.</p>
      <button type="button" className="btn small" disabled={!ready || restart.isPending} onClick={() => restart.mutate()}>
        Sign and restart
      </button>
      {restart.error && (
        <p className="error" role="alert">
          {restart.error.message}
        </p>
      )}
    </div>
  );
}
