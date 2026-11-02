import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client.js";
import { StateMark } from "../components/StateMark.js";
import { shortDigest, time } from "../lib/format.js";

/**
 * Roster (specification 12 and 21): the runtimes the daemon found, the exact artifact each one is,
 * and the version pinned for each role. Pinning and rolling back are signed commands, reached from
 * the command palette or Policies.
 */
export function Roster() {
  const q = useQuery({ queryKey: ["runtimes"], queryFn: api.runtimes });
  const runtimes = q.data?.runtimes ?? [];
  const pins = q.data?.pins ?? [];
  // Absence is only stated once the control plane has answered; before that, or after a failure,
  // the page says it does not know.
  const known = q.isSuccess;
  return (
    <div className="place">
      <header className="place-head">
        <h1>Roster</h1>
        <p className="muted">
          Which agent runtimes this machine can run, and which version each role must launch. A run launches only the exact file its pin (or,
          unpinned, the last check) names.
        </p>
      </header>
      <section className="panel" aria-labelledby="runtimes-title">
        <div className="panel-head">
          <h2 id="runtimes-title">Runtimes</h2>
          {q.data?.reported_at !== undefined && <span className="muted small">Reported by the daemon {time(q.data.reported_at)}</span>}
        </div>
        {q.isLoading && <p className="muted">Loading</p>}
        {q.isError && (
          <div role="alert" className="error">
            <p>{q.data === undefined ? "The runtimes could not be loaded." : "The runtimes could not be refreshed; what follows may be out of date."}</p>
            <button type="button" className="btn small" onClick={() => void q.refetch()}>
              Try again
            </button>
          </div>
        )}
        {known && runtimes.length === 0 && (
          <p className="muted">No daemon has reported yet. Start Control Rod with pnpm cr start and the daemon checks each runtime it finds.</p>
        )}
        {runtimes.length > 0 && (
          <div className="table-wrap">
            <table className="records">
              <thead>
                <tr>
                  <th scope="col">Runtime</th>
                  <th scope="col">State</th>
                  <th scope="col">Version</th>
                  <th scope="col">Artifact</th>
                </tr>
              </thead>
              <tbody>
                {runtimes.map((r) => (
                  <tr key={r.runtime}>
                    <td className="mono">{r.runtime}</td>
                    <td>
                      <span className="state-cell">
                        <StateMark kind={r.ready ? "done" : "stuck"} />
                        {r.ready ? "Ready" : "Not ready"}
                      </span>
                      {!r.ready && r.reason !== undefined && <p className="small muted">{r.reason}</p>}
                    </td>
                    <td className="mono small">{r.version ?? "unknown"}</td>
                    <td className="small">
                      {r.artifact !== undefined ? (
                        <>
                          <span className="mono">{shortDigest(r.artifact.digest)}</span>
                          <p className="muted small mono wrap">{r.artifact.path}</p>
                        </>
                      ) : (
                        <span className="muted">not identified</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="panel" aria-labelledby="pins-title">
        <h2 id="pins-title">Pins</h2>
        {q.data === undefined ? (
          <p className="muted">{q.isLoading ? "Loading" : "Pins are unknown until the runtimes load."}</p>
        ) : pins.length === 0 ? (
          <p className="muted">Nothing is pinned. Unpinned runtimes launch the artifact the daemon last checked.</p>
        ) : (
          <div className="table-wrap">
            <table className="records">
              <thead>
                <tr>
                  <th scope="col">Runtime</th>
                  <th scope="col">Role</th>
                  <th scope="col">Pinned artifact</th>
                </tr>
              </thead>
              <tbody>
                {pins.map((p) => {
                  const installed = runtimes.find((r) => r.runtime === p.runtime)?.artifact?.digest.value;
                  const differs = installed !== undefined && installed !== p.artifact_digest.value;
                  return (
                    <tr key={p.id}>
                      <td className="mono">{p.runtime}</td>
                      <td>{p.role}</td>
                      <td>
                        <span className="mono">{shortDigest(p.artifact_digest)}</span>
                        {differs && (
                          <p className="small error">
                            The installed {p.runtime} is a different version, so {p.role} work waits until the pin or the install changes.
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
