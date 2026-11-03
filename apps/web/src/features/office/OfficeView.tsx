import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { api } from "../../api/client.js";
import type { AgentFigure } from "../../api/types.js";
import { STATE_INFO } from "../../components/StateMark.js";
import { AgentCard } from "./AgentCard.js";
import { ScramBanner, ScramControl } from "./Scram.js";
import { type CauseGroup, EXCEPTIONS_AT, causeGroups, exceptionsView, portfolio } from "./exceptions.js";
import { REGION } from "./layout.js";
import { LENSES, type LensId, lensById } from "./lenses.js";
import { OfficeStage } from "./OfficeStage.js";
import { DEFAULT_OFFICE_THEME, draftBuild, officeThemeChoices } from "./registry.js";
import { seatFigures } from "./seat.js";

/**
 * The office view (specification 13; plan tasks 4.5 and 4.8): the projected figures on the canonical
 * floor under the chosen theme (the released theme, or in a draft build one of the fifteen worlds;
 * plan task 4.9), a lens that recolours them, presenting mode, and a card for the selected figure.
 * Every state and cause comes from GET /office/figures; nothing here guesses.
 */

/** What waits on the viewer: agents in Your office, and anything else in the Inbox with no agent yet. */
function countLine(needsMe: number, inboxItems: number): string {
  // A count that did not arrive is never shown as a number.
  const rest = Number.isFinite(inboxItems) ? Math.max(0, inboxItems - needsMe) : 0;
  const agents = needsMe === 0 ? "" : `${needsMe} ${needsMe === 1 ? "agent waits" : "agents wait"} on you`;
  const more = rest === 0 ? "" : `${rest} more in the Inbox with no agent yet`;
  if (!agents && !more) return "Nothing waits on you";
  return [agents, more].filter(Boolean).join("; ");
}

// The theme is a per member convenience: remembered in this browser for the signed in member, where
// storage works, and never required.
const themeKey = (member: string) => `controlrod.office.theme.${member}`;
const rememberedTheme = (member: string | undefined) => {
  if (!member) return undefined;
  try {
    return localStorage.getItem(themeKey(member)) ?? undefined;
  } catch {
    return undefined;
  }
};

