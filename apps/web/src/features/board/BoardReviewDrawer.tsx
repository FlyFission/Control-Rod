import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, explain } from "../../api/client.js";
import { projectDisplayName, useProjects } from "../../lib/projects.js";
import type { DecisionKind, PackageView, Run, WorkPackage } from "../../api/types.js";
import { AgentPanel, pickRun } from "../../components/AgentPanel.js";
import { Blocked, ReasonBox, useDecisionSigner, type DecisionSigner } from "../../components/DecisionBar.js";
import { DrawerOutputs } from "./DrawerOutputs.js";
import { useDockTop } from "./dock.js";
import { AgentBadge } from "../../components/AgentBadge.js";
import { RunCard, canStop } from "../../components/RunLog.js";
import { projectContextDefault } from "../../lib/context-profile.js";
import { needsIndependentCheck } from "../../lib/board.js";
import { decisionLabel } from "../../lib/decide.js";
import { STATUS_LABEL } from "../../lib/format.js";
import { MODE_COPY, type EngineeringMode } from "../../lib/mode.js";
import { stalledLine, stalledRun } from "../../lib/next.js";
import { plainError } from "../../lib/plainError.js";
import { useActionLock } from "../../lib/scramLock.js";
import { ContextSwitch } from "./ContextSwitch.js";
import { WorkflowSwitch } from "./WorkflowSwitch.js";
import { projectWorkflowDefault } from "../../lib/workflow.js";
import { FindingDetail, ScopeDriftNote } from "../../components/FindingDetail";

interface BoardReviewDrawerProps {
  packageId: string;
  initialPkg?: WorkPackage;
  mode: EngineeringMode;
  autoFocus?: boolean;
  onClose: () => void;
}

/** The one thing the drawer leads with: a plain sentence and, when there is one, the step to take. */
export type DrawerStep = {
  tone: "needs" | "wait" | "ok" | "block";
  text: string;
  /** The runner's error, kept for the "Show technical details" toggle. */
  raw?: string;
  /** The runner's error in plain words, with what to do about it. */
  plain?: { what: string; fix?: string };
  action?: { kind: "requeue"; runId: string } | { kind: "open-case"; label: string; hash?: string } | { kind: "decide"; decision: DecisionKind };
};

/** The decisions that can be the drawer's one primary button, in order of preference. */
const PRIMARY: readonly DecisionKind[] = ["release", "accept", "accept-with-findings"];

const PRIMARY_TEXT: Partial<Record<DecisionKind, string>> = {
  release: "Ready to hand to an agent.",
  accept: "Ready for your sign-off.",
  "accept-with-findings": "The check found issues. Accept with a note, or send it back.",
};

const isHeldForIndependence = (r: Run) =>
  r.role === "pre-check" && r.status === "queued" && (r.waiting_cause === "independent-runtime" || (r.waiting_cause === undefined && r.waiting_reason !== undefined && /independent runtime/i.test(r.waiting_reason)));

/**
 * What the drawer says first, from the same facts the card's next line uses (lib/next.ts): a run
 * that ended without a result comes before any decision, then a held check, then work in progress,
 * then the decision open to this person, then why nothing is.
 */
