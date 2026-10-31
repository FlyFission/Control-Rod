import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api } from "../api/client.js";
import type { PackageView, VerificationRecord, WorkPackage } from "../api/types.js";
import { CriterionCoverage } from "../components/preparation/CriterionCoverage.js";
import { PreparationPanel } from "../components/preparation/PreparationPanel.js";
import { DecisionBar } from "../components/DecisionBar.js";
import { OutputItem } from "../components/OutputPreview.js";
import { RunCard } from "../components/RunLog.js";
import { STATUS_LABEL, independenceText, shortDigest, time } from "../lib/format.js";
import { DECISION_LABEL } from "../lib/decide.js";

const RUNGS: WorkPackage["status"][] = ["draft", "released", "in-work", "in-verification", "accepted"];

export function PackagePage({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["package", id], queryFn: () => api.packageView(id) });

  useEffect(() => {
    if (q.data !== undefined && window.location.hash === "#decide") {
      document.getElementById("decide")?.scrollIntoView({ block: "start" });
    }
  }, [q.data]);

  if (q.isLoading) return <p className="muted">Loading</p>;
  if (q.isError || q.data === undefined) {
    return (
      <p role="alert" className="error">
        Could not load package {id}.
      </p>
    );
  }
  const view = q.data;
  const pkg = view.package;
  return (
    <div className="package">
      <header className="panel pkg-head">
        <p className="mono small muted">
          {pkg.id} · rev {pkg.revision} · {pkg.project}
        </p>
        <h1>{pkg.title}</h1>
        <div className="pkg-tags">
          <span className="tag">{pkg.mode}</span>
          <span className="tag">{pkg.rigor_mode}</span>
          <span className="tag">{pkg.data_lane}</span>
          {pkg.discipline !== undefined && <span className="tag">{pkg.discipline}</span>}
        </div>
        <ol className="rungs" aria-label="Status">
          {RUNGS.map((r) => (
            <li key={r} className={r === pkg.status ? "rung current" : RUNGS.indexOf(r) < RUNGS.indexOf(pkg.status) ? "rung past" : "rung"} aria-current={r === pkg.status ? "step" : undefined}>
              {STATUS_LABEL[r]}
            </li>
          ))}
          {pkg.status === "closed" && <li className="rung current">Closed</li>}
        </ol>
      </header>

      <div className="pkg-grid">
        <div className="pkg-col">
          <section className="panel" aria-labelledby="obj-title">
            <h2 id="obj-title">Objective</h2>
            <p>{pkg.objective}</p>
            <h3>Deliverables</h3>
            <ul>
              {pkg.deliverables.map((d) => (
                <li key={d.id}>
                  <span className="mono small">{d.id}</span> {d.type}
                  {d.format !== undefined && d.format.length > 0 && <span className="muted small"> ({d.format.join(", ")})</span>}
                </li>
              ))}
            </ul>
            {(pkg.assumptions ?? []).length > 0 && (
              <>
                <h3>Assumptions</h3>
                <ul>
                  {(pkg.assumptions ?? []).map((a) => (
                    <li key={a.id}>
                      <span className="mono small">{a.id}</span> {a.statement}
                      {a.requires_confirmation && <span className="tag small-tag">confirm</span>}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
          <PreparationPanel pkg={pkg} enabled={view.preparation_enabled ?? false} enrolled={view.preparation_enrolled ?? false} />
          <Criteria pkg={pkg} etag={view.draft_etag} enrolled={view.preparation_enrolled ?? false} />
          <section className="panel" aria-labelledby="runs-title">
            <h2 id="runs-title">Runs</h2>
            {view.runs.length === 0 && <p className="muted">No runs yet.</p>}
            {view.runs.map((r) => (
              <RunCard key={r.id} packageId={pkg.id} run={r} />
            ))}
          </section>
        </div>
        <div className="pkg-col">
          <DecisionBar view={view} />
          <section className="panel" aria-labelledby="out-title">
            <h2 id="out-title">Outputs</h2>
            {view.outputs.length === 0 && <p className="muted">No outputs yet.</p>}
            <ul className="outputs">
              {view.outputs.map((a) => (
                <OutputItem key={a.path} packageId={pkg.id} artifact={a} />
              ))}
            </ul>
          </section>
          <PreCheck record={view.pre_check} />
          <CriterionCoverage view={view} />
          <Decisions view={view} />
        </div>
      </div>
    </div>
  );
}

/**
 * Acceptance criteria. Editable while the package is a draft; fixed once released. Editing works on
 * the draft as it was when editing began: background refreshes never replace what is being typed, and
 * a save that finds the draft changed says so and keeps the text, instead of losing it.
 */
export function Criteria({ pkg, etag, enrolled }: { pkg: WorkPackage; etag?: string | undefined; enrolled:boolean }) {
  const qc = useQueryClient();
  const editable = pkg.status === "draft" && !enrolled && etag !== undefined;
  const [text, setText] = useState(pkg.acceptance_criteria.join("\n"));
  const [editing, setEditing] = useState(false);
  const [base, setBase] = useState<{ pkg: WorkPackage; etag: string } | null>(null);
  useEffect(() => {
    if (!editing) setText(pkg.acceptance_criteria.join("\n"));
  }, [pkg.acceptance_criteria, editing]);
  const startEditing = () => {
    setBase({ pkg, etag: etag! });
    setText(pkg.acceptance_criteria.join("\n"));
    setEditing(true);
  };
  const loadLatest = () => {
    setBase({ pkg, etag: etag! });
    setText(pkg.acceptance_criteria.join("\n"));
    save.reset();
  };
  const save = useMutation({
    mutationFn: (criteria: string[]) => api.updatePackage({ ...base!.pkg, acceptance_criteria: criteria }, base!.etag),
    onSuccess: ({ data, etag: saved }) => {
      // The save answers with the draft as stored and its new tag; the page shows them at once, so a
      // later edit never starts from the old tag, even if the background refresh fails.
      qc.setQueryData<PackageView>(["package", pkg.id], (old) =>
        old ? { ...old, package: data, ...(saved ? { draft_etag: saved } : {}) } : old);
      setEditing(false);
      setBase(null);
      void qc.invalidateQueries({ queryKey: ["package", pkg.id] });
    },
  });
  const stale = save.error instanceof ApiError && save.error.code === "stale";
  const criteria = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return (
    <section className="panel" aria-labelledby="crit-title">
      <div className="panel-head">
        <h2 id="crit-title">Acceptance criteria</h2>
        {editable && !editing && (
          <button type="button" className="btn ghost small" onClick={startEditing}>
            Edit
          </button>
        )}
      </div>
      {editing ? (
        <>
          <label className="field">
            <span>One criterion per line</span>
            <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <div className="decide-buttons">
            <button
              type="button"
              className="btn primary small"
              disabled={criteria.length === 0 || save.isPending}
              onClick={() => save.mutate(criteria)}
            >
              Save
            </button>
            <button type="button" className="btn ghost small" onClick={() => { setEditing(false); setBase(null); save.reset(); }}>
              Cancel
            </button>
          </div>
          {stale ? (
            <div role="alert" className="error">
              <p>These criteria changed since you started editing. Your text is still here.</p>
              <button type="button" className="btn ghost small" onClick={loadLatest}>
                Load the latest criteria
              </button>
            </div>
          ) : save.isError && (
            <p role="alert" className="error">
              {save.error instanceof Error ? save.error.message : "Could not save."}
            </p>
          )}
        </>
      ) : (
        <ol className="criteria">
          {pkg.acceptance_criteria.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ol>
      )}
      {!editable && <p className="muted small">{enrolled && pkg.status === "draft" ? "Edit these criteria in guided preparation." : "Fixed at release. Return the package to change them."}</p>}
    </section>
  );
}

function PreCheck({ record }: { record: VerificationRecord | undefined }) {
  return (
    <section className="panel" aria-labelledby="pc-title">
      <h2 id="pc-title">Pre-check</h2>
      {record === undefined ? (
        <p className="muted">Not done yet. An agent with a fresh context checks the output against the criteria.</p>
      ) : (
        <>
          <p>
            <span className={`tag outcome-${record.outcome}`}>{record.outcome}</span>{" "}
            <span className="muted small">
              by {record.verifier} · {record.method}
            </span>
          </p>
          {independenceText(record) !== null && (
            <p className={record.independence?.runtime === "shared" ? "error small" : "muted small"}>{independenceText(record)}</p>
          )}
          {record.findings.length === 0 ? (
            <p className="muted">No findings.</p>
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
    </section>
  );
}

function Decisions({ view }: { view: PackageView }) {
  return (
    <section className="panel" aria-labelledby="dec-title">
      <h2 id="dec-title">Decisions</h2>
      {view.decisions.length === 0 ? (
        <p className="muted">None yet.</p>
      ) : (
        <ul className="decisions">
          {view.decisions.map((d) => (
            <li key={d.id}>
              <strong>{DECISION_LABEL[d.kind]}</strong> rev {d.package_revision} by {d.actor.id}{" "}
              <span className="muted small">{time(d.decided_at)}</span>
              <span className="mono small muted"> {shortDigest(d.subject_digest)}</span>
              {d.reason !== undefined && <p className="small">{d.reason}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
