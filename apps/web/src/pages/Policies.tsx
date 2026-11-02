import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { AdminView } from "../api/types.js";
import { time } from "../lib/format.js";

/**
 * Policies and Administration (specification 12): the floors in force, the policy settings, the
 * members and projects, and every administrative command with whether the viewer may take it and
 * why not. The forms that carry out each command arrive with Roster, Usage, Records and Policies
 * (plan Phase 5); every command already runs through the signed administrative API.
 */
export function Policies() {
  const q = useQuery({ queryKey: ["admin"], queryFn: api.admin });
  useEffect(() => {
    // The palette lands here on a command's own entry.
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (q.data !== undefined && id) document.getElementById(id)?.scrollIntoView({ block: "center" });
  }, [q.data]);
  if (q.isLoading) return <p className="muted">Loading</p>;
  if (q.isError || q.data === undefined) {
    return (
      <p role="alert" className="error">
        Administration could not be loaded.
      </p>
    );
  }
  const a = q.data;
  return (
    <div className="place">
      <header className="place-head">
        <h1>Policies</h1>
        <p className="muted">What is in force for this organization and who may change it.</p>
      </header>
      <Floors view={a} />
      <section className="panel" aria-labelledby="policy-title">
        <h2 id="policy-title">Policy in force</h2>
        {a.policy === null ? (
          <p className="muted">No policy set has been approved yet; the floors above apply regardless.</p>
        ) : (
          <>
            <p className="small muted">
              Version {a.policy.version}, in force since {time(a.policy.effective_at)}. {a.policy.reason}
            </p>
            <dl className="metrics">
              {Object.entries(a.policy.settings).map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd className="mono">{v}</dd>
                </div>
              ))}
              <div>
                <dt>Hardware attestation accepted</dt>
                <dd className="mono">{a.policy.hardware_attestation_formats.join(", ") || "none"}</dd>
              </div>
            </dl>
          </>
        )}
      </section>
      <section className="panel" aria-labelledby="you-title">
        <h2 id="you-title">Your qualification</h2>
        {a.qualification === null || a.qualification.revoked ? (
          <p className="muted">
            {a.bootstrap
              ? "No administrator exists yet. As the first member you may issue your own qualification."
              : "You hold no qualification, so you can capture and view work but not sign decisions or administer."}
          </p>
        ) : (
          <dl className="metrics">
            <div>
              <dt>Roles</dt>
              <dd>{a.qualification.roles.join(", ") || "none"}</dd>
            </div>
            <div>
              <dt>Authorities</dt>
              <dd>{a.qualification.authorities.join(", ") || "none"}</dd>
            </div>
            <div>
              <dt>Disciplines</dt>
              <dd>{a.qualification.disciplines.join(", ") || "none"}</dd>
            </div>
            <div>
              <dt>Grades</dt>
              <dd>{a.qualification.grades.join(", ") || "none"}</dd>
            </div>
          </dl>
        )}
      </section>
      <Commands view={a} />
      <section className="panel" aria-labelledby="members-title">
        <h2 id="members-title">Members</h2>
        <ul className="plain-list">
          {a.members.map((m) => (
            <li key={m.id}>
              {m.display_name} <span className="mono small muted">{m.user_name}</span>
              {m.status !== "active" && <span className="tag small-tag">{m.status}</span>}
            </li>
          ))}
        </ul>
      </section>
      <section className="panel" aria-labelledby="projects-title">
        <h2 id="projects-title">Projects</h2>
        {a.projects.length === 0 ? (
          <p className="muted">No projects yet.</p>
        ) : (
          <ul className="plain-list">
            {a.projects.map((p) => (
              <li key={p.id}>
                {p.name} <span className="small muted">
                  {p.mode} · {p.default_rigor} · autonomy {p.autonomy_level} · lanes {p.lanes.join(", ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Floors({ view }: { view: AdminView }) {
  return (
    <section className="panel" aria-labelledby="floors-title">
      <h2 id="floors-title">Floors</h2>
      <p className="muted small">No person, decision or setting lifts these.</p>
      <ul className="floors">
        {view.floors.map((f) => (
          <li key={f.code}>
            <p>{f.sentence}</p>
            <p className="muted small">{f.change}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Commands({ view }: { view: AdminView }) {
  const need = new Map(view.commands.map((c) => [c.name, c.need]));
  return (
    <section className="panel" aria-labelledby="commands-title">
      <h2 id="commands-title">Administrative commands</h2>
      <p className="muted small">Each is recorded on the event chain; those marked passkey are signed over exactly what they change.</p>
      <ul className="command-list">
        {view.actions.map((d) => (
          <li key={d.command} id={`command-${d.command}`} className={d.allowed ? "command allowed" : "command refused"} tabIndex={-1}>
            <div className="command-head">
              <strong>{d.label}</strong>
              <span className="mono small muted">{d.command}</span>
              {d.signature === "direct" && <span className="tag">passkey</span>}
              <span className={d.allowed ? "small ok" : "small error"}>{d.allowed ? "You may" : "Not available to you"}</span>
            </div>
            <p className="small muted">Needs: {needText(need.get(d.command))}</p>
            {!d.allowed && (
              <p className="small">
                {d.reason} {d.change !== undefined && <span className="muted">{d.change}</span>}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

const needText = (need: string | undefined) =>
  need === undefined || need === "member" ? "any active member" : need.split("+").map((a) => `${a} authority`).join(" and ");