export function drawerStep(view: PackageView, allowed: readonly DecisionKind[], refusedReason: string | undefined): DrawerStep {
  const pkg = view.package;
  if (pkg.status === "accepted") return { tone: "ok", text: "Done. This work is accepted." };
  if (pkg.status === "closed") return { tone: "ok", text: "Closed." };
  const runs = view.runs ?? [];
  const active = runs.find((r) => r.status === "running") ?? runs.find((r) => r.status === "queued");
  const held = runs.find(isHeldForIndependence);
  if (held) {
    return {
      tone: "needs",
      text: "The check is waiting for a second agent, so it never checks its own work. Add another agent on Setup, or allow the same one to check.",
      action: { kind: "open-case", label: "Allow it", hash: `run-${held.id}` },
    };
  }
  const stalled = active ? undefined : stalledRun(runs);
  if (stalled) {
    const line = stalledLine(stalled, view.check_blocked);
    const raw = stalled.error?.trim() || undefined;
    const plain = plainError(raw);
    const text = `${line.text}.`;
    if (line.command === "requeue") return { tone: "needs", text, ...(raw ? { raw } : {}), ...(plain ? { plain } : {}), action: { kind: "requeue", runId: stalled.id } };
    if (line.command === "open-run-log")
      return { tone: "needs", text, ...(raw ? { raw } : {}), ...(plain ? { plain } : {}), action: { kind: "open-case", label: "Open run log", hash: `run-${stalled.id}` } };
    return { tone: "needs", text, ...(raw ? { raw } : {}), ...(plain ? { plain } : {}), action: { kind: "open-case", label: "Open checks" } };
  }
  if (active) {
    const who = active.role === "pre-check" ? "The check" : "An agent";
    const label = active.label?.trim();
    if (active.status === "running") return { tone: "wait", text: label ? `${who} is working on it: ${label}.` : `${who} is working on it.` };
    if (active.waiting_reason) return { tone: "wait", text: `${who} is waiting: ${active.waiting_reason}` };
    return { tone: "wait", text: `${who} is queued and starts when a runner is free.` };
  }
  // A check that found problems: sending it back is the usual step, accepting anyway the exception.
  if (view.pre_check?.outcome === "fail" && allowed.includes("return")) {
    return { tone: "needs", text: "The check found problems. Send it back with a note on what to fix.", action: { kind: "decide", decision: "return" } };
  }
  const primary = PRIMARY.find((k) => allowed.includes(k));
  if (primary) return { tone: "needs", text: PRIMARY_TEXT[primary] ?? "Ready for you.", action: { kind: "decide", decision: primary } };
  if (allowed.includes("return")) return { tone: "needs", text: "This needs another revision. Send it back with a note.", action: { kind: "decide", decision: "return" } };
  return { tone: "wait", text: refusedReason ? `Nothing for you to do yet. ${refusedReason}` : "Nothing for you to do yet." };
}

/**
 * The review drawer, calm by default (owner, 2026-11-25: "This is overwhelming and most info isn't
 * necessary"). It leads with the title, one plain sentence about where the work stands and one
 * primary step. Everything a decision rests on (what was asked, the check, outputs, runs, custody,
 * switches, the signing digest) is one click away under Details, and in full on the case page.
 */