export function OfficeView({ drafts = draftBuild() }: { drafts?: boolean } = {}) {
  const choices = officeThemeChoices(drafts);
  const session = useQuery({ queryKey: ["session"], queryFn: api.session });
  const member = session.data?.signed_in ? session.data.user : undefined;
  // A choice made in this visit holds for the member who made it; another member gets their own.
  const [chosen, setChosen] = useState<{ member: string; id: string }>();
  const themeId = chosen && chosen.member === member ? chosen.id : rememberedTheme(member);
  const theme = choices.find((t) => t.id === themeId) ?? DEFAULT_OFFICE_THEME;
  const chooseTheme = (id: string) => {
    if (!member) return;
    setChosen({ member, id });
    try {
      localStorage.setItem(themeKey(member), id);
    } catch {
      // Not remembered; the choice still holds for this visit.
    }
  };
  const [lens, setLens] = useState<LensId>("status");
  const [presenting, setPresenting] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [showEveryone, setShowEveryone] = useState(false);
  const q = useQuery({ queryKey: ["office-figures", presenting], queryFn: () => api.officeFigures(presenting), refetchInterval: 30_000 });
  const active = lensById(lens);
  const floor = q.data;
  const exceptions = useMemo(() => exceptionsView(floor?.figures ?? [], showEveryone), [floor, showEveryone]);
  const projects = useMemo(() => portfolio(floor?.figures ?? []), [floor]);
  const groups = useMemo(() => causeGroups(floor?.figures ?? []), [floor]);
  const { seated, overflow } = useMemo(() => seatFigures(exceptions.shown, active.tint, active.unavailable ? undefined : active), [exceptions, active]);
  const open = floor?.figures.find((f) => f.id === selected);

  return (
    <section className="office-view" aria-labelledby="office-title">
      <header className="office-head">
        <div>
          <h1 id="office-title">Office</h1>
          {floor && (
            <p className="office-count" aria-live="polite">
              {countLine(floor.needs_me, floor.inbox_items)}
              {" · "}
              {floor.figures.length} {floor.figures.length === 1 ? "agent" : "agents"} on the floor
            </p>
          )}
        </div>
        <div className="office-controls">
          <div role="radiogroup" aria-label="Lens" className="office-lenses">
            {LENSES.map((l) => (
              <button
                key={l.id}
                type="button"
                role="radio"
                aria-checked={lens === l.id}
                disabled={Boolean(l.unavailable)}
                title={l.unavailable}
                aria-describedby={l.unavailable ? `lens-why-${l.id}` : undefined}
                className={lens === l.id ? "btn small active" : "btn small"}
                onClick={() => setLens(l.id)}
              >
                {l.label}
              </button>
            ))}
          </div>
          {choices.length > 1 && (
            <label className="office-theme-choice">
              <span>Theme</span>
              <select value={theme.id} disabled={!member} onChange={(e) => chooseTheme(e.target.value)}>
                {choices.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                    {t.availability === "development" ? " (draft)" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="button" className="btn small" aria-pressed={presenting} onClick={() => setPresenting((v) => !v)}>
            Presenting mode
          </button>
          <ScramControl presenting={presenting} />
        </div>
      </header>
      <ScramBanner presenting={presenting} />
      {LENSES.filter((l) => l.unavailable).map((l) => (
        <p key={l.id} id={`lens-why-${l.id}`} className="office-note">
          {l.label} lens: {l.unavailable}
        </p>
      ))}
      {presenting && floor && (
        <p className="office-banner" role="status">
          Presenting. {floor.hidden === 0 ? "No work above the internal lane is on the floor." : `${floor.hidden} ${floor.hidden === 1 ? "agent" : "agents"} on work above the internal lane ${floor.hidden === 1 ? "is" : "are"} hidden.`} Spend is not shown.
        </p>
      )}
      {floor && floor.figures.length > EXCEPTIONS_AT && (
        <div className="office-banner" role="status">
          {exceptions.active ? (
            <>
              <p>
                {floor.figures.length} agents are on the floor, so healthy work (working, with no changed input and no gate waiting) is folded into counts and every agent that needs attention stands out.
              </p>
              <ul className="office-folded" aria-label="Healthy work folded">
                {exceptions.folded.map((f) => (
                  <li key={f.place}>
                    {REGION[f.place].name}: {f.count} working
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>Every agent is drawn; past {EXCEPTIONS_AT} the floor can fold healthy work into counts.</p>
          )}
          <button type="button" className="btn small" aria-pressed={showEveryone} onClick={() => setShowEveryone((v) => !v)}>
            Show everyone
          </button>
        </div>
      )}
      {projects.length > 1 && (
        <table className="office-portfolio">
          <caption>Portfolio</caption>
          <thead>
            <tr>
              <th scope="col">Project</th>
              <th scope="col">Agents</th>
              <th scope="col">Need someone</th>
              <th scope="col">Stuck</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.project}>
                <th scope="row">{p.project}</th>
                <td>{p.agents}</td>
                <td>{p.needs}</td>
                <td>{p.stuck}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {groups.length > 0 && <CauseChips groups={groups} onSelect={setSelected} />}
      <ul className="office-legend" aria-label={`${active.label} lens`}>
        {active.scale.map((s) => (
          <li key={s.key}>
            <span className="office-swatch" style={{ background: s.color }} aria-hidden="true" />
            {s.label}
          </li>
        ))}
      </ul>

      {q.isError ? (
        <div className="office-error" role="alert">
          <p>The office floor could not be loaded, so nothing here is shown as empty.</p>
          <button type="button" className="btn small" onClick={() => void q.refetch()}>
            Try again
          </button>
        </div>
      ) : !floor ? (
        <p className="office-note">Loading the office floor…</p>
      ) : (
        <div className="office-layout">
          <div className="office-scroll">
            <OfficeStage theme={theme} figures={seated} selected={selected} onSelect={setSelected} />
            {floor.figures.length === 0 && (
              <p className="office-note">
                No agent is working right now. Work appears here once a released package has a run. <Link to="/packages">Packages</Link>
              </p>
            )}
            {overflow.length > 0 && (
              <div className="office-overflow">
                <h2>More than the rooms hold</h2>
                <ul>
                  {overflow.map((f) => (
                    <li key={f.id}>
                      <button type="button" className="link" onClick={() => setSelected(f.id)}>
                        {f.package_id}: {STATE_INFO[f.state].label} in {REGION[f.place].name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <AgentCard figure={open} lens={active.unavailable ? undefined : `${active.label} lens: ${open ? active.value(open) : ""}`} />
        </div>
      )}
    </section>
  );
}

const DAY = 24 * 3600e3;
function age(since: string): string {
  const ms = Math.max(0, Date.now() - Date.parse(since));
  if (ms < 3600e3) return `${Math.max(1, Math.round(ms / 60e3))} min`;
  if (ms < 2 * DAY) return `${Math.round(ms / 3600e3)} h`;
  return `${Math.round(ms / DAY)} days`;
}

/** One chip per shared cause (OV-03): the cause, who it waits on, how long, how many; opens to list them. */
function CauseChips({ groups, onSelect }: { groups: CauseGroup[]; onSelect: (id: string) => void }) {
  // Chips are identified by the recorded cause, so an open chip stays open as the floor refreshes.
  const [open, setOpen] = useState<string>();
  return (
    <section className="office-causes" aria-label="Shared causes">
      {groups.map((g) => (
        <div key={g.key} className="office-cause">
          <button type="button" className="btn small" aria-expanded={open === g.key} onClick={() => setOpen(open === g.key ? undefined : g.key)}>
            {g.figures.length} {g.state === "stuck" ? "stuck" : "waiting"}: {g.cause}
            {g.waiting_on ? `, waiting on ${g.waiting_on}` : ""}, for {age(g.since)}
          </button>
          {open === g.key && (
            <ul>
              {g.figures.map((f) => (
                <li key={f.id}>
                  <button type="button" className="link" onClick={() => onSelect(f.id)}>
                    {f.package_id}: {f.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}

