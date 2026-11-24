import type { Finding, ScopeDrift } from "../api/types";

/** A finding's evidence, location and fix scope, when the checker gave them. Renders nothing otherwise. */
export function FindingDetail({ finding }: { finding: Finding }) {
  const { evidence, location, scope_paths: scope } = finding;
  if (evidence === undefined && location === undefined && !scope?.length) return null;
  return (
    <span className="finding-detail muted small">
      {location !== undefined && (
        <>
          {" "}
          · At <span className="mono">{location.line !== undefined ? `${location.path}:${location.line}` : location.path}</span>
        </>
      )}
      {evidence !== undefined && <> · Evidence: {evidence}</>}
      {scope !== undefined && scope.length > 0 && (
        <>
          {" "}
          · Fix only{" "}
          {scope.map((p, i) => (
            <span key={p}>
              {i > 0 && ", "}
              <span className="mono">{p}</span>
            </span>
          ))}
        </>
      )}
    </span>
  );
}

/** Files the latest rework round changed outside the scope the previous check named. */
export function ScopeDriftNote({ drift }: { drift: ScopeDrift | undefined }) {
  if (drift === undefined || drift.outside.length === 0) return null;
  return (
    <p className="small" role="status">
      Round {drift.round} also changed files outside the fix scope:{" "}
      {drift.outside.map((p, i) => (
        <span key={p}>
          {i > 0 && ", "}
          <span className="mono">{p}</span>
        </span>
      ))}
      . The checker was told to look at them.
    </p>
  );
}
