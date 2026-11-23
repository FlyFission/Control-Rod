import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { api } from "../../api/client.js";
import type { AgentFigure } from "../../api/types.js";
import { STATE_INFO } from "../../components/StateMark.js";
import { AgentCard } from "./AgentCard.js";
import { Annunciator } from "./Annunciator.js";
import { layoutOf } from "./contract.js";
import { ScramBanner, ScramControl } from "./Scram.js";
import { type CauseGroup, EXCEPTIONS_AT, causeGroups, exceptionsView, portfolio } from "./exceptions.js";
import { REGION } from "./layout.js";
import { LENSES, type LensId, lensById } from "./lenses.js";
import { OfficeStage } from "./OfficeStage.js";
import { PLANT_LAYOUT } from "./plant-layout.js";
import { type Read, annunciator, coreState, emptyFloorNote, rodState } from "./plant-instruments.js";
import { PlantList } from "./PlantList.js";
import { PLANT_THEME, archivedThemeChoices, draftBuild } from "./registry.js";
import { seatFigures } from "./seat.js";

/**
 * The Plant (docs/superpowers/specs/2026-11-23-plant-view-design.md), which was the office view
 * (specification 13; plan tasks 4.5 and 4.8): the projected figures on the plant's canonical layout,
 * the annunciator, the reactor core and its rods, a lens that recolours figures, presenting mode, and
 * a card for the selected figure. The office themes (the standard office and the fifteen worlds,
 * plan task 4.9) are archived under Advanced, where choosing one shows the office layout again.
 * Every state and cause comes from GET /office/figures and GET /scrams; nothing here guesses.
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

// The archived theme, if any, is a per member convenience: remembered in this browser for the signed
// in member, where storage works, and never required. A new key, so everyone lands on the Plant once.
const themeKey = (member: string) => `controlrod.plant.view.${member}`;
const rememberedTheme = (member: string | undefined) => {
  if (!member) return undefined;
  try {
    return localStorage.getItem(themeKey(member)) ?? undefined;
  } catch {
    return undefined;
  }
};

/** The stage's minimum width (0.8 of its canvas) and the card's column beside it. */
const STAGE_MIN = 960;
const CARD = 280 + 16;

/**
 * How wide the view's own column is, so the drawing is shown only where it fits at its minimum zoom
 * (the list takes its place below that), and the card moves under the drawing where both do not fit.
 */
function useWidth(): [(el: HTMLDivElement | null) => void, number | undefined] {
  const [width, setWidth] = useState<number>();
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!el || typeof ResizeObserver === "undefined") return;
    const o = new ResizeObserver(([e]) => setWidth(e!.contentRect.width));
    o.observe(el);
    return () => o.disconnect();
  }, [el]);
  return [setEl, width];
}

/**
 * How often the plant's reads refresh, and how long a reading counts as current without a new one:
 * its refresh interval (plant view design, section 6), plus a grace for the refresh itself to land, so
 * a reading is not marked stale while its next refresh is in flight.
 */
const REFRESH_MS = 30_000;
const OVERDUE_MS = REFRESH_MS + 10_000;
/** How often the view checks for an overdue reading: so a reading is marked stale at most this long after OVERDUE_MS. */
const TICK_MS = 10_000;

/** A read as the instruments see it: not current once its refresh failed or is overdue. */
const readOf = <T,>(q: { data: T | undefined; isError: boolean; dataUpdatedAt: number }, now: number): Read<T> => ({
  data: q.data,
  failed: q.isError || (q.dataUpdatedAt > 0 && now - q.dataUpdatedAt > OVERDUE_MS),
  at: q.dataUpdatedAt,
});

/** The time, refreshed every few seconds, so a reading that goes overdue is marked without waiting for a failure. */
function useNow(stepMs = TICK_MS) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), stepMs);
    return () => clearInterval(t);
  }, [stepMs]);
  return now;
}


