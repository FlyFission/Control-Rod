import type { PackageView } from "../api/types.js";
import { shortDigest, time } from "../lib/format.js";

type Attempt = NonNullable<PackageView["checker_attempts"]>[number];
type Override = NonNullable<PackageView["recheck_overrides"]>[number];

/** The checker attempt log and, when a fail is sticky, the reason another check is refused. */
export function CheckerHistory({
  blocked,
  warning,
  attempts,
  overrides,
}: {
  blocked: PackageView["check_blocked"];
  warning?: PackageView["check_warning"];
  attempts: PackageView["checker_attempts"];
  overrides: PackageView["recheck_overrides"];
}) {
  const list = attempts ?? [];
  const signed = overrides ?? [];
  if (!blocked && !warning && list.length === 0 && signed.length === 0) return null;
  return (
    <div className="checker-history">
      {blocked && (
        <div role="status">
          <p className="error">{blocked.reason}</p>
          <p className="muted small">{blocked.change}</p>
        </div>
      )}
      {warning && (
        <div role="status">
          <p>{warning.reason}</p>
        </div>
      )}
      {list.length > 0 && (
        <>
          <h3>Checker attempts</h3>
          <ol className="plain-list" aria-label="Checker attempts">
            {list.map((attempt) => (
              <AttemptLine key={attempt.id} attempt={attempt} />
            ))}
          </ol>
        </>
      )}
      {signed.length > 0 && (
        <>
          <h3>Recheck overrides</h3>
          <ul className="plain-list" aria-label="Recheck overrides">
            {signed.map((row) => (
              <li key={row.id}>
                <span className="small">
                  {row.override.by} · {time(row.override.at)} · digest {shortDigest(row.deliverable_digest)}
                </span>
                <p className="small">{row.override.reason}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function AttemptLine({ attempt }: { attempt: Attempt }) {
  const tone = attempt.counts_as === "pass" || attempt.counts_as === "fail" ? attempt.counts_as : "inconclusive";
  return (
    <li>
      <span className={`tag outcome-${tone}`}>{attempt.outcome}</span>{" "}
      <span className="muted small">counts as {attempt.counts_as}</span>
      <p className="small">
        {attempt.checker_runtime}
        {attempt.reported_model ? ` · model ${attempt.reported_model}` : " · model not reported"}
        {" · "}round {attempt.round}
        {" · "}
        {time(attempt.started_at)} to {time(attempt.finished_at)}
        {" · digest "}
        <span className="mono">{attempt.digest_unknown ? "unknown" : shortDigest(attempt.deliverable_digest)}</span>
      </p>
      <p className="muted small">
        Evidence <a href={attempt.evidence}>{attempt.evidence}</a>
        {attempt.recheck_override && ` · override by ${attempt.recheck_override.by}: ${attempt.recheck_override.reason}`}
      </p>
    </li>
  );
}
