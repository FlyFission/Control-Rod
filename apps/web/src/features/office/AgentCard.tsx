import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { api } from "../../api/client.js";
import type { ActionDescriptor, AgentFigure, PackageView } from "../../api/types.js";
import { STATE_INFO, StateMark } from "../../components/StateMark.js";
import { COLUMNS, boardColumn } from "../../lib/board.js";
import { STATUS_LABEL, independenceText, time } from "../../lib/format.js";
import { REGION } from "./layout.js";

/**
 * The agent card (specification 13; OV-06, OV-08, OV-10, OV-11): what the agent is doing and why,
 * the package at a glance, rigor and independence in words, who may sign, and the actions on the
 * agent, each a governed command or stated as not yet available with the reason. It reads the same
 * package view and action descriptors the package page and case view do, so live events refresh it.
 */

const HOUR = 3600e3;
function howLong(since: string, now: number): string {
  const ms = Math.max(0, now - Date.parse(since));
  if (ms < 60e3) return "under a minute";
  if (ms < HOUR) return `${Math.round(ms / 60e3)} min`;
  if (ms < 48 * HOUR) return `${Math.round(ms / HOUR)} h`;
  return `${Math.round(ms / (24 * HOUR))} days`;
}

const RIGOR: Record<string, string> = {
  administrative: "Administrative",
  quick: "Quick",
  standard: "Standard",
  "high-consequence": "High consequence",
};
const GRADE: Record<string, string> = { safety: "Safety grade", material: "Material grade", "general-service": "General service grade" };

/** Actions a card cannot offer until the agent has a live session channel (plan task 7.2). */
const NEEDS_SESSION = "Call to my office, give direction and park are not available yet: each needs a live session channel to the agent, which arrives with the session adapter (plan task 7.2).";

export function AgentCard({ figure: f, lens }: { figure: AgentFigure | undefined; lens: string | undefined }) {
  if (!f)
    return (
      <aside className="office-card" aria-label="Selected agent">
        <p className="office-note">Select an agent to see what it is doing and why.</p>
      </aside>
    );
  return <Card key={f.id} f={f} lens={lens} />;
}

