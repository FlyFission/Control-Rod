import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { api } from "../../api/client.js";
import type { AgentFigure } from "../../api/types.js";
import { STATE_INFO, StateMark } from "../../components/StateMark.js";
import { REGION } from "./layout.js";
import { LENSES, type LensId, lensById } from "./lenses.js";
import { OfficeStage } from "./OfficeStage.js";
import { DEFAULT_OFFICE_THEME } from "./registry.js";
import { seatFigures } from "./seat.js";

/**
 * The office view (specification 13; plan tasks 4.5 and 4.8): the projected figures on the canonical
 * floor under the released theme, a lens that recolours them, presenting mode, and a card for the
 * selected figure. Every state and cause comes from GET /office/figures; nothing here guesses.
 */

/** What waits on the viewer: agents in Your office, and anything else in the Inbox with no agent yet. */
function countLine(needsMe: number, inboxItems: number): string {
  const rest = Math.max(0, inboxItems - needsMe);
  const agents = needsMe === 0 ? "" : `${needsMe} ${needsMe === 1 ? "agent waits" : "agents wait"} on you`;
  const more = rest === 0 ? "" : `${rest} more in the Inbox with no agent yet`;
  if (!agents && !more) return "Nothing waits on you";
  return [agents, more].filter(Boolean).join("; ");
}

const HOUR = 3600e3;
function howLong(since: string, now: number): string {
  const ms = Math.max(0, now - Date.parse(since));
  if (ms < 60e3) return "under a minute";
  if (ms < HOUR) return `${Math.round(ms / 60e3)} min`;
  if (ms < 48 * HOUR) return `${Math.round(ms / HOUR)} h`;
  return `${Math.round(ms / (24 * HOUR))} days`;
}

export function OfficeView() {
  const [lens, setLens] = useState<LensId>("status");
  const [presenting, setPresenting] = useState(false);
  const [selected, setSelected] = useState<string>();
  const q = useQuery({ queryKey: ["office-figures", presenting], queryFn: () => api.officeFigures(presenting), refetchInterval: 30_000 });
  const active = lensById(lens);
  const floor = q.data;
  const { seated, overflow } = useMemo(() => (floor ? seatFigures(floor.figures, active.tint, active.unavailable ? undefined : active) : { seated: [], overflow: [] }), [floor, active]);
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
          <button type="button" className="btn small" aria-pressed={presenting} onClick={() => setPresenting((v) => !v)}>
            Presenting mode
          </button>
        </div>
      </header>
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
            <OfficeStage theme={DEFAULT_OFFICE_THEME} figures={seated} selected={selected} onSelect={setSelected} />
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
          <FigureCard figure={open} lens={active.unavailable ? undefined : `${active.label} lens: ${open ? active.value(open) : ""}`} />
        </div>
      )}
    </section>
  );
}

function FigureCard({ figure: f, lens }: { figure: AgentFigure | undefined; lens: string | undefined }) {
  if (!f)
    return (
      <aside className="office-card" aria-label="Selected agent">
        <p className="office-note">Select an agent to see what it is doing and why.</p>
      </aside>
    );
  const now = Date.now();
  const marks = [
    f.marks.gate && "A gate decision waits on this package",
    f.marks.changed_input && `Input ${f.marks.changed_input} changed`,
    f.marks.loop && `Round ${f.marks.loop}`,
    f.marks.safety && "Safety grade",
  ].filter(Boolean) as string[];
  return (
    <aside className="office-card" aria-label="Selected agent">
      <h2>{f.title}</h2>
      <p className="mono small">{f.package_id} · revision {f.package_revision}</p>
      <p className="office-state">
        <StateMark kind={f.state} size={12} /> {STATE_INFO[f.state].label} for {howLong(f.since, now)}
      </p>
      <p>{f.cause}</p>
      {f.waiting_on && <p>Waiting on {f.waiting_on}.</p>}
      <p className="muted small">
        {REGION[f.place].name}
        {f.place_defaulted ? ": shown here because the package names no discipline this office recognises" : ""}
      </p>
      {marks.length > 0 && (
        <ul className="office-marks">
          {marks.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
      {lens && <p className="small">{lens}</p>}
      {f.unverified_inputs && f.unverified_inputs.length > 0 && (
        <p className="muted small">Freshness unknown for {f.unverified_inputs.join(", ")}: no preparation pinned the revision it used.</p>
      )}
      {f.observability && <p className="muted small">This runtime cannot report permission waits: {f.observability}.</p>}
      {f.href.to === "/packages/$id" ? (
        <Link to="/packages/$id" params={{ id: f.package_id }} {...(f.href.hash ? { hash: f.href.hash } : {})} className="btn small">
          Open the package
        </Link>
      ) : (
        <Link to="/packages" className="btn small">
          Open captures and packages
        </Link>
      )}
    </aside>
  );
}