export function BoardReviewDrawer({ packageId, initialPkg, mode, autoFocus = true, onClose }: BoardReviewDrawerProps) {
  const asideRef = useRef<HTMLElement>(null);
  useDockTop(asideRef);
  // Closing hands focus back to whatever opened the drawer (the card or button), if it is still on the page.
  const opener = useRef<Element | null>(null);
  if (opener.current === null && typeof document !== "undefined") opener.current = document.activeElement;
  useEffect(() => {
    return () => {
      const el = opener.current;
      if (el instanceof HTMLElement && el.isConnected && el !== document.body) el.focus();
    };
  }, []);
  const q = useQuery({
    queryKey: ["package", packageId],
    queryFn: () => api.packageView(packageId),
  });
  useEffect(() => {
    if (autoFocus) asideRef.current?.focus();
  }, [packageId, autoFocus]);

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

  const view = q.data;
  const pkg = view?.package ?? initialPkg;

  return (
    <aside ref={asideRef} tabIndex={-1} className="bd-drawer bd-cockpit bd-calm" aria-label={`Review ${packageId}`}>
      <div className="bd-calm-head">
        <div className="bd-calm-titles">
          {pkg ? <h2 className="bd-calm-title">{pkg.title}</h2> : <h2 className="bd-calm-title mono">{packageId}</h2>}
          <p className="bd-calm-meta small muted">
            <span className="mono">{packageId}</span>
            {pkg && <> {"·"} {STATUS_LABEL[pkg.status] ?? pkg.status}</>}
          </p>
        </div>
        <button type="button" className="btn ghost small bd-calm-close" onClick={onClose} aria-label="Close review drawer" title="Close (Esc)">
          {"✕"}
        </button>
      </div>

      <div className="bd-calm-body">
        {view ? (
          <CalmBody key={view.package.id} view={view} mode={mode} />
        ) : q.isLoading ? (
          <p className="muted">Loading…</p>
        ) : null}

        {q.isError && (
          <div role="alert" className="error">
            <p>{explain(q.error, "Could not load this card.")}</p>
            <button type="button" className="btn small" onClick={() => void q.refetch()}>
              Try again
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

function CalmBody({ view, mode }: { view: PackageView; mode: EngineeringMode }) {
  const d = useDecisionSigner(view);
  const refusedReason = d.actions.isSuccess && d.allowed.length === 0 ? d.refused.find((a) => a.reason)?.reason : undefined;
  const step = drawerStep(view, d.allowed, refusedReason);
  const pkg = view.package;
  return (
    <>
      {/* Keyed by the sentence: when where the work stands changes, the old notes and toggles go. */}
      <NextStep key={step.text} view={view} step={step} d={d} />
      <DrawerDetails view={view} mode={mode} d={d} />
      <p className="bd-calm-foot small">
        <Link to="/packages/$id" params={{ id: pkg.id }}>
          Open the full case {"↗"}
        </Link>
      </p>
    </>
  );
}

/** The sentence, the one primary step, and the quieter choices one click away. */
function NextStep({ view, step, d }: { view: PackageView; step: DrawerStep; d: DecisionSigner }) {
  const pkg = view.package;
  const qc = useQueryClient();
  const scramLock = useActionLock(pkg.project);
  const [showRaw, setShowRaw] = useState(false);
  const [more, setMore] = useState(false);
  const refresh = () => {
    for (const key of ["packages", "office", "inbox", "active-runs"]) void qc.invalidateQueries({ queryKey: [key] });
    void qc.invalidateQueries({ queryKey: ["package", pkg.id] });
    void qc.invalidateQueries({ queryKey: ["actions", pkg.id] });
  };
  const requeue = useMutation({ mutationFn: (runId: string) => api.requeueRun(pkg.id, runId), onSuccess: refresh });
  const active = (view.runs ?? []).find((r) => canStop(r));
  const stop = useMutation({ mutationFn: (runId: string) => api.stopRun(pkg.id, runId), onSuccess: refresh });
  // Choices other than the primary one, shown only when asked for: send back and reject.
  const primaryDecision = step.action?.kind === "decide" ? step.action.decision : undefined;
  const others = (["return", "reject", "accept-with-findings"] as DecisionKind[]).filter((k) => d.allowed.includes(k) && k !== primaryDecision);
  const disabled = d.busy || !d.current || d.scramLock.locked;
  const otherLabel = (k: DecisionKind) => (k === "return" ? "Send back with a note" : decisionLabel(k));

  return (
    <section className={`bd-step bd-step-${step.tone}`} aria-labelledby="bd-step-text">
      <p id="bd-step-text" className="bd-step-text" role="status">
        <span className="bd-step-dot" aria-hidden="true" />
        {step.text}
      </p>
      {step.plain && (
        <div className="bd-step-why">
          <p className="small">
            {step.plain.what}
            {step.plain.fix && <> {step.plain.fix}</>}
          </p>
          {step.raw && step.raw !== step.plain.what && (
            <>
              <button type="button" className="bd-link small" aria-expanded={showRaw} onClick={() => setShowRaw((v) => !v)}>
                {showRaw ? "Hide technical details" : "Show technical details"}
              </button>
              {showRaw && <pre className="bd-step-raw small">{step.raw}</pre>}
            </>
          )}
        </div>
      )}

      {scramLock.locked && scramLock.why && step.action && (
        <p className="lock-note small" role="status">
          {scramLock.why}
        </p>
      )}

      <div className="bd-step-actions">
        {step.action?.kind === "requeue" && (
          <button type="button" className="btn primary" disabled={requeue.isPending || scramLock.locked} title={scramLock.why} onClick={() => requeue.mutate((step.action as { runId: string }).runId)}>
            {requeue.isPending ? "Starting…" : "Run again"}
          </button>
        )}
        {step.action?.kind === "open-case" && (
          <Link to="/packages/$id" params={{ id: pkg.id }} {...(step.action.hash ? { hash: step.action.hash } : {})} className="btn primary">
            {step.action.label}
          </Link>
        )}
        {step.action?.kind === "decide" && (
          <button type="button" className="btn primary" disabled={disabled} title={d.scramLock.why} onClick={() => d.choose((step.action as { decision: DecisionKind }).decision)}>
            {step.action.decision === "return" ? "Send back with a note" : decisionLabel(step.action.decision)}
          </button>
        )}
        {!step.action && active && (
          <button type="button" className="btn ghost" disabled={stop.isPending} onClick={() => stop.mutate(active.id)}>
            {stop.isPending ? "Stopping…" : "Stop"}
          </button>
        )}
        {others.length > 0 && !more && (
          <button type="button" className="bd-link small" aria-expanded={false} onClick={() => setMore(true)}>
            Other choices
          </button>
        )}
      </div>

      {others.length > 0 && more && (
        <div className="bd-step-more" role="group" aria-label="Other choices">
          {others.map((k) => (
            <button key={k} type="button" className={k === "reject" ? "btn ghost small bd-danger-text" : "btn ghost small"} disabled={disabled} title={d.scramLock.why} onClick={() => d.choose(k)} aria-pressed={d.pending === k}>
              {otherLabel(k)}
            </button>
          ))}
        </div>
      )}

      <ReasonBox d={d} compact />

      {d.busy && <p className="muted small">Waiting for your passkey…</p>}
      {(d.error ?? requeue.error ?? stop.error) && (
        <p role="alert" className="error small">
          {d.error ?? explain(requeue.error ?? stop.error, "That did not go through.")}
        </p>
      )}
      {d.done !== null && (
        <p role="status" className="ok small">
          {d.done}
        </p>
      )}
      {requeue.isSuccess && (
        <p role="status" className="ok small">
          Queued again. This updates when an agent picks it up.
        </p>
      )}
      {d.actions.isError && (
        <p role="alert" className="error small">
          Could not check what you may sign.{" "}
          <button type="button" className="bd-link small" onClick={d.actions.refetch}>
            Try again
          </button>
        </p>
      )}
    </section>
  );
}

type Section = "asked" | "check" | "outputs" | "runs" | "settings" | "signing";

/** Everything else, folded: one disclosure, then one short row per topic. */
function DrawerDetails({ view, mode, d }: { view: PackageView; mode: EngineeringMode; d: DecisionSigner }) {
  const pkg = view.package;
  const copy = MODE_COPY[mode];
  const projects = useProjects();
  const admin = useQuery({ queryKey: ["admin"], queryFn: api.admin });
  const [open, setOpen] = useState<Section | null>(null);
  useEffect(() => setOpen(null), [pkg.id]);
  const pre = view.pre_check;
  const runs = [...(view.runs ?? [])].sort((a, b) => (Date.parse(b.finished_at ?? b.started_at ?? b.queued_at) || 0) - (Date.parse(a.finished_at ?? a.started_at ?? a.queued_at) || 0));
  const latest = pickRun(view.runs ?? []);
  const author = [...(view.runs ?? [])].filter((r) => r.role === "author").sort((a, b) => Date.parse(b.queued_at) - Date.parse(a.queued_at))[0]?.runtime?.provider;
  const checker = [...(view.runs ?? [])].filter((r) => r.role === "pre-check").sort((a, b) => Date.parse(b.queued_at) - Date.parse(a.queued_at))[0]?.runtime?.provider;

  const row = (id: Section, label: string, summary: string, body: ReactNode) => (
    <div className="bd-fold">
      <button type="button" className="bd-fold-head" aria-expanded={open === id} aria-controls={`bd-fold-${id}`} onClick={() => setOpen((cur) => (cur === id ? null : id))}>
        <span className="bd-fold-chev" aria-hidden="true">
          {open === id ? "▾" : "▸"}
        </span>
        <span className="bd-fold-label">{label}</span>
        <span className="bd-fold-sum small muted">{summary}</span>
      </button>
      {open === id && (
        <div id={`bd-fold-${id}`} className="bd-fold-body">
          {body}
        </div>
      )}
    </div>
  );

  return (
    <section className="bd-details" aria-label="Details">
      <h3 className="bd-details-title small muted">Details</h3>
      {row(
        "asked",
        "What was asked",
        `${pkg.acceptance_criteria.length} ${pkg.acceptance_criteria.length === 1 ? "criterion" : "criteria"}`,
        <>
          {pkg.objective && <p className="small">{pkg.objective}</p>}
          {pkg.acceptance_criteria.length > 0 ? (
            <ol className="bd-drawer-list">
              {pkg.acceptance_criteria.map((c, idx) => (
                <li key={idx} className="small">
                  {c}
                </li>
              ))}
            </ol>
          ) : (
            <p className="small muted">No acceptance criteria recorded yet.</p>
          )}
          {(pkg.assumptions ?? []).length > 0 && (
            <>
              <h4 className="small">{mode === "capital-projects" ? "Design basis" : "Assumptions"}</h4>
              <ul className="bd-drawer-list">
                {(pkg.assumptions ?? []).map((a) => (
                  <li key={a.id} className="small">
                    {a.statement}
                  </li>
                ))}
              </ul>
            </>
          )}
          {(pkg.depends_on ?? []).length > 0 && (
            <>
              <h4 className="small">Depends on</h4>
              <ul className="bd-drawer-list">
                {(pkg.depends_on ?? []).map((dep) => (
                  <li key={dep.package_id} className="small">
                    <span className="mono">{dep.package_id}</span>
                    {dep.reason ? ` · ${dep.reason}` : ""}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>,
      )}
      {row(
        "check",
        "Check result",
        pre ? `${pre.outcome === "pass" ? "Passed" : pre.outcome === "fail" ? "Failed" : pre.outcome}${pre.findings.length > 0 ? `, ${pre.findings.length} ${pre.findings.length === 1 ? "finding" : "findings"}` : ""}` : "Not run yet",
        pre ? (
          <>
            <p className="small muted">
              Checked by {pre.verifier} ({pre.method})
            </p>
            <ScopeDriftNote drift={view.scope_drift} />
            {pre.findings.length > 0 ? (
              <ul className="bd-drawer-list">
                {pre.findings.map((f) => (
                  <li key={f.id} className="small">
                    <span className={`tag sev-${f.severity}`}>{f.severity}</span> {f.text}
                    <FindingDetail finding={f} />
                    {f.resolution !== undefined && <span className="muted"> {"·"} Resolution: {f.resolution}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small muted">No findings.</p>
            )}
          </>
        ) : (
          <p className="small muted">The check runs after an agent finishes the work.</p>
        ),
      )}
      {row(
        "outputs",
        "Outputs",
        `${view.outputs.length} of ${pkg.deliverables.length} ${pkg.deliverables.length === 1 ? "file" : "files"}`,
        <>
          <DrawerOutputs packageId={pkg.id} outputs={view.outputs} loading={false} />
          {pkg.deliverables.length > 0 && (
            <p className="small muted bd-requested">
              Asked for:{" "}
              {pkg.deliverables.map((x, i) => (
                <span key={x.id}>
                  {i > 0 ? ", " : ""}
                  {x.type}
                  {x.format && x.format.length > 0 ? ` (${x.format.join(", ")})` : ""}
                </span>
              ))}
            </p>
          )}
        </>,
      )}
      {row(
        "runs",
        "Agent runs",
        runs.length === 0 ? "None yet" : `${runs.length} ${runs.length === 1 ? "run" : "runs"}`,
        runs.length > 0 ? (
          <>
            {latest && (latest.status === "running" || latest.status === "queued") && <AgentPanel packageId={pkg.id} showStop={false} />}
            {runs.map((run) => (
              <RunCard key={run.id} packageId={pkg.id} run={run} />
            ))}
          </>
        ) : (
          <p className="small muted">No agent runs recorded yet.</p>
        ),
      )}
      {row(
        "settings",
        "Who and how",
        `${pkg.agent_assignment[0]?.agent_baseline ?? "Unassigned"}, ${needsIndependentCheck(pkg) ? "independent check" : "standard check"}`,
        <>
          <dl className="bd-custody" role="group" aria-label="Custody chain">
            <div>
              <dt>{copy.custodyRoles[0]}</dt>
              <dd>
                {author && <AgentBadge runtime={author} />}
                {pkg.agent_assignment[0]?.agent_baseline ?? "Unassigned"}
              </dd>
            </div>
            <div>
              <dt>{copy.custodyRoles[1]}</dt>
              <dd>
                {checker && <AgentBadge runtime={checker} />}
                {needsIndependentCheck(pkg) ? "Independent required" : "Standard check"}
              </dd>
            </div>
            <div>
              <dt>{copy.custodyRoles[2]}</dt>
              <dd>Passkey sign-off</dd>
            </div>
          </dl>
          <div className="bd-fold-switches">
            <ContextSwitch pkg={pkg} view={view} projectDefault={projectContextDefault(admin.data?.projects, pkg.project)} />
            <WorkflowSwitch pkg={pkg} view={view} projectDefault={projectWorkflowDefault(admin.data?.projects, pkg.project)} />
          </div>
          <p className="small muted">
            {pkg.project ? `${projectDisplayName(pkg.project, projects)} · ` : ""}
            {pkg.grade ?? "general-service"} {"·"} lane {view.effective_lane ?? pkg.data_lane}
            {pkg.discipline ? ` · ${pkg.discipline}` : ""}
          </p>
        </>,
      )}
      {row(
        "signing",
        "Signing record",
        `Revision ${pkg.revision}`,
        <>
          <p className="small">{view.binds ?? `A decision here signs revision ${pkg.revision}, its output and its pre-check, bound by this digest.`}</p>
          <p className="small muted">
            Digest <span className="mono wrap">{view.subject_digest.algorithm}:{view.subject_digest.value}</span>
          </p>
          {d.refused.length > 0 && (
            <>
              <h4 className="small">Why some decisions are not open to you</h4>
              <Blocked refused={d.refused} label={decisionLabel} />
            </>
          )}
        </>,
      )}
    </section>
  );
}
