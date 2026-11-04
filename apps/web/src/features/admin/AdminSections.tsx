import type { ActionDescriptor, AdminView } from "../../api/types.js";
import { type Passkeys, browserPasskeys } from "../../lib/decide.js";
import { time } from "../../lib/format.js";
import { type CommandSpec, CommandForm, type Values } from "./CommandForm.js";

/**
 * The Policies and Administration screens (specification 12; plan task 5.4): every administrative
 * command of plan task 1.5 as a form, grouped by what it governs, beside the records it changes.
 * Pinning, SCRAM and sealing live where their work is (Roster, Office, Records); a second
 * organization is refused until the multi-organization phase, so organization creation has no form.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- registry rows are validated JSON */
type Json = any;

const str = (v: Values, k: string) => String(v[k] ?? "").trim();
const list = (v: Values, k: string) => (Array.isArray(v[k]) ? (v[k] as string[]) : []);
const and = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const opts = (xs: readonly string[]) => xs.map((x) => ({ value: x, label: x }));

const ROLES = ["originator", "checker", "approver", "discipline-lead", "engineer-in-responsible-charge"] as const;
const AUTHORITIES = ["administrator", "lane", "policy"] as const;
const GRADES = ["safety", "material", "general-service"] as const;
const LANES = ["public", "internal", "proprietary", "client-confidential", "restricted"] as const;
const MODES = ["general", "software", "capital-projects"] as const;
const RIGOR = ["administrative", "quick", "standard", "high-consequence"] as const;
const PERIODS = [{ value: "P1D", label: "A day" }, { value: "P1W", label: "A week" }, { value: "P1M", label: "A month" }, { value: "P1Y", label: "A year" }];
const PERIOD_WORDS: Record<string, string> = { P1D: "day", P1W: "week", P1M: "month", P1Y: "year" };
/** A positive decimal limit, as the control plane accepts it. */
const LIMIT = /^(?=.*[1-9])[0-9]+(\.[0-9]+)?$/;

interface Props {
  view: AdminView;
  passkeys?: Passkeys;
}

/** Everything one section needs to place its forms. */
function useSection(view: AdminView) {
  const action = (name: string): ActionDescriptor | undefined => view.actions.find((a) => a.command === name);
  const member = (id: string) => view.members.find((m) => m.id === id);
  const memberName = (id: string) => member(id)?.display_name ?? member(id)?.user_name ?? id;
  const members = view.members.map((m) => ({ value: m.id, label: `${m.display_name ?? m.user_name} (${m.status})` }));
  const projects = view.projects.map((p) => ({ value: p.id, label: p.name }));
  return { action, memberName, members, projects, registry: view.registry as Json };
}

