import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client.js";
import type { ScramDetail, ScramEvent, ScramSummary } from "../../api/types.js";
import { type Passkeys, browserPasskeys, signAdmin } from "../../lib/decide.js";
import { time } from "../../lib/format.js";

/**
 * SCRAM from the office (specification 22a; plan task 4.10; OV-12). The scope, and what it will stop,
 * is stated before anything fires, counted by the control plane with the pull's own selection; firing
 * needs a reason and the person's passkey; the control plane stops the runs, revokes their credentials
 * and quarantines whatever they report. The office then shows the stop as it happens and its recorded
 * latency, and the staged way back: review what each stopped run reported, then restart by package,
 * discipline or everything, each with a reason.
 */

const seconds = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, a[href], [tabindex]:not([tabindex="-1"])';

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
  const dialog = useRef<HTMLDialogElement>(null);
  const admin = useQuery({ queryKey: ["admin"], queryFn: () => api.admin() });
  const [scope, setScope] = useState<"organization" | "project">("organization");
  const [project, setProject] = useState("");
  const [reason, setReason] = useState("");
  const [drill, setDrill] = useState(false);
  const chosen = scope === "organization" || project !== "";
  // Counted by the control plane with the selection the pull itself makes, so the count is what fires.
  const preview = useQuery({
    queryKey: ["scram-preview", scope, project],
    queryFn: () => api.scramPreview(scope, scope === "project" ? project : undefined),
    enabled: chosen,
    refetchInterval: 5000,
  });
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
  const ready = reason.trim().length > 0 && chosen;

  // A native modal: the page behind it is inert. Where showModal is missing it still opens.
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (typeof d.showModal === "function") d.showModal();
    else d.setAttribute("open", "");
    return () => {
      if (typeof d.close === "function") d.close();
    };
  }, []);
  // Nothing closes the dialog while the signed stop is in flight: closing would not cancel it.
  const dismiss = () => {
    if (!pull.isPending) onClose();
  };
  // Focus stays inside: Tab from the last control goes to the first, Shift+Tab from the first to the last.
  const onKeyDown = (e: KeyboardEvent<HTMLDialogElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      dismiss();
      return;
    }
    if (e.key !== "Tab" || !dialog.current) return;
    const all = [...dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (!all.length) return;
    const first = all[0]!;
    const last = all.at(-1)!;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !dialog.current.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !dialog.current.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  };

  const p = preview.data;
  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      className="office-dialog"
      onKeyDown={onKeyDown}
      onCancel={(e) => {
        e.preventDefault();
        dismiss();
      }}
    >
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
              {projects.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </fieldset>
      {/* The scope stated before anything fires (OV-12). */}
      <div className="office-scram-scope" role="status">
        {!chosen ? (
          <p>Choose the project to see what this stops.</p>
        ) : preview.isError ? (
          <p>This stops every running agent in {where} where it stands. How many could not be counted just now.</p>
        ) : !p ? (
          <p>Counting what this stops…</p>
        ) : (
          <>
            <p>
              This stops every running agent in {where} where it stands. Counted at {time(p.counted_at)}: {plural(p.running.length, "run", "runs")} running now{" "}
              {p.running.length === 1 ? "stops" : "stop"}, and {plural(p.queued.length, "queued run is", "queued runs are")} held. Their credentials are revoked at once and
              anything they report afterwards is quarantined, never applied.
            </p>
            <p className="small">SCRAM selects again at the moment it fires, so a run that starts before you sign is stopped too.</p>
            {p.running.length + p.queued.length > 0 && (
              <details>
                <summary>Which runs</summary>
                <ul className="small mono">
                  {p.running.map((id) => (
                    <li key={id}>{id} (running)</li>
                  ))}
                  {p.queued.map((id) => (
                    <li key={id}>{id} (queued)</li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </div>
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
          {pull.isPending ? "Signing and stopping…" : "Sign with your passkey and stop"}
        </button>
        <button type="button" className="btn small" disabled={pull.isPending} onClick={dismiss}>
          Cancel
        </button>
      </div>
    </dialog>
  );
}

/**
 * Every SCRAM in force, above the floor, with its stop as it happens and the way back. Presenting, the
 * control plane sends only that each holds and over what scope, and the review and restart are not offered.
 */
export function ScramBanner({ passkeys = browserPasskeys, presenting = false }: { passkeys?: Passkeys; presenting?: boolean }) {
  const q = useQuery({
    queryKey: ["scrams", presenting],
    queryFn: () => api.scrams(presenting),
    refetchInterval: (query) => (query.state.data?.scrams.some((s) => !s.stopped) ? 2000 : 30_000),
  });
  if (q.isError) return <p className="office-error" role="alert">Whether a SCRAM is in force could not be loaded.</p>;
  if (!q.data?.scrams.length) return null;
  return (
    <section className="office-scram" aria-label="SCRAM in force">
      {q.data.scrams.map((s) => (
        <ScramStatus key={s.scram.id} summary={s} passkeys={passkeys} presenting={presenting} />
      ))}
    </section>
  );
}

function ScramStatus({ summary: s, passkeys, presenting }: { summary: ScramSummary; passkeys: Passkeys; presenting: boolean }) {
  const [open, setOpen] = useState(false);
  const scope = s.scram.scope === "organization" ? "the whole organization" : `project ${s.scram.project_id}`;
  const reason = "reason" in s.scram ? s.scram.reason : undefined;
  return (
    <div className="office-scram-item">
      {/* Pulled is not stopped: the stop is claimed only once the control plane records it. */}
      <p>
        <strong>SCRAM {s.scram.id}</strong> {s.scram.drill ? "(drill) " : ""}pulled on {scope}
        {s.pulled_at ? ` at ${time(s.pulled_at)}` : ""}
        {reason ? `: ${reason}` : ""}
      </p>
      {/* Stop latency, once every run in scope has stopped (OV-12). */}
      <p role="status">
        {s.stopped
          ? `Stopped at ${time(s.stopped.at)}, ${seconds(s.stopped.ms_to_stop)} after the pull: ${plural(s.stopped.runs, "run", "runs")} stopped where ${s.stopped.runs === 1 ? "it" : "they"} stood.`
          : `Stopping ${plural(s.run_count, "run", "runs")}; each stops at its next heartbeat.`}
      </p>
      {presenting ? (
        <p className="muted small">Its reason, the runs it stopped and the way back are not shown while presenting.</p>
      ) : (
        <>
          <button type="button" className="btn small" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            Review and restart
          </button>
          {open && <ScramDetailPanel id={s.scram.id} passkeys={passkeys} />}
        </>
      )}
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

type StoppedRun = ScramDetail["runs"][number];

function RunReview({ scramId, run: r, passkeys }: { scramId: string; run: StoppedRun; passkeys: Passkeys }) {
  const qc = useQueryClient();
  const [disposition, setDisposition] = useState<"discard" | "retain">("discard");
  const [reason, setReason] = useState("");
  const newest = r.batches.at(-1)?.id ?? 0;
  // The reports a review covers are frozen when the reviewer starts: a report that lands while they
  // write never joins a review they did not see it in.
  const [basis, setBasis] = useState(newest);
  const drafting = reason.trim() !== "" || disposition !== "discard";
  useEffect(() => {
    if (!drafting) setBasis(newest);
  }, [newest, drafting]);
  const moved = newest !== basis;
  const reviewedThrough = Math.max(0, ...r.reviews.map((v) => v.covers_batch ?? 0));
  const needsReview = r.status !== "running" && (r.reviews.length === 0 || reviewedThrough < newest);
  const review = useMutation({
    mutationFn: () => signAdmin("scram.review", { scram_id: scramId, run_id: r.run_id, disposition, reason: reason.trim(), ...(basis > 0 ? { covers_batch: basis } : {}) }, passkeys),
    onSuccess: () => {
      setReason("");
      setDisposition("discard");
      void qc.invalidateQueries({ queryKey: ["scram", scramId] });
      void qc.invalidateQueries({ queryKey: ["scrams"] });
    },
  });
  const startOver = () => {
    setReason("");
    setDisposition("discard");
    setBasis(newest);
  };
  const shown = r.batches.filter((b) => b.id <= basis || !drafting);
  const late = r.batches.filter((b) => b.id > basis && drafting);
  return (
    <li className="office-scram-run">
      <p className="small">
        <span className="mono">{r.run_id}</span> ({r.role} on {r.subject} <span className="mono">{r.subject_id}</span>): {r.status === "running" ? "still stopping" : r.status}
        {r.outcome_unknown ? "; its outcome is unknown and must be reconciled before it can restart" : ""}.
        {r.reviews.length > 0 ? ` Reviewed: ${r.reviews.map((v) => `${v.disposition}${v.covers_batch ? ` through report ${v.covers_batch}` : ""}`).join(", ")}.` : ""}
      </p>
      {/* What it reported, output by output with its digest, before any disposition is offered. */}
      {r.batches.length === 0 ? (
        <p className="small">It reported nothing after the SCRAM; nothing is quarantined.</p>
      ) : (
        <ol className="office-scram-batches small" aria-label={`What ${r.run_id} reported`}>
          {shown.map((b) => (
            <Batch key={b.id} batch={b} />
          ))}
        </ol>
      )}
      {needsReview && (
        <div className="office-scram-form">
          {moved && (
            <div className="office-scram-new" role="alert">
              <p className="small">
                {plural(late.length, "new report", "new reports")} arrived while you were writing. Your review covers only what you saw, through report {basis}; start over to
                review the new material.
              </p>
              <ol className="office-scram-batches small" aria-label="Reports that arrived while you were writing">
                {late.map((b) => (
                  <Batch key={b.id} batch={b} />
                ))}
              </ol>
              <button type="button" className="btn small" onClick={startOver}>
                Start over with every report
              </button>
            </div>
          )}
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
          <button type="button" className="btn small" disabled={!reason.trim() || moved || review.isPending} onClick={() => review.mutate()}>
            {basis > 0 ? `Sign the review of reports 1 to ${basis}` : "Sign the review"}
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

function Batch({ batch: b }: { batch: StoppedRun["batches"][number] }) {
  return (
    <li value={b.id}>
      Report {b.id}, {b.reported} at {time(b.recorded_at)}: {b.outputs.length === 0 ? "no outputs" : plural(b.outputs.length, "output", "outputs")}
      {b.outputs.length > 0 && (
        <ul>
          {b.outputs.map((o, i) => (
            <li key={`${o.name}-${i}`}>
              {o.name} <code className="mono">sha256:{o.sha256}</code>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Restart({ detail, passkeys }: { detail: ScramDetail; passkeys: Passkeys }) {
  const qc = useQueryClient();
  const [scope, setScope] = useState<"all" | "package" | "discipline">("package");
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  // Only what this SCRAM still holds can be named; the control plane refuses anything else.
  const held = detail.packages.filter((p) => !p.lifted);
  const disciplines = [...new Set(held.flatMap((p) => (p.discipline ? [p.discipline] : [])))].sort();
  const options = scope === "package" ? held.map((p) => ({ value: p.id, label: `${p.title} (${p.id})` })) : disciplines.map((d) => ({ value: d, label: d }));
  const valid = scope === "all" || options.some((o) => o.value === target);
  // A different scope or target is a different restart: its reason is written afresh.
  const choose = (next: typeof scope) => {
    setScope(next);
    setTarget("");
    setReason("");
  };
  const restart = useMutation({
    mutationFn: () =>
      signAdmin("scram.restart", {
        scram_id: detail.scram.id,
        scope,
        ...(scope === "package" ? { package_id: target } : scope === "discipline" ? { discipline: target } : {}),
        reason: reason.trim(),
      }, passkeys),
    onSuccess: () => {
      setReason("");
      setTarget("");
      void qc.invalidateQueries({ queryKey: ["scram", detail.scram.id] });
      void qc.invalidateQueries({ queryKey: ["scrams"] });
      void qc.invalidateQueries({ queryKey: ["office-figures"] });
    },
  });
  const ready = reason.trim().length > 0 && valid;
  const pkg = held.find((p) => p.id === target);
  const inDiscipline = held.filter((p) => p.discipline === target);
  const stoppedIn = (ids: Set<string>) => detail.runs.filter((r) => r.subject === "package" && ids.has(r.subject_id)).length;
  // The exact scope, stated before signing.
  const exact =
    scope === "all"
      ? `This lifts SCRAM ${detail.scram.id} for everything it holds: ${plural(held.length, "package", "packages")} and any intake work on captures in its scope, and the ${plural(detail.runs.length, "run", "runs")} it stopped.`
      : !valid
        ? null
        : scope === "package"
          ? `This restarts package ${pkg!.title} (${pkg!.id}) only, and the ${plural(stoppedIn(new Set([pkg!.id])), "run", "runs")} the SCRAM stopped on it.`
          : `This restarts the ${target} discipline: ${inDiscipline.map((p) => p.id).join(", ")}, and the ${plural(stoppedIn(new Set(inDiscipline.map((p) => p.id))), "run", "runs")} the SCRAM stopped on them.`;
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
            <input type="radio" name={`restart-${detail.scram.id}`} checked={scope === s} onChange={() => choose(s)} />{" "}
            {s === "package" ? "One package" : s === "discipline" ? "One discipline" : "Everything it stopped"}
          </label>
        ))}
      </fieldset>
      {scope !== "all" &&
        (options.length === 0 ? (
          <p className="small">{scope === "package" ? "No package in its scope is still held." : "No package it still holds records a discipline."}</p>
        ) : (
          <label className="field">
            <span>{scope === "package" ? "Package" : "Discipline"}</span>
            <select
              value={target}
              onChange={(e) => {
                setTarget(e.target.value);
                setReason("");
              }}
            >
              <option value="">{scope === "package" ? "Choose a package it holds" : "Choose a discipline"}</option>
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      {exact && (
        <p className="office-scram-scope" role="status">
          {exact}
        </p>
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
