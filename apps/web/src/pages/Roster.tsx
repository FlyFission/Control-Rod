import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { RosterView } from "../api/types.js";
import { StateMark } from "../components/StateMark.js";
import { type Passkeys, browserPasskeys, signAdmin } from "../lib/decide.js";
import { shortDigest, time } from "../lib/format.js";

/**
 * Roster (specification 12 and 21; plan task 5.1): the runtimes the daemon found and the exact
 * artifact each one is; each role, the baselines and runtimes that have run it and its pins; the
 * versions a pin may name, with pinning and rollback as signed commands; and the sandbox each runtime
 * launches with, stated as recorded and never as more than it is.
 */
export function Roster({ passkeys = browserPasskeys }: { passkeys?: Passkeys } = {}) {
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
      <RosterDetail passkeys={passkeys} />
    </div>
  );
}

const ROLE_NAMES: Record<string, string> = {
  intake: "Intake",
  "requirements-preparer": "Requirements preparer",
  "technical-preparer": "Technical preparer",
  author: "Author",
  "pre-check": "Pre-check",
};

function RosterDetail({ passkeys }: { passkeys: Passkeys }) {
  const q = useQuery({ queryKey: ["roster"], queryFn: api.roster });
  const admin = useQuery({ queryKey: ["admin"], queryFn: api.admin });
  const may = (command: string) => admin.data?.actions.find((a) => a.command === command);
  if (q.isError)
    return (
      <div role="alert" className="error panel">
        <p>The roster could not be loaded.</p>
        <button type="button" className="btn small" onClick={() => void q.refetch()}>
          Try again
        </button>
      </div>
    );
  if (!q.data) return <p className="muted">Loading the roster</p>;
  return (
    <>
      <Roles view={q.data} rollback={may("runtime.rollback")} passkeys={passkeys} />
      <Versions view={q.data} pin={may("runtime.pin")} passkeys={passkeys} />
      <Baselines view={q.data} />
      <Sandbox view={q.data} />
    </>
  );
}

type Allowed = { allowed: boolean; reason?: string } | undefined;

/** A signed runtime command, with what it changes stated beside it and any refusal shown as given. */
function useRuntimeCommand(name: "runtime.pin" | "runtime.rollback", passkeys: Passkeys) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => signAdmin(name, payload, passkeys),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["roster"] });
      void qc.invalidateQueries({ queryKey: ["runtimes"] });
    },
  });
}