export function MembersSection({ view, passkeys = browserPasskeys }: Props) {
  const { action, memberName, members, registry } = useSection(view);
  // Passkeys are an administrator's to see; anyone else sees only their own.
  const seesAll = Boolean(view.qualification && !view.qualification.revoked && view.qualification.authorities.includes("administrator"));
  const reasonField = { key: "reason", label: "Why", kind: "textarea", required: true } as const;
  const memberField = { key: "member_id", label: "Member", kind: "select", options: members, required: true } as const;
  const specs: CommandSpec[] = [
    {
      name: "member.enroll", verb: "enroll", fields: [
        { key: "user_name", label: "User name", kind: "text", required: true, hint: "How they are known to Control Rod; it cannot be changed later." },
        { key: "display_name", label: "Display name", kind: "text" },
      ],
      describe: (v) => `Adds ${str(v, "display_name") || str(v, "user_name")} (user name ${str(v, "user_name")}) as an active Member with no qualification, and creates a one time invitation for them to register a passkey. Anyone holding the link can use it until it expires, so give it only to them.`,
      payload: (v) => ({ user_name: str(v, "user_name"), ...(str(v, "display_name") ? { display_name: str(v, "display_name") } : {}) }),
      done: (r) => (
        <>
          <p>Enrolled {String((r["member"] as { user_name?: string } | undefined)?.user_name ?? "")}.</p>
          <Invitation result={r} />
        </>
      ),
    },
    {
      name: "member.invite", verb: "invite", fields: [memberField],
      describe: (v) => `Creates a one time invitation for ${memberName(str(v, "member_id"))} to register a passkey. Anyone holding the link can use it until it expires, so give it only to them.`,
      payload: (v) => ({ member_id: str(v, "member_id") }),
      done: (r) => <Invitation result={r} />,
    },
    {
      name: "member.suspend", verb: "suspend", fields: [memberField, reasonField],
      describe: (v) => `Suspends ${memberName(str(v, "member_id"))}: their sessions end, any invitation they have not used is used up, and every signature or registration they have not completed is voided. Reactivating restores their membership; if they have no passkey yet, they then need a new invitation.`,
      payload: (v) => ({ member_id: str(v, "member_id"), reason: str(v, "reason") }),
    },
    {
      name: "member.reactivate", verb: "reactivate", fields: [memberField, reasonField],
      describe: (v) => `Reactivates ${memberName(str(v, "member_id"))}: their membership is active again and they can sign in with a passkey they already have. An invitation used up by their suspension stays used; invite them again if they have no passkey.`,
      payload: (v) => ({ member_id: str(v, "member_id"), reason: str(v, "reason") }),
    },
    {
      name: "member.remove", verb: "remove", fields: [memberField, reasonField],
      describe: (v) => `Removes ${memberName(str(v, "member_id"))} for good: their sessions end, any invitation they have not used is used up, every delegation they gave or hold ends, and they cannot sign in again. Their past signatures stay on the record.`,
      payload: (v) => ({ member_id: str(v, "member_id"), reason: str(v, "reason") }),
    },
    {
      name: "credential.revoke", verb: "revoke", fields: [
        { key: "credential_id", label: "Passkey", kind: "select", required: true, options: registry.credentials.filter((c: Json) => !c.revoked).map((c: Json) => ({
          value: c.credential_id, label: `${memberName(c.member_id)}, registered ${time(c.registered_at)}${c.hardware ? ", hardware" : ""}`,
        })) },
        reasonField,
      ],
      describe: (v) => {
        const c = registry.credentials.find((x: Json) => x.credential_id === str(v, "credential_id"));
        return c ? `Revokes ${memberName(c.member_id)}'s passkey registered ${time(c.registered_at)}: it can no longer sign in or sign. Seals and signatures it made before stay checkable.` : null;
      },
      payload: (v) => ({ credential_id: str(v, "credential_id"), reason: str(v, "reason") }),
    },
  ];
  return (
    <section className="panel" aria-labelledby="admin-members-title">
      <h2 id="admin-members-title">Members and passkeys</h2>
      <div className="table-wrap">
        <table className="records">
          <thead>
            <tr>
              <th scope="col">Member</th>
              <th scope="col">Status</th>
              <th scope="col">Passkeys</th>
            </tr>
          </thead>
          <tbody>
            {view.members.map((m) => {
              const keys = registry.credentials.filter((c: Json) => c.member_id === m.id);
              return (
                <tr key={m.id}>
                  <td>
                    {m.display_name ?? m.user_name} <span className="mono small muted">{m.user_name}</span>
                  </td>
                  <td className="small">{m.status}</td>
                  <td className="small">
                    {!seesAll && m.id !== view.me.memberId
                      ? "Not available to you"
                      : keys.length === 0
                      ? "None"
                      : `${keys.filter((k: Json) => !k.revoked).length} usable, ${keys.filter((k: Json) => k.revoked).length} revoked`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="admin-forms">
        {specs.map((s) => (
          <CommandForm key={`${s.title ?? s.name}:${s.resetKey ?? ""}`} spec={s} action={action(s.name)} passkeys={passkeys} />
        ))}
      </div>
    </section>
  );
}

function Invitation({ result }: { result: Record<string, unknown> }) {
  const inv = result["invitation"] as { token?: string; expires_at?: string } | undefined;
  if (!inv?.token) return <>Invited.</>;
  // In the fragment, so the token never reaches a server log; shown once, here.
  const link = `${window.location.origin}/#invitation=${inv.token}`;
  return (
    <>
      <p>Give this link to them, and only to them. It is shown once and works until {time(inv.expires_at)}:</p>
      <p className="mono wrap">{link}</p>
    </>
  );
}

export function QualificationsSection({ view, passkeys = browserPasskeys }: Props) {
  const { action, memberName, members, registry } = useSection(view);
  const specs: CommandSpec[] = [
    {
      name: "qualification.issue", verb: "issue", fields: [
        { key: "member_id", label: "Member", kind: "select", options: members, required: true },
        { key: "roles", label: "Signing roles", kind: "checks", options: opts(ROLES) },
        { key: "authorities", label: "Authorities", kind: "checks", options: opts(AUTHORITIES), hint: "Administrator: members, runtimes, sandbox policy. Lane: classify and raise lanes. Policy: policy sets, budgets, autonomy." },
        { key: "grades", label: "Grades", kind: "checks", options: opts(GRADES) },
        { key: "disciplines", label: "Disciplines", kind: "lines", placeholder: "One per line, for example mechanical" },
        { key: "licenses", label: "Licenses", kind: "lines", placeholder: "One per line: jurisdiction, number, expiry date, discipline (optional), for example US-SC, 12345, 2027-06-30, mechanical" },
        { key: "reason", label: "Why", kind: "textarea", required: true },
      ],
      describe: (v) => {
        const licenses = parseLicenses(list(v, "licenses"));
        if (licenses === null) return null;
        const parts = [
          list(v, "roles").length ? `roles ${and(list(v, "roles"))}` : "no signing role",
          list(v, "authorities").length ? `authorities ${and(list(v, "authorities"))}` : "no authority",
          list(v, "grades").length ? `grades ${and(list(v, "grades"))}` : "no grade",
          list(v, "disciplines").length ? `disciplines ${and(list(v, "disciplines"))}` : "no discipline",
          licenses.length ? `licenses ${and(licenses.map(licenseWords))}` : "no license",
        ];
        return `Replaces ${memberName(str(v, "member_id"))}'s qualification with: ${parts.join("; ")}. What they may sign follows from this at once.`;
      },
      payload: (v) => ({
        member_id: str(v, "member_id"), roles: list(v, "roles"), authorities: list(v, "authorities"), grades: list(v, "grades"),
        disciplines: list(v, "disciplines"), licenses: parseLicenses(list(v, "licenses")) ?? [], reason: str(v, "reason"),
      }),
    },
    {
      name: "qualification.revoke", verb: "revoke", fields: [
        { key: "member_id", label: "Member", kind: "select", options: members, required: true },
        { key: "reason", label: "Why", kind: "textarea", required: true },
      ],
      describe: (v) => `Revokes ${memberName(str(v, "member_id"))}'s qualification: they may no longer sign anything that needs one, and their pending signatures are voided.`,
      payload: (v) => ({ member_id: str(v, "member_id"), reason: str(v, "reason") }),
    },
  ];
  return (
    <section className="panel" aria-labelledby="admin-quals-title">
      <h2 id="admin-quals-title">Qualifications</h2>
      {registry.qualifications.length === 0 ? (
        <p className="muted">No qualification is issued yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="records">
            <thead>
              <tr>
                <th scope="col">Member</th>
                <th scope="col">Roles</th>
                <th scope="col">Authorities</th>
                <th scope="col">Grades and disciplines</th>
              </tr>
            </thead>
            <tbody>
              {registry.qualifications.map((q: Json) => (
                <tr key={q.member_id}>
                  <td>{memberName(q.member_id)}</td>
                  <td className="small">{q.revoked ? "Revoked" : and(q.roles) || "None"}</td>
                  <td className="small">{q.revoked ? "" : and(q.authorities) || "None"}</td>
                  <td className="small">{q.revoked ? "" : [and(q.grades), and(q.disciplines)].filter(Boolean).join("; ") || "None"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="admin-forms">
        {specs.map((s) => (
          <CommandForm key={`${s.title ?? s.name}:${s.resetKey ?? ""}`} spec={s} action={action(s.name)} passkeys={passkeys} />
        ))}
      </div>
    </section>
  );
}

const licenseWords = (l: { jurisdiction: string; number: string; expires_on: string; discipline?: string }) =>
  `${l.jurisdiction} ${l.number} expiring ${l.expires_on}${l.discipline ? ` (${l.discipline})` : ""}`;

/** Licenses from lines of "jurisdiction, number, expiry, discipline"; null when a line is malformed. */
export function parseLicenses(lines: string[]): { jurisdiction: string; number: string; expires_on: string; discipline?: string }[] | null {
  const out = [];
  for (const line of lines) {
    const parts = line.split(",").map((x) => x.trim());
    // Never more than four: a value the person typed is never silently left out of what is signed.
    if (parts.length > 4) return null;
    const [jurisdiction, number, expires, discipline] = parts;
    if (!jurisdiction || !number || !expires || !/^\d{4}-\d{2}-\d{2}$/.test(expires)) return null;
    out.push({ jurisdiction, number, expires_on: expires, ...(discipline ? { discipline } : {}) });
  }
  return out;
}

export function DelegationsSection({ view, passkeys = browserPasskeys }: Props) {
  const { action, memberName, members, projects, registry } = useSection(view);
  const specs: CommandSpec[] = [
    {
      name: "delegation.create", verb: "delegate", fields: [
        { key: "to_member_id", label: "To", kind: "select", options: members, required: true },
        { key: "role", label: "Role", kind: "select", options: opts(ROLES), required: true },
        { key: "discipline", label: "Discipline", kind: "text", required: true },
        { key: "project_id", label: "Project (leave empty for all)", kind: "select", options: projects },
        { key: "starts_on", label: "From", kind: "date", required: true },
        { key: "ends_on", label: "Until", kind: "date", required: true, hint: "At most a year after it starts." },
        { key: "reason", label: "Why", kind: "textarea", required: true },
      ],
      describe: (v) =>
        `Lets ${memberName(str(v, "to_member_id"))} act as your ${str(v, "role")} in ${str(v, "discipline")}${str(v, "project_id") ? ` on ${projects.find((p) => p.value === str(v, "project_id"))?.label ?? str(v, "project_id")}` : " on every project"} from ${str(v, "starts_on")} until ${str(v, "ends_on")}, within your own qualification.`,
      payload: (v) => ({
        to_member_id: str(v, "to_member_id"), role: str(v, "role"), discipline: str(v, "discipline"), starts_on: str(v, "starts_on"), ends_on: str(v, "ends_on"),
        reason: str(v, "reason"), ...(str(v, "project_id") ? { project_id: str(v, "project_id") } : {}),
      }),
    },
    {
      name: "delegation.revoke", verb: "revoke", fields: [
        { key: "delegation_id", label: "Delegation", kind: "select", required: true, options: registry.delegations.filter((d: Json) => !d.revoked).map((d: Json) => ({
          value: d.id, label: `${memberName(d.from_member_id)} to ${memberName(d.to_member_id)}, ${d.role} in ${d.discipline}, until ${d.ends_on}`,
        })) },
        { key: "reason", label: "Why", kind: "textarea", required: true },
      ],
      describe: (v) => {
        const d = registry.delegations.find((x: Json) => x.id === str(v, "delegation_id"));
        return d ? `Ends the delegation from ${memberName(d.from_member_id)} to ${memberName(d.to_member_id)} as ${d.role} in ${d.discipline} now.` : null;
      },
      payload: (v) => ({ delegation_id: str(v, "delegation_id"), reason: str(v, "reason") }),
    },
  ];
  return (
    <section className="panel" aria-labelledby="admin-delegations-title">
      <h2 id="admin-delegations-title">Delegations</h2>
      {registry.delegations.length === 0 ? (
        <p className="muted">No delegation is recorded.</p>
      ) : (
        <ul className="small">
          {registry.delegations.map((d: Json) => (
            <li key={d.id}>
              {memberName(d.from_member_id)} to {memberName(d.to_member_id)}, {d.role} in {d.discipline}, {d.starts_on} until {d.ends_on}
              {d.revoked ? " (revoked)" : ""}
            </li>
          ))}
        </ul>
      )}
      <div className="admin-forms">
        {specs.map((s) => (
          <CommandForm key={`${s.title ?? s.name}:${s.resetKey ?? ""}`} spec={s} action={action(s.name)} passkeys={passkeys} />
        ))}
      </div>
    </section>
  );
}

export function ProjectsSection({ view, passkeys = browserPasskeys }: Props) {
  const { action, projects, registry } = useSection(view);
  const projectName = (id: string) => projects.find((p) => p.value === id)?.label ?? id;
  const specs: CommandSpec[] = [
    {
      name: "project.create", verb: "create", fields: [
        { key: "name", label: "Name", kind: "text", required: true },
        { key: "mode", label: "Mode", kind: "select", options: opts(MODES), required: true },
        { key: "default_rigor", label: "Default rigor", kind: "select", options: opts(RIGOR), required: true },
        { key: "lanes", label: "Lanes it may hold", kind: "checks", options: opts(LANES), required: true },
        { key: "qa_overlays", label: "Quality assurance overlays", kind: "lines", placeholder: "One per line" },
      ],
      describe: (v) => `Creates the ${str(v, "mode")} project ${str(v, "name")}, ${str(v, "default_rigor")} rigor by default, holding ${and(list(v, "lanes"))} work, ${list(v, "qa_overlays").length ? `with quality assurance overlays ${and(list(v, "qa_overlays"))}` : "with no quality assurance overlay"}, autonomy level 0.`,
      payload: (v) => ({ name: str(v, "name"), mode: str(v, "mode"), default_rigor: str(v, "default_rigor"), lanes: list(v, "lanes"), qa_overlays: list(v, "qa_overlays") }),
    },
    {
      name: "project.update", verb: "update", fields: [
        { key: "project_id", label: "Project", kind: "select", options: projects, required: true },
        { key: "name", label: "New name (leave empty to keep)", kind: "text" },
        { key: "default_rigor", label: "New default rigor (leave empty to keep)", kind: "select", options: opts(RIGOR) },
        { key: "lanes", label: "Lanes (leave all clear to keep)", kind: "checks", options: opts(LANES) },
        { key: "qa_overlays", label: "Quality assurance overlays (leave empty to keep)", kind: "lines", placeholder: "One per line; replaces the current list" },
        { key: "clear_overlays", label: "Overlays", kind: "checks", options: [{ value: "clear", label: "Remove every overlay" }] },
      ],
      invalid: (v) => (list(v, "qa_overlays").length && list(v, "clear_overlays").length
        ? "Either list the overlays to keep or remove every overlay, not both." : null),
      describe: (v) => {
        const changes = [
          str(v, "name") && `name to ${str(v, "name")}`,
          str(v, "default_rigor") && `default rigor to ${str(v, "default_rigor")}`,
          list(v, "lanes").length > 0 && `lanes to ${and(list(v, "lanes"))}`,
          list(v, "qa_overlays").length > 0 && `quality assurance overlays to ${and(list(v, "qa_overlays"))}`,
          list(v, "clear_overlays").length > 0 && "quality assurance overlays to none",
        ].filter(Boolean) as string[];
        return changes.length ? `Changes ${projectName(str(v, "project_id"))}'s ${and(changes)}.` : null;
      },
      payload: (v) => ({
        project_id: str(v, "project_id"), ...(str(v, "name") ? { name: str(v, "name") } : {}), ...(str(v, "default_rigor") ? { default_rigor: str(v, "default_rigor") } : {}),
        ...(list(v, "lanes").length ? { lanes: list(v, "lanes") } : {}),
        ...(list(v, "qa_overlays").length ? { qa_overlays: list(v, "qa_overlays") } : list(v, "clear_overlays").length ? { qa_overlays: [] } : {}),
      }),
    },
    {
      name: "project.set-autonomy", verb: "set", fields: [
        { key: "project_id", label: "Project", kind: "select", options: projects, required: true },
        { key: "level", label: "Autonomy level", kind: "select", options: ["0", "1", "2", "3"].map((x) => ({ value: x, label: x })), required: true, hint: "Level 4 is never permitted; the approved policy may cap it lower." },
      ],
      describe: (v) => `Sets ${projectName(str(v, "project_id"))}'s autonomy level to ${str(v, "level")}.`,
      payload: (v) => ({ project_id: str(v, "project_id"), level: Number(str(v, "level")) }),
    },
    {
      name: "repo.bind", verb: "bind", fields: [
        { key: "project_id", label: "Project", kind: "select", options: projects, required: true },
        { key: "url", label: "Repository address", kind: "text", required: true },
        { key: "default_branch", label: "Default branch", kind: "text", required: true },
      ],
      describe: (v) => `Binds ${str(v, "url")} (branch ${str(v, "default_branch")}) to ${projectName(str(v, "project_id"))}.`,
      payload: (v) => ({ project_id: str(v, "project_id"), url: str(v, "url"), default_branch: str(v, "default_branch") }),
    },
    {
      name: "repo.unbind", verb: "unbind", fields: [
        { key: "binding_id", label: "Binding", kind: "select", required: true, options: registry.bindings.filter((b: Json) => b.status !== "retired").map((b: Json) => ({ value: b.id, label: `${b.url} on ${projectName(b.project_id)}` })) },
        { key: "reason", label: "Why", kind: "textarea", required: true },
      ],
      describe: (v) => {
        const b = registry.bindings.find((x: Json) => x.id === str(v, "binding_id"));
        return b ? `Unbinds ${b.url} from ${projectName(b.project_id)}.` : null;
      },
      payload: (v) => ({ binding_id: str(v, "binding_id"), reason: str(v, "reason") }),
    },
  ];
  return (
    <section className="panel" aria-labelledby="admin-projects-title">
      <h2 id="admin-projects-title">Projects and repositories</h2>
      {view.projects.length === 0 ? (
        <p className="muted">No project yet.</p>
      ) : (
        <ul className="small">
          {view.projects.map((p) => (
            <li key={p.id}>
              {p.name}: {p.mode}, {p.default_rigor} rigor, lanes {and(p.lanes)}, autonomy level {p.autonomy_level}
            </li>
          ))}
        </ul>
      )}
      <div className="admin-forms">
        {specs.map((s) => (
          <CommandForm key={`${s.title ?? s.name}:${s.resetKey ?? ""}`} spec={s} action={action(s.name)} passkeys={passkeys} />
        ))}
      </div>
    </section>
  );
}

export function PolicySection({ view, passkeys = browserPasskeys }: Props) {
  const { action, registry } = useSection(view);
  const current = view.policy;
  const requests = registry.change_requests;
  const policyRequests = requests.filter((c: Json) => c.kind === "policy-change");
  const declassRequests = requests.filter((c: Json) => c.kind === "declassification");
  const specs: CommandSpec[] = [
    {
      name: "policy.propose", verb: "propose", fields: [
        { key: "autonomy_ceiling", label: "Autonomy ceiling", kind: "select", options: ["0", "1", "2", "3"].map((x) => ({ value: x, label: x })), hint: "The highest autonomy level any project may have; level 4 is never permitted." },
        { key: "budget_near_percent", label: "Budget near line, in whole percent", kind: "text", placeholder: "For example 80", hint: "The share of a budget's limit at which it reads as near and alerts. Leave empty to call nothing near." },
        { key: "hardware_attestation_formats", label: "Hardware attestation formats accepted", kind: "lines", placeholder: "One per line" },
        { key: "reason", label: "Why", kind: "textarea", required: true },
      ],
      describe: (v) => {
        const near = str(v, "budget_near_percent");
        if (near && !/^[1-9][0-9]?$/.test(near)) return null;
        const settings = [str(v, "autonomy_ceiling") && `autonomy ceiling ${str(v, "autonomy_ceiling")}`, near && `budget near line at ${near}%`].filter(Boolean) as string[];
        const formats = list(v, "hardware_attestation_formats");
        return `Proposes a policy set with ${settings.length ? and(settings) : "no settings"} and ${formats.length ? `hardware attestation formats ${and(formats)}` : "no hardware attestation format"}. It takes effect only when someone with policy authority approves it.`;
      },
      payload: (v) => ({
        policy: {
          hardware_attestation_formats: list(v, "hardware_attestation_formats"),
          settings: { ...(str(v, "autonomy_ceiling") ? { autonomy_ceiling: str(v, "autonomy_ceiling") } : {}), ...(str(v, "budget_near_percent") ? { budget_near_percent: str(v, "budget_near_percent") } : {}) },
        },
        reason: str(v, "reason"),
      }),
      // The form starts from the policy in force, so changing one setting never drops another, and
      // starts again whenever a new policy comes into force.
      resetKey: String(current?.version ?? "none"),
      initial: {
        autonomy_ceiling: current?.settings?.["autonomy_ceiling"] ?? "",
        budget_near_percent: current?.settings?.["budget_near_percent"] ?? "",
        hardware_attestation_formats: [...(current?.hardware_attestation_formats ?? [])],
      },
    },
    {
      name: "policy.approve", verb: "approve", fields: [
        { key: "change_request_id", label: "Proposal", kind: "select", required: true, options: policyRequests.map((c: Json) => ({ value: c.id, label: `${c.id}: ${c.reason}` })) },
      ],
      describe: (v) => {
        const c = policyRequests.find((x: Json) => x.id === str(v, "change_request_id"));
        if (!c) return null;
        const p = c.proposal ?? {};
        return `Puts in force the proposed policy set: settings ${JSON.stringify(p.settings ?? {})}, hardware attestation formats ${JSON.stringify(p.hardware_attestation_formats ?? [])}. Proposed because: ${c.reason}`;
      },
      payload: (v) => ({ change_request_id: str(v, "change_request_id") }),
    },
    {
      name: "marking.propose-declassification", verb: "propose", fields: [
        { key: "object_kind", label: "What", kind: "select", options: [{ value: "package", label: "A package" }, { value: "capture", label: "A capture" }], required: true },
        { key: "object_id", label: "Its id", kind: "text", required: true },
        { key: "lane", label: "Lower it to", kind: "select", options: opts(LANES), required: true },
        { key: "reason", label: "Why", kind: "textarea", required: true },
      ],
      describe: (v) => `Proposes lowering ${str(v, "object_kind")} ${str(v, "object_id")} to the ${str(v, "lane")} lane. Everything that depends on it is listed with the proposal, and it takes effect only when someone with lane authority approves it.`,
      payload: (v) => ({ object_kind: str(v, "object_kind"), object_id: str(v, "object_id"), lane: str(v, "lane"), reason: str(v, "reason") }),
    },
    {
      name: "marking.approve-declassification", verb: "approve", fields: [
        { key: "change_request_id", label: "Proposal", kind: "select", required: true, options: declassRequests.map((c: Json) => ({ value: c.id, label: `${c.proposal?.object_kind} ${c.proposal?.object_id} to ${c.proposal?.lane}` })) },
      ],
      describe: (v) => {
        const c = declassRequests.find((x: Json) => x.id === str(v, "change_request_id"));
        if (!c) return null;
        const p = c.proposal ?? {};
        return `Lowers ${p.object_kind} ${p.object_id} from ${p.from} to ${p.lane}. Affected downstream: ${c.impact?.length ? and(c.impact) : "nothing"}. Proposed because: ${c.reason}`;
      },
      payload: (v) => ({ change_request_id: str(v, "change_request_id") }),
    },
  ];
  return (
    <section className="panel" aria-labelledby="admin-policy-title">
      <h2 id="admin-policy-title">Policy and lanes</h2>
      <p className="muted small">
        {requests.length === 0 ? "No change request is waiting." : `${requests.length} ${requests.length === 1 ? "change request is" : "change requests are"} waiting on approval.`}
      </p>
      <div className="admin-forms">
        {specs.map((s) => (
          <CommandForm key={`${s.title ?? s.name}:${s.resetKey ?? ""}`} spec={s} action={action(s.name)} passkeys={passkeys} />
        ))}
      </div>
    </section>
  );
}

export function BudgetsSection({ view, passkeys = browserPasskeys }: Props) {
  const { action, projects, registry } = useSection(view);
  const scopeWords = (v: Values) =>
    str(v, "scope") === "organization" ? "the organization" : str(v, "scope") === "project" ? `project ${projects.find((p) => p.value === str(v, "scope_id"))?.label ?? str(v, "scope_id")}` : `agent ${str(v, "scope_id")}`;
  const unitWords = (u: string) => (u === "minute" ? "minutes of run time" : u === "token" ? "tokens" : "USD");
  const budgetWords = (b: Json) =>
    `${b.id}: ${b.mode} ${b.limit.value} ${unitWords(b.limit.unit)} per ${PERIOD_WORDS[b.period] ?? b.period} on ${b.scope === "organization" ? "the organization" : `${b.scope} ${b.scope === "project" ? (projects.find((p) => p.value === b.scope_id)?.label ?? b.scope_id) : b.scope_id}`}`;
  const specs: CommandSpec[] = [
    {
      name: "budget.set", verb: "set", fields: [
        { key: "scope", label: "Applies to", kind: "select", required: true, options: [{ value: "organization", label: "The organization" }, { value: "project", label: "A project" }, { value: "agent", label: "An agent baseline" }] },
        { key: "scope_id", label: "Which project, or which baseline (for example author-claude)", kind: "text", hint: "Not needed for the organization." },
        { key: "mode", label: "Mode", kind: "select", required: true, options: [{ value: "track", label: "Track" }, { value: "alert", label: "Alert" }, { value: "hard-cap", label: "Hard cap (minutes of run time only)" }] },
        { key: "unit", label: "Unit", kind: "select", required: true, options: [{ value: "minute", label: "Minutes of run time" }, { value: "token", label: "Tokens" }, { value: "USD", label: "USD (not reported by any runtime here)" }] },
        { key: "limit", label: "Limit", kind: "text", required: true },
        { key: "period", label: "Period", kind: "select", required: true, options: PERIODS },
      ],
      invalid: (v) => (str(v, "mode") === "hard-cap" && str(v, "unit") !== "minute"
        ? "A hard cap can hold only minutes of run time: nothing reports tokens or money before work starts. Choose minutes, or track or alert." : null),
      describe: (v) => {
        if (str(v, "scope") !== "organization" && !str(v, "scope_id")) return null;
        if (!LIMIT.test(str(v, "limit"))) return null;
        return `Sets a ${str(v, "mode")} budget of ${str(v, "limit")} ${unitWords(str(v, "unit"))} per ${PERIOD_WORDS[str(v, "period")]} (rolling) on ${scopeWords(v)}.${str(v, "mode") === "hard-cap" ? " Work that would pass it is held before it starts." : ""}`;
      },
      payload: (v) => ({
        scope: str(v, "scope"), scope_id: str(v, "scope") === "organization" ? view.me.orgId : str(v, "scope_id"), mode: str(v, "mode"),
        limit: { value: str(v, "limit"), unit: str(v, "unit") }, period: str(v, "period"),
      }),
    },
    {
      name: "budget.set", title: "Change a budget", verb: "change", fields: [
        { key: "budget_id", label: "Budget", kind: "select", required: true, options: registry.budgets.map((b: Json) => ({ value: b.id, label: budgetWords(b) })) },
        { key: "mode", label: "New mode (leave empty to keep)", kind: "select", options: [{ value: "track", label: "Track" }, { value: "alert", label: "Alert" }, { value: "hard-cap", label: "Hard cap (minutes of run time only)" }] },
        { key: "limit", label: "New limit, in its unit (leave empty to keep)", kind: "text" },
        { key: "period", label: "New period (leave empty to keep)", kind: "select", options: PERIODS },
      ],
      invalid: (v) => {
        const b = registry.budgets.find((x: Json) => x.id === str(v, "budget_id"));
        return b && (str(v, "mode") || b.mode) === "hard-cap" && b.limit.unit !== "minute"
          ? `A hard cap can hold only minutes of run time, and this budget counts ${unitWords(b.limit.unit)}. Choose track or alert.` : null;
      },
      describe: (v) => {
        const b = registry.budgets.find((x: Json) => x.id === str(v, "budget_id"));
        if (!b) return null;
        if (str(v, "limit") && !LIMIT.test(str(v, "limit"))) return null;
        const changes = [
          str(v, "mode") && `mode to ${str(v, "mode")}`,
          str(v, "limit") && `limit to ${str(v, "limit")} ${unitWords(b.limit.unit)}`,
          str(v, "period") && `period to a ${PERIOD_WORDS[str(v, "period")]}`,
        ].filter(Boolean) as string[];
        return changes.length ? `Changes ${budgetWords(b)}: ${and(changes)}.${(str(v, "mode") || b.mode) === "hard-cap" ? " Work that would pass it is held before it starts." : ""}` : null;
      },
      payload: (v) => {
        const b = registry.budgets.find((x: Json) => x.id === str(v, "budget_id"));
        return {
          budget_id: str(v, "budget_id"), ...(str(v, "mode") ? { mode: str(v, "mode") } : {}),
          ...(str(v, "limit") ? { limit: { value: str(v, "limit"), unit: b?.limit.unit } } : {}), ...(str(v, "period") ? { period: str(v, "period") } : {}),
        };
      },
    },
  ];
  return (
    <section className="panel" aria-labelledby="admin-budgets-title">
      <h2 id="admin-budgets-title">Budgets</h2>
      {registry.budgets.length === 0 ? (
        <p className="muted">No budget is set. Their use is shown on the Usage page.</p>
      ) : (
        <ul className="small">
          {registry.budgets.map((b: Json) => (
            <li key={b.id}>
              {budgetWords(b)}
              {b.status === "suspended" ? " (suspended)" : ""}
            </li>
          ))}
        </ul>
      )}
      <div className="admin-forms">
        {specs.map((s) => (
          <CommandForm key={`${s.title ?? s.name}:${s.resetKey ?? ""}`} spec={s} action={action(s.name)} passkeys={passkeys} />
        ))}
      </div>
    </section>
  );
}

/**
 * Bootstrap: until the organization has an administrator, its first Member may issue their own
 * qualification, once (the control plane checks that this is the first Member and refuses anyone else).
 */
const bootstrapAuthorities = (v: Values) => ["administrator", ...(list(v, "lane").length ? ["lane"] : []), "policy"];

export function BootstrapForm({ view, passkeys = browserPasskeys }: Props) {
  const spec: CommandSpec = {
    name: "qualification.issue", verb: "issue it",
    fields: [
      { key: "lane", label: "Also lane authority", kind: "checks", options: [{ value: "lane", label: "lane" }], hint: "Administrator and policy authority are always included: issuing anyone a qualification needs both, and this is the only way to get them while no administrator exists." },
      { key: "roles", label: "Signing roles", kind: "checks", options: opts(ROLES) },
      { key: "grades", label: "Grades", kind: "checks", options: opts(GRADES) },
      { key: "disciplines", label: "Disciplines", kind: "lines", placeholder: "One per line" },
      { key: "reason", label: "Why", kind: "textarea", required: true },
    ],
    describe: (v) =>
      `Issues your own first qualification: authorities ${and(bootstrapAuthorities(v))}; ${list(v, "roles").length ? `roles ${and(list(v, "roles"))}` : "no signing role"}; ${list(v, "grades").length ? `grades ${and(list(v, "grades"))}` : "no grade"}; ${list(v, "disciplines").length ? `disciplines ${and(list(v, "disciplines"))}` : "no discipline"}; no license. This is allowed once, to the organization's first Member, and is recorded as a bootstrap; from then on administrators issue qualifications.`,
    payload: (v) => ({ member_id: view.me.memberId, authorities: bootstrapAuthorities(v), roles: list(v, "roles"), grades: list(v, "grades"), disciplines: list(v, "disciplines"), licenses: [], reason: str(v, "reason") }),
  };
  return <CommandForm spec={spec} action={{ command: "qualification.issue", label: "Issue your own first qualification", allowed: true, signature: "direct" }} passkeys={passkeys} />;
}