export function OfficeView({ drafts = draftBuild() }: { drafts?: boolean } = {}) {
  const choices = archivedThemeChoices(drafts);
  const session = useQuery({ queryKey: ["session"], queryFn: api.session });
  const member = session.data?.signed_in ? session.data.user : undefined;
  // A choice made in this visit holds for the member who made it; another member gets their own.
  const [chosen, setChosen] = useState<{ member: string; id: string }>();
  const themeId = chosen && chosen.member === member ? chosen.id : rememberedTheme(member);
  const theme = choices.find((t) => t.id === themeId) ?? PLANT_THEME;
  const layout = layoutOf(theme);
  const isPlant = layout.id === "plant";
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
  const q = useQuery({ queryKey: ["office-figures", presenting], queryFn: () => api.officeFigures(presenting), refetchInterval: REFRESH_MS });
  // The same read the SCRAM banner makes (same key), so the rods and the banner never disagree.
  const scrams = useQuery({ queryKey: ["scrams", presenting], queryFn: () => api.scrams(presenting), refetchInterval: REFRESH_MS });
  const now = useNow();
  const [measure, width] = useWidth();
  const [listChosen, setListChosen] = useState<boolean>();
  // An unmeasured width (no layout engine, as in tests) draws the plant.
  const showList = listChosen ?? (width !== undefined && width < STAGE_MIN);
  const stack = width !== undefined && width < STAGE_MIN + CARD;
  // Why a lens cannot be chosen now: its own reason, or presenting, which shows no spend.
  const why = (l: (typeof LENSES)[number]) => l.unavailable ?? (presenting && l.id === "spend" ? "Spend is not shown while presenting." : undefined);
  const active = lensById(lens);
  const floor = q.data;
  const exceptions = useMemo(() => exceptionsView(floor?.figures ?? [], showEveryone), [floor, showEveryone]);
  const projects = useMemo(() => portfolio(floor?.figures ?? []), [floor]);
  const groups = useMemo(() => causeGroups(floor?.figures ?? []), [floor]);
  const { seated, overflow } = useMemo(() => seatFigures(exceptions.shown, active.tint, active.unavailable ? undefined : active, layout), [exceptions, active, layout]);
  const floorRead = readOf(q, now);
  const scramRead = readOf(scrams, now);
  const windows = annunciator(floorRead, scramRead);
  const instruments = { core: coreState(floorRead), rods: rodState(scramRead), waiting: (floor?.needs_me ?? 0) > 0 };
  const open = floor?.figures.find((f) => f.id === selected);

  return (
    <section className="office-view" aria-labelledby="office-title">
      <header className="office-head">
        <div className="plant-title">
          <h1 id="office-title">Plant</h1>
          {isPlant ? (
            floor && (
              <p className="office-count">
                {floor.figures.length} {floor.figures.length === 1 ? "agent" : "agents"} in the plant
              </p>
            )
          ) : (
            <p className="office-count">
              Archived theme: {theme.title}.{" "}
              <button type="button" className="link" onClick={() => chooseTheme(PLANT_THEME.id)} disabled={!member}>
                Back to the Plant
              </button>
            </p>
          )}
          {!isPlant && floor && (
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
                disabled={Boolean(why(l))}
                title={why(l)}
                aria-describedby={why(l) ? `lens-why-${l.id}` : undefined}
                className={lens === l.id ? "btn small active" : "btn small"}
                onClick={() => setLens(l.id)}
              >
                {l.label}
              </button>
            ))}
          </div>
          <div role="radiogroup" aria-label="Show" className="office-lenses">
            {(["plant", "list"] as const).map((v) => (
              <button key={v} type="button" role="radio" aria-checked={(v === "list") === showList} className={(v === "list") === showList ? "btn small active" : "btn small"} onClick={() => setListChosen(v === "list")}>
                {v === "plant" ? (isPlant ? "Plant" : "Floor") : "List"}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn small"
            aria-pressed={presenting}
            onClick={() => {
              // Presenting shows no spend, so the Spend lens gives way to Status.
              if (!presenting && lens === "spend") setLens("status");
              setPresenting((v) => !v);
            }}
          >
            Presenting mode
          </button>
          <ScramControl presenting={presenting} />
        </div>
      </header>
      {isPlant && <Annunciator windows={windows} scope={presenting ? "presenting" : "all"} />}
      <ScramBanner presenting={presenting} />
      {LENSES.filter((l) => why(l)).map((l) => (
        <p key={l.id} id={`lens-why-${l.id}`} className="office-note">
          {l.label} lens: {why(l)}
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

      {q.isError && floor && (
        // A failed refresh keeps the last reading on screen, marked "as of", never a blank error.
        <div className="office-error" role="status">
          <p>The last refresh failed. Showing the reading {coreState(floorRead).asOf ?? "from before"}.</p>
          <button type="button" className="btn small" onClick={() => void q.refetch()}>
            Try again
          </button>
        </div>
      )}
      {q.isError && !floor ? (
        <div className="office-error" role="alert">
          <p>The office floor could not be loaded, so nothing here is shown as empty.</p>
          <button type="button" className="btn small" onClick={() => void q.refetch()}>
            Try again
          </button>
        </div>
      ) : !floor ? (
        <p className="office-note">Loading the office floor…</p>
      ) : (
        <div className="office-layout" ref={measure} data-stack={stack ? "" : undefined}>
          <div className="office-scroll">
            {showList ? (
              <PlantList figures={floor.figures} layout={isPlant ? PLANT_LAYOUT : undefined} labels={theme.regions} selected={selected} onSelect={setSelected} />
            ) : (
              <OfficeStage theme={theme} figures={seated} selected={selected} onSelect={setSelected} {...(isPlant ? { instruments } : {})} />
            )}
            {isPlant && !showList && (
              <ul className="plant-legend" aria-label="Zones">
                {PLANT_LAYOUT.zones.map((z) => (
                  <li key={z.id}>
                    <strong>{z.name}</strong>: {z.meaning}
                  </li>
                ))}
              </ul>
            )}
            {floor.figures.length === 0 && (
              <p className="office-note">
                {emptyFloorNote(floor.hidden, coreState(floorRead).asOf)}
                {floor.hidden === 0 && !floorRead.failed && (
                  <>
                    {" "}
                    Work appears here once a released package has a run. <Link to="/packages">Packages</Link>
                  </>
                )}
              </p>
            )}
            {!showList && overflow.length > 0 && (
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
      {choices.length > 0 && (
        <details className="plant-advanced">
          <summary>Advanced</summary>
          <label className="office-theme-choice">
            <span>Archived office themes</span>
            <select value={isPlant ? PLANT_THEME.id : theme.id} disabled={!member} onChange={(e) => chooseTheme(e.target.value)}>
              <option value={PLANT_THEME.id}>None: show the Plant</option>
              {choices.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                  {t.availability === "development" ? " (draft)" : ""}
                </option>
              ))}
            </select>
          </label>
        </details>
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