function Roles({ view, rollback, passkeys }: { view: RosterView; rollback: Allowed; passkeys: Passkeys }) {
  const command = useRuntimeCommand("runtime.rollback", passkeys);
  return (
    <section className="panel" aria-labelledby="roles-title">
      <h2 id="roles-title">Roles</h2>
      <div className="table-wrap">
        <table className="records">
          <thead>
            <tr>
              <th scope="col">Role</th>
              <th scope="col">Ran as</th>
              <th scope="col">Pinned</th>
              <th scope="col">Runs</th>
            </tr>
          </thead>
          <tbody>
            {view.roles.map((r) => (
              <tr key={r.role}>
                <td>
                  <strong>{ROLE_NAMES[r.role] ?? r.role}</strong>
                  <p className="small muted">{r.what}</p>
                </td>
                <td className="small">
                  {r.baselines.length === 0 ? (
                    <span className="muted">Nothing has run it yet</span>
                  ) : (
                    r.baselines.map((b) => (
                      <p key={`${b.runtime}-${b.baseline}`} className="mono">
                        {b.baseline} <span className="muted">on {b.runtime}</span>
                      </p>
                    ))
                  )}
                </td>
                <td className="small">
                  {!r.pinnable ? (
                    <span className="muted">Not pinnable: launched by its own custody path</span>
                  ) : r.pins.length === 0 ? (
                    <span className="muted">Unpinned: launches what the daemon last checked</span>
                  ) : (
                    r.pins.map((p) => {
                      const back = r.rollback.find((b) => b.runtime === p.runtime);
                      return (
                        <div key={p.id}>
                          <span className="mono">
                            {p.runtime} {shortDigest(p.artifact_digest)}
                          </span>
                          {back !== undefined && (
                            <>
                              {/* The signature covers both artifacts shown here; a change in between refuses it. */}
                              <p className="muted">
                                A rollback restores <span className="mono">{shortDigest(back.restore)}</span> in place of{" "}
                                <span className="mono">{shortDigest(back.current)}</span>.
                              </p>
                              <button
                                type="button"
                                className="btn small"
                                disabled={!rollback?.allowed || command.isPending}
                                title={rollback?.allowed ? undefined : rollback?.reason}
                                onClick={() => command.mutate({ runtime: p.runtime, roles: [{ role: r.role, current: back.current.value, restore: back.restore.value }] })}
                              >
                                Sign and roll back {p.runtime} for {(ROLE_NAMES[r.role] ?? r.role).toLowerCase()}
                              </button>
                            </>
                          )}
                        </div>
                      );
                    })
                  )}
                </td>
                <td className="small">
                  {r.runs}
                  {r.last_run_at !== undefined && <p className="muted">last {time(r.last_run_at)}</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">A rollback restores the artifact pinned before the current one, signed with your passkey over both.</p>
      {command.error && (
        <p className="error" role="alert">
          {command.error.message}
        </p>
      )}
    </section>
  );
}

function Versions({ view, pin, passkeys }: { view: RosterView; pin: Allowed; passkeys: Passkeys }) {
  const command = useRuntimeCommand("runtime.pin", passkeys);
  const [role, setRole] = useState<Record<string, string>>({});
  return (
    <section className="panel" aria-labelledby="versions-title">
      <h2 id="versions-title">Versions a pin may name</h2>
      <p className="muted small">Only an artifact a passing check has seen can be pinned, so a broken update never replaces a working pin.</p>
      {view.versions.length === 0 ? (
        <p className="muted">No runtime has passed a check yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="records">
            <thead>
              <tr>
                <th scope="col">Runtime</th>
                <th scope="col">Version</th>
                <th scope="col">Artifact</th>
                <th scope="col">Pinned for</th>
                <th scope="col">Pin</th>
              </tr>
            </thead>
            <tbody>
              {view.versions.map((v) => {
                const key = `${v.runtime}:${v.digest.value}`;
                const chosen = role[key] ?? "all";
                const roles = chosen === "all" ? "Intake, author and pre-check" : (ROLE_NAMES[chosen] ?? chosen);
                return (
                  <tr key={key}>
                    <td className="mono">{v.runtime}</td>
                    <td className="mono small">{v.version || "unknown"}</td>
                    <td className="small">
                      <span className="mono">{shortDigest(v.digest)}</span>
                      <p className="muted">passed {time(v.last_passed_at)}</p>
                    </td>
                    <td className="small">{v.pinned_for.length ? v.pinned_for.map((r) => ROLE_NAMES[r] ?? r).join(", ") : <span className="muted">none</span>}</td>
                    <td className="small">
                      <label className="field">
                        <span>Roles</span>
                        <select value={chosen} onChange={(e) => setRole({ ...role, [key]: e.target.value })}>
                          <option value="all">Every pinnable role</option>
                          <option value="intake">Intake</option>
                          <option value="author">Author</option>
                          <option value="pre-check">Pre-check</option>
                        </select>
                      </label>
                      <p className="muted">
                        {roles} runs on {v.runtime} must then launch exactly this file, and wait while the installed {v.runtime} is a different one. Runs on
                        other runtimes are unaffected.
                      </p>
                      <button
                        type="button"
                        className="btn small"
                        disabled={!pin?.allowed || command.isPending}
                        title={pin?.allowed ? undefined : pin?.reason}
                        onClick={() => command.mutate({ runtime: v.runtime, artifact_digest: v.digest.value, ...(chosen === "all" ? {} : { role: chosen }) })}
                      >
                        Sign and pin {v.runtime} {v.version}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {pin !== undefined && !pin.allowed && <p className="small muted">{pin.reason}</p>}
      {command.error && (
        <p className="error" role="alert">
          {command.error.message}
        </p>
      )}
    </section>
  );
}

function Baselines({ view }: { view: RosterView }) {
  return (
    <section className="panel" aria-labelledby="baselines-title">
      <h2 id="baselines-title">Baselines</h2>
      {/* Stated plainly: the names are what the dispatcher assigns, not approved items with revisions. */}
      <p className="muted small">
        As recorded on runs. A baseline here is the name the dispatcher gives a role on a runtime; baselines are not yet controlled items with their own approved
        revisions.
      </p>
      {view.baselines.length === 0 ? (
        <p className="muted">No run has recorded a baseline yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="records">
            <thead>
              <tr>
                <th scope="col">Baseline</th>
                <th scope="col">Roles</th>
                <th scope="col">Runs</th>
                <th scope="col">Last run</th>
              </tr>
            </thead>
            <tbody>
              {view.baselines.map((b) => (
                <tr key={b.id}>
                  <td className="mono">{b.id}</td>
                  <td className="small">{b.roles.map((r) => ROLE_NAMES[r] ?? r).join(", ")}</td>
                  <td className="small">
                    {b.runs}
                    <p className="muted">
                      {Object.entries(b.statuses)
                        .sort()
                        .map(([s, n]) => `${n} ${s}`)
                        .join(", ")}
                    </p>
                  </td>
                  <td className="small">{time(b.last_run_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * What the daemon asked for, in words. It is a request, not an observed result, so nothing here says
 * a run was confined.
 */
function sandboxWords(s: string): string {
  if (s === "none") return "None requested: tier none, the interim state; agent actions are not confined";
  if (s === "not reported") return "Not reported by the run, so not known to be confined";
  return `Requested "${s}" from the runtime's own sandbox. Whether that isolation was achieved is not verified, and no Control Rod policy is attested for it yet`;
}

function Sandbox({ view }: { view: RosterView }) {
  const { policies, launched } = view.sandbox;
  return (
    <section className="panel" aria-labelledby="sandbox-title">
      <h2 id="sandbox-title">Sandbox policies</h2>
      {policies.length === 0 ? (
        <p className="small">
          No sandbox policy is recorded yet. Confinement with attested claims arrives with plan Phase 6; until then no run is described as confined by Control Rod.
        </p>
      ) : (
        <ul className="small">
          {policies.map((p) => (
            <li key={String(p["id"])} className="mono">
              {String(p["id"])} version {String(p["version"])} ({String(p["driver"])})
            </li>
          ))}
        </ul>
      )}
      <h3>As launched</h3>
      {launched.length === 0 ? (
        <p className="muted small">No completed run has reported how it launched yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="records">
            <thead>
              <tr>
                <th scope="col">Runtime</th>
                <th scope="col">Sandbox asked for on its latest finished run</th>
                <th scope="col">Run</th>
              </tr>
            </thead>
            <tbody>
              {launched.map((l) => (
                <tr key={l.runtime}>
                  <td className="mono">{l.runtime}</td>
                  <td className="small">{sandboxWords(l.sandbox)}</td>
                  <td className="small">
                    <span className="mono">{l.run_id}</span>
                    <p className="muted">{time(l.at)}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
