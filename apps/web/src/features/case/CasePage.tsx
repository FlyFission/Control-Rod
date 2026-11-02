import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client.js";
import type { ActionDescriptor, DecisionKind, PackageView, Run, VerificationRecord, WorkPackage } from "../../api/types.js";
import { decisionLabel } from "../../lib/decide.js";
import { DecisionBar } from "../../components/DecisionBar.js";
import { StateMark } from "../../components/StateMark.js";
import { runState, runStatusText } from "../../components/RunLog.js";
import { shortDigest } from "../../lib/format.js";
import { type Presentation, TIER_LABEL, presentation } from "./scaling.js";
import { type StoryStep, story, traceFacts } from "./story.js";

const ROLE_WORDS: Record<string, string> = { intake: "Intake", author: "Author", "pre-check": "Pre-check" };

/**
 * The case view (specification 14; plan tasks 3.4 to 3.7), a preview beside the package page. One
 * column in PROVE order: Asked, Ran, Checked, Open, then Sign, with the decision bar never absent.
 * Presentation scales with rigor and grade; floors do not, and the pre-check is shown in every tier.
 */
export function CasePage({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["package", id], queryFn: () => api.packageView(id) });
  const actions = useQuery({ queryKey: ["actions", id], queryFn: () => api.packageActions(id) });
  const [everything, setEverything] = useState(false);
  if (q.isLoading) return <p className="muted">Loading</p>;
  if (q.isError || q.data === undefined)
    return (
      <p role="alert" className="error">
        Could not load package {id}.
      </p>
    );
  const view = q.data;
  const pkg = view.package;
  const base = presentation(pkg);
  // "Show everything" opens every section fully; it never changes what the floors require.
  const p: Presentation = everything ? { ...base, asked: "full-inputs", ran: "full", checked: "criteria", criteriaShown: Infinity } : base;
  return (
    <div className="case">
      <header className="panel case-head">
        <p className="mono small muted">
          {pkg.id} · rev {pkg.revision} · {pkg.project}
        </p>
        <h1>{pkg.title}</h1>
        <div className="pkg-tags">
          <span className="tag" title="Rigor: presentation scales with it; floors do not">
            {TIER_LABEL[base.tier]}
          </span>
          {pkg.grade !== undefined && <span className="tag">{pkg.grade} grade</span>}
          {pkg.discipline !== undefined && <span className="tag">{pkg.discipline}</span>}
          <span className="tag">{view.effective_lane ?? pkg.data_lane} lane</span>
        </div>
        <p className="muted small">
          Preview. The case view grows here beside the <Link to="/packages/$id" params={{ id: pkg.id }}>package page</Link> until comments and the
          separate verdict and clearance decisions join it.
        </p>
        <button type="button" className="btn ghost small" aria-pressed={everything} onClick={() => setEverything((v) => !v)}>
          {everything ? `Show the ${TIER_LABEL[base.tier].toLowerCase()} view` : "Show everything"}
        </button>
      </header>
      <ol className="case-steps">
        <Step n={1} title="Asked" id="asked">
          <Asked pkg={pkg} view={view} p={p} />
        </Step>
        <Step n={2} title="Ran" id="ran">
          <Ran packageId={pkg.id} runs={view.runs} p={p} />
        </Step>
        <Step n={3} title="Checked" id="checked">
          <Checked pkg={pkg} view={view} p={p} />
        </Step>
        <Step n={4} title="Open" id="open">
          <Open view={view} actions={actions.data} actionsFailed={actions.isError} />
        </Step>
        <Step n={5} title="Sign" id="sign">
          {base.personVerification && <p className="small">This grade treats agent checks as pre-checks: a person must verify before the work is accepted.</p>}
          {base.hardwareSigner && <p className="small">This grade needs a credentialed signer with an attested hardware key.</p>}
          <DecisionBar view={view} />
        </Step>
      </ol>
      <SignStrip view={view} actions={actions.data} loading={actions.isLoading} failed={actions.isError} />
    </div>
  );
}

function Step({ n, title, id, children }: { n: number; title: string; id: string; children: React.ReactNode }) {
  return (
    <li className="case-step" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="case-step-title">
        <span className="case-step-n" aria-hidden="true">
          {n}
        </span>
        {title}
      </h2>
      <div id={id} className="panel">
        {children}
      </div>
    </li>
  );
}

