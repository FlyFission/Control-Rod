import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client.js";
import type { PackageView } from "../../api/types.js";

export function CriterionCoverage({ view }: { view: PackageView }) {
  const record = view.criterion_results;
  const prep = useQuery({
    queryKey: ["preparation", view.package.id],
    queryFn: () => api.preparation(view.package.id),
    enabled: Boolean(record && view.preparation_enrolled),
  });
  if (!view.preparation_enrolled) return null;
  return (
    <section className="panel" aria-labelledby="criterion-results-title">
      <h2 id="criterion-results-title">Verification by criterion</h2>
      <p className="muted small">
        Reported outcomes and retained evidence. Mapping a check records intent;
        human review is still required.
      </p>
      {view.deliverable_integrity === "changed" && (
        <p role="alert" className="error">
          Author deliverables changed. Acceptance is blocked. Return or reject
          the package for controlled recovery.
        </p>
      )}
      {view.criterion_results_integrity === "changed" && (
        <p role="alert" className="error">
          Retained checker evidence changed. Acceptance is blocked. Return or
          reject the package to preserve a controlled history.
        </p>
      )}
      {!record ? (
        <p>Criterion results have not been recorded.</p>
      ) : (
        <>
          {!view.preparation_verification_complete && (
            <p className="error">
              Mandatory verification is incomplete. Acceptance is blocked.
            </p>
          )}
          <p className="muted small">
            Checker: {view.pre_check?.verifier ?? "recorded verification run"}
          </p>
          {record.results.map((result) => (
            <article className="prep-item" key={result.criterion_id}>
              <h3>
                {result.criterion_id}: {result.outcome}
              </h3>
              <p>
                {
                  prep.data?.snapshot.criteria.find(
                    (c) => c.id === result.criterion_id,
                  )?.statement
                }
              </p>
              <ul>
                {result.check_results.map((check) => (
                  <li key={check.check_id}>
                    <span className="mono small">{check.check_id}</span> ·
                    reported {check.outcome}
                    {prep.data?.snapshot.technical_plan.checks.find(
                      (c) => c.id === check.check_id,
                    )?.required
                      ? " · required"
                      : ""}
                    {check.evidence_refs.length === 0 ? (
                      <p className="muted small">No retained evidence.</p>
                    ) : (
                      <ul>
                        {check.evidence_refs.map((ref) => (
                          <li key={ref}>
                            {view.criterion_results_run_id &&
                            ref.startsWith("checker:") ? (
                              <a
                                href={api.verificationEvidenceUrl(
                                  view.package.id,
                                  view.criterion_results_run_id,
                                  ref.slice(8),
                                )}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {ref.slice(8)}
                              </a>
                            ) : (
                              ref
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
              {result.finding_refs.length > 0 && (
                <p>Findings: {result.finding_refs.join(", ")}</p>
              )}
            </article>
          ))}
        </>
      )}
    </section>
  );
}
