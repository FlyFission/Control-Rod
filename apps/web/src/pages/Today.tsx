import { Link } from "@tanstack/react-router";
import { CardLink } from "../components/CardPanel.js";
import { useQuery } from "@tanstack/react-query";
import { api, explain } from "../api/client.js";
import type { AttentionItem } from "../api/types.js";
import { ActiveRunList } from "../components/ActiveRuns.js";
import { AttentionTarget } from "../components/AttentionTarget.js";
import { RiskBand } from "../components/RiskBand.js";
import { InstrumentFrame } from "../design/instruments/InstrumentFrame.js";
import { shortDigest, STATUS_LABEL } from "../lib/format.js";
import { age } from "../lib/office.js";
import { attentionKey } from "../lib/attention.js";
import { brief } from "../lib/today.js";
import "./screens.css";

/** The most needs-you rows the brief lists before it points at the Inbox. */
const LIST_MAX = 5;
const REFRESH_MS = 15000;

/**
 * Today: a shift brief. One headline sentence, three readouts, then what needs you, all above the
 * fold. It reads the Plant's figures and the Inbox (both existing endpoints) beside the packages
 * and recorded runs it always showed. A read that fails is said so and never drawn as zero.
 */
export function Today() {
  const packagesQuery = useQuery({ queryKey: ["packages"], queryFn: () => api.packages() });
  const floorQuery = useQuery({ queryKey: ["office-figures", false], queryFn: () => api.officeFigures(false), refetchInterval: REFRESH_MS });
  const inboxQuery = useQuery({ queryKey: ["inbox", "today"], queryFn: () => api.inbox(), refetchInterval: REFRESH_MS });
  const packages = packagesQuery.data;
  const inbox = inboxQuery.data;
  const b = brief(floorQuery.data, inbox, { floor: floorQuery.isError, inbox: inboxQuery.isError });
  const items = inbox?.items ?? [];
  const inInbox = new Set(items.map((i) => i.package_id).filter((id): id is string => id !== undefined));
  // Drafts and packages in verification that no Inbox item already covers: still the person's to look at.
  const awaitingHuman = (packages ?? []).filter((p) => (p.status === "in-verification" || p.status === "draft") && !inInbox.has(p.id));
  const tone = b.stuck !== undefined && b.stuck > 0 ? "trip" : b.needs !== undefined && b.needs > 0 ? "needs" : "normal";

  return (
    <div className="place today">
      <p className="today-eyebrow">Today</p>

      {packagesQuery.isError && (
        <div role="alert" className="panel error" style={{ marginBottom: "1rem" }}>
          <p>
            {packages === undefined
              ? explain(packagesQuery.error, "The packages could not be loaded.")
              : "The packages could not be refreshed; this view may be out of date."}
          </p>
          <button type="button" className="btn small" onClick={() => void packagesQuery.refetch()}>
            Try again
          </button>
        </div>
      )}

      <div className="today-top">
        <InstrumentFrame label="Shift brief" tone={tone}>
          <div className="today-brief" data-calm={b.calm ? "" : undefined}>
            <div className="today-brief-main">
              <h1 className="today-headline">{b.headline}</h1>
              <dl className="readouts">
                <Readout label="Waiting on you" value={b.needs} tone={b.needs ? "needs" : undefined} />
                <Readout label="Agents working" value={b.working} />
                <Readout label="Stuck" value={b.stuck} tone={b.stuck ? "trip" : undefined} />
              </dl>
              {(floorQuery.isError || inboxQuery.isError) && (
                <p role="status" className="small today-stale">
                  {[inboxQuery.isError ? "The Inbox" : "", floorQuery.isError ? "The plant" : ""].filter(Boolean).join(" and ")} could not be read, so
                  those numbers show a dash rather than zero.{" "}
                  <button type="button" className="btn link small" onClick={() => { void inboxQuery.refetch(); void floorQuery.refetch(); }}>
                    Try again
                  </button>
                </p>
              )}
            </div>
            <Link to="/plant" className="today-plant" aria-label="Open the Plant" data-calm={b.calm ? "" : undefined}>
              <img src="/plant/base-1440.webp" alt="" loading="lazy" decoding="async" />
              <span className="today-plant-caption" aria-hidden="true">{b.calm ? "Plant at rest" : "Plant"}</span>
            </Link>
          </div>
        </InstrumentFrame>
      </div>

      <div className="today-cols">
        <section className="today-needs" aria-labelledby="today-needs-title">
          <h2 id="today-needs-title" className="today-h2">
            Needs you{b.needs ? <span className="mono today-count"> {b.needs}</span> : null}
          </h2>
          {inboxQuery.isLoading && <p className="muted">Loading</p>}
          {inbox !== undefined && !inboxQuery.isError && items.length === 0 && (
            <div className="calm" role="status">
              <span className="calm-tick" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="22" height="22" focusable="false"><path d="M5 12.5 10 17.5 19 7" /></svg>
              </span>
              <div>
                <p className="calm-title">Nothing needs you.</p>
                <p className="muted small">Decisions and held work arrive here as they need you. The agents carry on.</p>
              </div>
            </div>
          )}
          {items.length > 0 && (
            <ol className="needs-list" aria-label={`${items.length} waiting on you`}>
              {items.slice(0, LIST_MAX).map((item) => (
                <NeedRow key={attentionKey(item)} item={item} />
              ))}
            </ol>
          )}
          {items.length > LIST_MAX && (
            <p className="small">
              <Link to="/inbox">{items.length - LIST_MAX} more in the Inbox</Link>
            </p>
          )}
          {awaitingHuman.length > 0 && (
            <>
              <h2 className="today-h2 today-h2-quiet">In review ({awaitingHuman.length})</h2>
              <ul className="today-list">
                {awaitingHuman.map((p) => (
                  <li key={p.id} className="today-row">
                    <CardLink id={p.id} className="today-link">
                      {p.title || p.id}
                    </CardLink>
                    <span className="pill">{STATUS_LABEL[p.status] ?? p.status}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
        <section className="today-runs" aria-label="Active runs">
          <ActiveRunList />
        </section>
      </div>
    </div>
  );
}

function Readout({ label, value, tone }: { label: string; value: number | undefined; tone?: "needs" | "trip" | undefined }) {
  return (
    <div className="readout" data-tone={tone}>
      <dt>{label}</dt>
      <dd className="mono" aria-label={value === undefined ? `${label}: not known` : undefined}>
        {value ?? "–"}
      </dd>
    </div>
  );
}

function NeedRow({ item }: { item: AttentionItem }) {
  return (
    <li className="need-row">
      <RiskBand item={item} />
      <div className="need-main">
        <AttentionTarget item={item} className="need-title" label={item.title} />
        <p className="need-meta small muted">
          <span className="need-risk">{item.risk.label}</span>
          <span>waiting {age(item.since)}</span>
          {item.subject_digest !== undefined && <span className="mono">{shortDigest(item.subject_digest)}</span>}
        </p>
      </div>
    </li>
  );
}