function Asked({ pkg, view, p }: { pkg: WorkPackage; view: PackageView; p: Presentation }) {
  const criteria = pkg.acceptance_criteria;
  const shown = criteria.slice(0, p.criteriaShown);
  const prep = useQuery({ queryKey: ["preparation", pkg.id], queryFn: () => api.preparation(pkg.id), enabled: view.preparation_enrolled === true });
  return (
    <>
      <p className="case-objective">{pkg.objective}</p>
      {p.asked === "line" ? (
        <p className="muted small">
          {criteria.length} acceptance {criteria.length === 1 ? "criterion" : "criteria"}, {pkg.deliverables.length} deliverable
          {pkg.deliverables.length === 1 ? "" : "s"}.
        </p>
      ) : (
        <>
          <h3>Acceptance criteria</h3>
          <ol className="criteria">
            {shown.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ol>
          {shown.length < criteria.length && <p className="muted small">and {criteria.length - shown.length} more, under Show everything.</p>}
          <h3>Deliverables</h3>
          <ul className="plain-list">
            {pkg.deliverables.map((d) => (
              <li key={d.id}>
                <span className="mono small">{d.id}</span> {d.type}
                {d.format !== undefined && d.format.length > 0 && <span className="muted small"> ({d.format.join(", ")})</span>}
              </li>
            ))}
          </ul>
        </>
      )}
      {(p.asked === "full" || p.asked === "full-inputs") && (
        <>
          {(pkg.assumptions ?? []).length > 0 && (
            <>
              <h3>Assumptions</h3>
              <ul className="plain-list">
                {(pkg.assumptions ?? []).map((a) => (
                  <li key={a.id}>
                    <span className="mono small">{a.id}</span> {a.statement}
                    {a.requires_confirmation && <span className="tag small-tag">to confirm</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
          <h3>Requirements</h3>
          {view.preparation_enrolled ? (
            prep.data === undefined ? (
              <p className="muted small">{prep.isError ? "The preparation record could not be loaded." : "Loading"}</p>
            ) : (
              <p className="small">
                Guided preparation: requirements {prep.data.confirmed ? "confirmed" : <strong>not yet confirmed</strong>}, digest{" "}
                <span className="mono">{shortDigest(prep.data.requirements_digest)}</span>.
              </p>
            )
          ) : (
            <p className="muted small">Written on the package itself; this package does not use guided preparation, so there is no separate confirmation.</p>
          )}
        </>
      )}
      {p.asked === "full-inputs" && (
        <>
          <h3>Design inputs</h3>
          {pkg.design_inputs.length === 0 ? (
            <p className="muted small">None listed.</p>
          ) : (
            <ul className="plain-list">
              {pkg.design_inputs.map((d) => (
                <li key={`${d.doc}-${d.revision}`}>
                  <span className="mono small">
                    {d.doc} rev {d.revision}
                  </span>{" "}
                  {d.title ?? ""} <span className="muted small">({d.use})</span>
                </li>
              ))}
            </ul>
          )}
          <h3>Methodology</h3>
          {pkg.methodology === undefined ? (
            <p className="muted small">None stated.</p>
          ) : (
            <p className="small">
              {pkg.methodology.method}, {pkg.methodology.status === "approved" ? `approved by ${pkg.methodology.approved_by ?? "a person"}` : <strong>proposed, not approved</strong>}
              {(pkg.methodology.tools ?? []).length > 0 &&
                `; tools: ${(pkg.methodology.tools ?? []).map((t) => `${t.name}${t.qualification ? ` (${t.qualification.replaceAll("-", " ")})` : ""}`).join(", ")}`}
              .
            </p>
          )}
          <p className="muted small">A signed methodology decision arrives with the separate decision kinds; none is recorded here yet.</p>
        </>
      )}
    </>
  );
}

function Ran({ packageId, runs, p }: { packageId: string; runs: Run[]; p: Presentation }) {
  if (runs.length === 0) return <p className="muted">No runs yet.</p>;
  return (
    <ol className="case-runs">
      {runs.map((run, i) => (
        <RunStory key={run.id} packageId={packageId} run={run} p={p} open={p.ran === "full" || (p.ran === "story" && i === runs.length - 1)} />
      ))}
    </ol>
  );
}

/** How many steps of a long story show before "Show all". */
const STORY_SHOWN = 200;

function RunStory({ packageId, run, p, open }: { packageId: string; run: Run; p: Presentation; open: boolean }) {
  const [expanded, setExpanded] = useState(open);
  const [all, setAll] = useState(false);
  const events = useQuery({
    queryKey: ["run-events", packageId, run.id],
    queryFn: () => allRunEvents(packageId, run.id),
    enabled: expanded,
  });
  const steps = events.data ? story(events.data) : [];
  const shown = all ? steps : steps.slice(-STORY_SHOWN);
  const facts = traceFacts(run, { attestationRequired: p.attestationRequired });
  const flagged = facts.filter((f) => f.flag !== undefined).length;
  return (
    <li className="case-run">
      <details open={expanded} onToggle={(e) => setExpanded((e.target as HTMLDetailsElement).open)}>
        <summary>
          <StateMark kind={runState(run)} />
          <span className="tag">{ROLE_WORDS[run.role] ?? run.role}</span>
          <span>round {run.round}</span>
          <span className="muted small">{runStatusText(run)}</span>
          {flagged > 0 && <span className="small flag-count">{flagged} to weigh</span>}
        </summary>
        <dl className="facts">
          {facts.map((f) => (
            <div key={f.label} className={f.flag ? "fact flagged" : "fact"}>
              <dt>{f.label}</dt>
              <dd>
                <span className="mono">{f.value}</span>
                {f.flag && <span className="fact-flag">{f.flag}</span>}
              </dd>
            </div>
          ))}
        </dl>
        {run.error !== undefined && (
          <p className="error small" role="note">
            {run.error}
          </p>
        )}
        {p.ran === "summary" && !all ? (
          <p className="muted small">
            {events.data ? `${steps.length} steps.` : ""}{" "}
            <button type="button" className="btn ghost small" onClick={() => setAll(true)}>
              Read the story
            </button>
          </p>
        ) : events.isLoading ? (
          <p className="muted small">Loading the story</p>
        ) : events.isError ? (
          <p className="error small">The story could not be loaded; the raw log on the package page has everything.</p>
        ) : steps.length === 0 ? (
          <p className="muted small">No events were recorded for this run.</p>
        ) : (
          <>
            {shown.length < steps.length && (
              <button type="button" className="btn ghost small" onClick={() => setAll(true)}>
                Show all {steps.length} steps
              </button>
            )}
            <ol className="story">
              {shown.map((s) => (
                <StoryLine key={s.seq} step={s} />
              ))}
            </ol>
          </>
        )}
      </details>
    </li>
  );
}

function StoryLine({ step }: { step: StoryStep }) {
  const mark = step.kind === "tool" ? (step.ok === false ? "✕" : step.ok === true ? "✓" : "…") : "";
  return (
    <li className={`story-step ${step.kind}${step.ok === false ? " failed" : ""}`}>
      {mark && (
        <span className="story-mark" aria-label={step.ok === false ? "failed" : step.ok === true ? "succeeded" : "no result reported"}>
          {mark}
        </span>
      )}
      <span className="story-text">{step.text}</span>
      {step.detail && <span className="muted small"> {step.detail}</span>}
    </li>
  );
}

/** Every event of a run, page by page (2,000 per page, up to the run's limit). */
async function allRunEvents(packageId: string, runId: string) {
  const out: Awaited<ReturnType<typeof api.runEvents>>["events"] = [];
  let after = 0;
  for (let page = 0; page < 12; page++) {
    const { events } = await api.runEvents(packageId, runId, after);
    out.push(...events);
    if (events.length < 2000) break;
    after = events.at(-1)!.seq;
  }
  return out;
}

function Checked({ pkg, view, p }: { pkg: WorkPackage; view: PackageView; p: Presentation }) {
  const record = view.pre_check;
  const prep = useQuery({ queryKey: ["preparation", pkg.id], queryFn: () => api.preparation(pkg.id), enabled: view.preparation_enrolled === true && p.checked === "criteria" });
  return (
    <>
      <PreCheckFloor record={record} compact={p.checked === "compact"} />
      {record !== undefined && p.checked !== "compact" && (
        <>
          <h3>Findings</h3>
          {record.findings.length === 0 ? (
            <p className="muted small">None.</p>
          ) : (
            <ul className="findings">
              {record.findings.map((f) => (
                <li key={f.id}>
                  <span className={`tag sev-${f.severity}`}>{f.severity}</span> <span className="mono small">{f.id}</span> {f.text}
                  {f.resolution !== undefined && <p className="muted small">Resolution: {f.resolution}</p>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {p.checked === "criteria" && (
        <>
          <h3>Per criterion</h3>
          {view.criterion_results === undefined ? (
            <p className="muted small">
              {view.preparation_enrolled ? "No admitted criterion results yet." : "This package has no per criterion results; the pre-check covers its criteria as a whole."}
            </p>
          ) : (
            <>
              {view.criterion_results_integrity === "changed" && <p className="error small">The evidence behind these results changed since the checker reported them; they do not count.</p>}
              <ul className="criterion-results">
                {view.criterion_results.results.map((r) => (
                  <li key={r.criterion_id}>
                    <span className={`tag outcome-${r.outcome === "pass" ? "pass" : r.outcome === "fail" ? "fail" : "inconclusive"}`}>{r.outcome}</span>{" "}
                    <span className="mono small">{r.criterion_id}</span>{" "}
                    {prep.data?.snapshot.criteria.find((c) => c.id === r.criterion_id)?.statement ?? ""}
                    <span className="muted small">
                      {" "}
                      ({r.check_results.map((c) => `${c.check_id} ${c.outcome}`).join(", ") || "no checks"})
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <h3>Custody</h3>
          <p className="small">
            Decisive evidence must come from the {pkg.verification.required_custody.decisive_evidence_generated_by};{" "}
            {pkg.verification.required_custody.preparer_may_present ? "the preparer may present it." : "the preparer may not present it."}
          </p>
        </>
      )}
    </>
  );
}

/** The pre-check is required by the kernel in every tier, so it is shown in every tier. */
function PreCheckFloor({ record, compact }: { record: VerificationRecord | undefined; compact: boolean }) {
  if (record === undefined)
    return (
      <p>
        <strong>Pre-check: not done yet.</strong> <span className="muted small">Required before acceptance in every tier.</span>
      </p>
    );
  const shared = record.independence?.runtime === "shared";
  return (
    <>
      <p>
        <span className={`tag outcome-${record.outcome}`}>{record.outcome}</span> <strong>Pre-check</strong>{" "}
        <span className="muted small">
          by {record.verifier} · {record.method}
          {compact && ` · ${record.findings.length} finding${record.findings.length === 1 ? "" : "s"}`}
        </span>
      </p>
      {shared && (
        <p className="error small">
          The pre-check ran on the same runtime as the author, so it is not independent on that axis.
          {record.independence?.owner_override !== undefined &&
            ` Owner override by ${record.independence.owner_override.by}: ${record.independence.owner_override.reason}`}
        </p>
      )}
    </>
  );
}

function Open({ view, actions, actionsFailed }: { view: PackageView; actions: ActionDescriptor[] | undefined; actionsFailed: boolean }) {
  const items: string[] = [];
  for (const f of view.pre_check?.findings ?? []) if (f.resolution === undefined && f.severity !== "info") items.push(`Finding ${f.id} (${f.severity}) is unresolved: ${f.text}`);
  if (view.deliverable_integrity === "changed") items.push("The deliverable changed after it was checked; the check no longer covers it.");
  if (view.criterion_results_integrity === "changed") items.push("The evidence behind the criterion results changed; those results do not count.");
  for (const a of view.package.assumptions ?? []) if (a.requires_confirmation) items.push(`Assumption ${a.id} still needs confirmation: ${a.statement}`);
  for (const r of view.runs) if (r.outcome_unknown !== undefined && r.reconciliation === undefined) items.push(`The ${ROLE_WORDS[r.role]?.toLowerCase() ?? r.role} run of round ${r.round} has an unknown outcome.`);
  const floors = (actions ?? []).filter((a) => !a.allowed && a.floor);
  return (
    <>
      {items.length === 0 && floors.length === 0 ? (
        <p className="muted">Nothing open.</p>
      ) : (
        <ul className="open-items">
          {items.map((t) => (
            <li key={t}>{t}</li>
          ))}
          {floors.map((a) => (
            <li key={a.command}>
              <strong>Floor</strong> on {a.label.toLowerCase()}: {a.reason}
            </li>
          ))}
        </ul>
      )}
      {actionsFailed && <p className="muted small">Floors could not be checked just now; the decision bar says what is open to you.</p>}
    </>
  );
}

/** Always on screen: what a signature here would bind and whether one is open to you. */
function SignStrip({ view, actions, loading, failed }: { view: PackageView; actions: ActionDescriptor[] | undefined; loading: boolean; failed: boolean }) {
  // The same words as the decision bar's buttons.
  const role = view.package.agent_assignment[0]?.role;
  const decisions = (actions ?? []).filter((a) => ["release", "accept", "accept-with-findings", "return", "reject"].includes(a.command));
  const allowed = decisions.filter((a) => a.allowed);
  const first = decisions.find((a) => !a.allowed);
  return (
    <div className="sign-strip" role="region" aria-label="Decision">
      <span className="mono small">{shortDigest(view.subject_digest)}</span>
      <span className="small">
        {loading
          ? "Checking what you may sign"
          : failed
            ? "What you may sign could not be checked"
            : allowed.length > 0
              ? `You may ${allowed.map((a) => decisionLabel(a.command as DecisionKind, role).toLowerCase()).join(", ")}`
              : (first?.reason ?? "No decision is open on this revision")}
      </span>
      <a href="#sign" className="btn primary small">
        Go to Sign
      </a>
    </div>
  );
}