function Card({ f, lens }: { f: AgentFigure; lens: string | undefined }) {
  const now = Date.now();
  const isPackage = f.href.to === "/packages/$id";
  const view = useQuery({ queryKey: ["package", f.package_id], queryFn: () => api.packageView(f.package_id), enabled: isPackage });
  const actions = useQuery({ queryKey: ["actions", f.package_id], queryFn: () => api.packageActions(f.package_id), enabled: isPackage });
  const marks = [
    f.marks.gate && "A gate decision waits on this package",
    f.marks.changed_input && `Input ${f.marks.changed_input} changed`,
    f.marks.loop && `Round ${f.marks.loop}`,
    f.marks.safety && "Safety grade",
  ].filter(Boolean) as string[];
  return (
    <aside className="office-card" aria-label="Selected agent">
      <h2>{f.title}</h2>
      <p className="mono small">
        {f.package_id}
        {isPackage ? ` · revision ${f.package_revision}` : ""}
      </p>
      <p className="office-state">
        <StateMark kind={f.state} size={12} /> {STATE_INFO[f.state].label} for {howLong(f.since, now)}
      </p>
      <p>{f.cause}</p>
      {f.waiting_on && <p>Waiting on {f.waiting_on}.</p>}
      <p className="muted small">
        {REGION[f.place].name}
        {f.place_defaulted ? ": shown here because the package names no discipline this office recognises" : ""}
      </p>
      {marks.length > 0 && (
        <ul className="office-marks" aria-label="Marks">
          {marks.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
      {lens && <p className="small">{lens}</p>}
      {f.observability && <p className="muted small">This runtime cannot report permission waits: {f.observability}.</p>}
      {isPackage && <Glance f={f} view={view.data} actions={actions.data} failed={view.isError || actions.isError} />}
      <AgentActions f={f} view={view.data} />
      {isPackage ? (
        <Link to="/packages/$id" params={{ id: f.package_id }} {...(f.href.hash ? { hash: f.href.hash } : {})} className="btn small">
          Open the package
        </Link>
      ) : (
        <Link to="/packages" className="btn small">
          Open captures and packages
        </Link>
      )}
    </aside>
  );
}

/** The package at a glance (OV-08), rigor and independence (OV-10), and who may sign (OV-11). */
function Glance({ f, view, actions, failed }: { f: AgentFigure; view: PackageView | undefined; actions: ActionDescriptor[] | undefined; failed: boolean }) {
  if (failed) return <p className="office-note">The package details could not be loaded, so they are not shown.</p>;
  if (!view || !actions) return <p className="office-note">Loading the package details…</p>;
  const pkg = view.package;
  const step = boardColumn(pkg, Boolean(view.pre_check));
  const lastRun = [...view.runs].sort((a, b) => Date.parse(b.finished_at ?? b.started_at ?? b.queued_at) - Date.parse(a.finished_at ?? a.started_at ?? a.queued_at))[0];
  const checker = [...view.runs].reverse().find((r) => r.role === "pre-check");
  const sign = actions.find((a) => a.command === "accept") ?? actions.find((a) => a.command === "release");
  const independence = view.pre_check ? independenceText(view.pre_check) : null;
  const interfaces = (pkg.interfaces?.consumes?.length ?? 0) + (pkg.interfaces?.exports?.length ?? 0);
  const inputs = f.marks.changed_input
    ? `Input ${f.marks.changed_input} changed since the preparation pinned it`
    : f.unverified_inputs?.length
      ? `Freshness unknown for ${f.unverified_inputs.join(", ")}: no preparation pinned the revision it used`
      : "Every pinned input is current";
  return (
    <dl className="office-glance">
      <dt>Rung</dt>
      <dd>
        {STATUS_LABEL[pkg.status ?? ""] ?? pkg.status}
        {step ? `; step: ${COLUMNS.find((c) => c.id === step)?.title}` : ""}
      </dd>
      <dt>Due</dt>
      <dd>No due date is recorded for this package.</dd>
      <dt>Inputs</dt>
      <dd>{inputs}</dd>
      <dt>Last run activity</dt>
      <dd>{lastRun ? `${time(lastRun.finished_at ?? lastRun.started_at ?? lastRun.queued_at)} (${lastRun.role}, ${lastRun.status})` : "No run yet"}</dd>
      <dt>Rigor</dt>
      <dd>
        {RIGOR[pkg.rigor_mode] ?? pkg.rigor_mode}
        {pkg.grade ? `, ${GRADE[pkg.grade] ?? pkg.grade}` : ""}
      </dd>
      <dt>Checker</dt>
      <dd>{checker ? `${checker.agent_baseline} on ${checker.runtime.provider}` : "No pre-check has run yet"}</dd>
      {independence && (
        <>
          <dt>Independence</dt>
          <dd>{independence}</dd>
        </>
      )}
      <dt>Signer</dt>
      <dd>
        {!sign
          ? "No signature is open on this package now."
          : sign.allowed
            ? `You may ${sign.label.toLowerCase()} it.`
            : `You may not ${sign.label.toLowerCase()} it: ${sign.reason ?? "refused"}${sign.missing?.length ? ` (missing: ${sign.missing.join(", ")})` : ""}.`}
      </dd>
      <dt>Interfaces</dt>
      <dd>{interfaces === 0 ? "None recorded" : `${pkg.interfaces?.consumes?.length ?? 0} consumed, ${pkg.interfaces?.exports?.length ?? 0} exported`}</dd>
      <dt>Spend</dt>
      <dd>Not recorded until usage metering arrives (plan task 5.2); never shown as zero.</dd>
    </dl>
  );
}

/** The actions on the agent (OV-06): each a governed command, or said plainly to be unavailable. */
function AgentActions({ f, view }: { f: AgentFigure; view: PackageView | undefined }) {
  const qc = useQueryClient();
  const [showReach, setShowReach] = useState(false);
  const run = view?.runs.find((r) => r.id === f.id);
  const live = run ? run.status === "running" || run.status === "queued" : false;
  const stop = useMutation({
    mutationFn: () => api.stopRun(f.package_id, f.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["package", f.package_id] });
      void qc.invalidateQueries({ queryKey: ["office-figures"] });
    },
  });
  const isPackage = f.href.to === "/packages/$id";
  return (
    <section className="office-actions" aria-label="Actions on this agent">
      <h3>Actions</h3>
      <ul>
        <li>
          {isPackage ? (
            <Link to="/packages/$id/case" params={{ id: f.package_id }} className="btn small">
              Watch live
            </Link>
          ) : (
            <button type="button" className="btn small" disabled aria-describedby={`why-watch-${f.id}`}>
              Watch live
            </button>
          )}
          {!isPackage && (
            <span id={`why-watch-${f.id}`} className="muted small">
              {" "}
              An intake run's story opens from its capture.
            </span>
          )}
        </li>
        <li>
          <button type="button" className="btn small" onClick={() => setShowReach((v) => !v)} aria-expanded={showReach}>
            Inputs and reach
          </button>
          {showReach && <Reach f={f} view={view} />}
        </li>
        <li>
          <button type="button" className="btn small" disabled={!live || stop.isPending} aria-describedby={`why-stop-${f.id}`} onClick={() => stop.mutate()}>
            Stop
          </button>
          <span id={`why-stop-${f.id}`} className="muted small">
            {" "}
            {live ? "Stops this run where it stands; the control plane records who stopped it." : "Only a queued or running run can be stopped."}
          </span>
          {stop.error && (
            <p className="error" role="alert">
              {stop.error.message}
            </p>
          )}
        </li>
        <li className="office-unavailable">
          {(["Call to my office", "Give direction", "Park"] as const).map((label) => (
            <button key={label} type="button" className="btn small" disabled aria-describedby={`why-session-${f.id}`}>
              {label}
            </button>
          ))}
          <p id={`why-session-${f.id}`} className="muted small">
            {NEEDS_SESSION}
          </p>
        </li>
      </ul>
    </section>
  );
}

/** What the agent reads and where it may reach: its recorded inputs, its lane and its runtime. */
function Reach({ f, view }: { f: AgentFigure; view: PackageView | undefined }) {
  const run = view?.runs.find((r) => r.id === f.id);
  const inputs = view?.package.design_inputs ?? [];
  return (
    <div className="office-reach">
      <p className="small">
        Lane: {f.data_lane}. {run ? `Runtime: ${run.runtime.provider}${run.runtime.model && run.runtime.model !== "any" ? ` ${run.runtime.model}` : ""}.` : ""}
      </p>
      {inputs.length === 0 ? (
        <p className="small muted">No design inputs are recorded.</p>
      ) : (
        <ul className="small">
          {inputs.map((i) => (
            <li key={i.doc}>{i.doc}</li>
          ))}
        </ul>
      )}
      <p className="small muted">Sandbox reach is recorded per run once runs are sandboxed (plan task 6.4).</p>
    </div>
  );
}
