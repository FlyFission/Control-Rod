import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { api } from "../api/client.js";
import type { AdminView } from "../api/types.js";
import { time } from "../lib/format.js";
import { type Passkeys, browserPasskeys } from "../lib/decide.js";
import { BootstrapForm, BudgetsSection, DelegationsSection, MembersSection, PolicySection, ProjectsSection, QualificationsSection } from "../features/admin/AdminSections.js";

/**
 * Policies and Administration (specification 12): the floors in force, the policy settings, the
 * members and projects, and every administrative command with whether the viewer may take it and
 * why not, as a form that states what it changes before it is signed (plan task 5.4).
 */
export function Policies({ passkeys = browserPasskeys }: { passkeys?: Passkeys } = {}) {
  const q = useQuery({ queryKey: ["admin"], queryFn: api.admin });
  const hash = useRouterState({ select: (st) => st.location.hash });
  useEffect(() => {
    // The palette lands here on a command's own entry, also when only the hash changes.
    const el = q.data !== undefined && hash ? document.getElementById(decodeURIComponent(hash)) : null;
    el?.scrollIntoView({ block: "center" });
    el?.focus({ preventScroll: true });
  }, [q.data, hash]);
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
        <p className="muted">What is in force for this organization, who may change it, and the signed commands that change it.</p>
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
          <>
            <p className="muted">
              {a.bootstrap
                ? "No administrator exists yet. As the first member you may issue your own qualification."
                : "You hold no qualification, so you can capture and view work but not sign decisions or administer."}
            </p>
            {a.bootstrap && <BootstrapForm view={a} passkeys={passkeys} />}
          </>
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
      <MembersSection view={a} passkeys={passkeys} />
      <QualificationsSection view={a} passkeys={passkeys} />
      <DelegationsSection view={a} passkeys={passkeys} />
      <ProjectsSection view={a} passkeys={passkeys} />
      <PolicySection view={a} passkeys={passkeys} />
      <BudgetsSection view={a} passkeys={passkeys} />
      <Commands view={a} />
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
