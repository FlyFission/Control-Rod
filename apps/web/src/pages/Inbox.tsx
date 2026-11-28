import { plainItem } from "../lib/plainError.js";
import { AGENTS } from "../lib/agents.js";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { api } from "../api/client.js";
import type { AttentionItem, InboxView } from "../api/types.js";
import { StateMark } from "../components/StateMark.js";
import { BoardReviewDrawer } from "../features/board/BoardReviewDrawer.js";
import { useMode } from "../lib/mode.js";
import { age } from "../lib/office.js";
import { lastSeenKey, readNumber, writeNumber } from "../lib/storage.js";
import { attentionKey } from "../lib/attention.js";
import { NotifyToggle } from "../components/NotifyToggle.js";
import { AttentionTarget } from "../components/AttentionTarget.js";
import { RiskBand } from "../components/RiskBand.js";
import { shortDigest } from "../lib/format.js";
import "./screens.css";


/**
 * Inbox (specification 12; plan task 3.3): what waits on you, by gate risk then age, each decision
 * saying exactly what a signature binds; what waits on someone else, apart and never counted as
 * yours (OV-01); and the "since you last looked" digest (OV-09), counted from the last event this
 * browser marked seen.
 */
export function Inbox() {
  const mode = useMode();
  const [selectedPkgId, setSelectedPkgId] = useState<string | null | undefined>(undefined);
  const session = useQuery({ queryKey: ["session"], queryFn: api.session });
  const user = session.data?.user ?? undefined;
  const cursorKey = lastSeenKey(user);
  // Read for the signed-in person on every render, so a cursor is never used or written for anyone else.
  const [, rerender] = useState(0);
  const lastSeen = user === undefined ? undefined : readNumber(cursorKey);
  // Moving the cursor (first visit, Mark as seen) keeps showing the list while the new digest loads.
  const q = useQuery({ queryKey: ["inbox", user ?? "", lastSeen ?? null], queryFn: () => api.inbox(lastSeen), placeholderData: (previous) => previous, enabled: user !== undefined });
  const rt = useQuery({ queryKey: ["runtimes"], queryFn: api.runtimes });
  const setup = useQuery({ queryKey: ["setup"], queryFn: api.setup });
  // Only agents that would be given work and can't take it: one Control Rod can't run yet, or one the
  // person took off the table on Setup, waits on nobody, so it is no alert here (Setup lists it).
  const notReady = (rt.data?.runtimes ?? []).filter(
    (r) =>
      !r.ready &&
      AGENTS.find((a) => a.id === r.runtime)?.runnable === true &&
      setup.data?.seats.find((s) => s.runtime === r.runtime)?.seated !== false,
  );
  const view: InboxView | undefined = q.data;

  // A first visit on this browser starts counting from now.
  useEffect(() => {
    if (user !== undefined && lastSeen === undefined && view !== undefined && !q.isPlaceholderData) {
      writeNumber(cursorKey, view.digest.head);
      rerender((n) => n + 1);
    }
  }, [user, lastSeen, view, cursorKey, q.isPlaceholderData]);

  function markSeen() {
    if (view === undefined || user === undefined) return;
    writeNumber(cursorKey, view.digest.head);
    rerender((n) => n + 1);
  }

  // Clear explicit selection if that package leaves the inbox (e.g. after completion or refresh).
  const selectedMissing =
    typeof selectedPkgId === "string" &&
    view !== undefined &&
    !view.items.some((i) => i.package_id === selectedPkgId);

  useEffect(() => {
    if (selectedMissing) {
      setSelectedPkgId(null);
    }
  }, [selectedMissing]);

  // The review drawer is the docked cockpit and covers most of the page at 1440, so it opens only when
  // the person asks to inspect an item, never by itself; the list stays readable until then.
  const activePkgId = selectedMissing || typeof selectedPkgId !== "string" ? null : selectedPkgId;

  // Closing the drawer returns focus to the "Inspect and sign" button that opened it, never to the page body.
  const openedFrom = useRef<string | null>(null);
  useEffect(() => {
    if (activePkgId !== null) {
      openedFrom.current = activePkgId;
      return;
    }
    const id = openedFrom.current;
    openedFrom.current = null;
    if (id === null) return;
    const opener = [...document.querySelectorAll<HTMLElement>("[data-inspect-for]")].find((el) => el.dataset.inspectFor === id);
    if (opener && (document.activeElement === null || document.activeElement === document.body)) opener.focus();
  }, [activePkgId]);

  const row = (item: AttentionItem) => (
    <Item
      key={itemKey(item)}
      item={item}
      selected={item.package_id !== undefined && item.package_id === activePkgId}
      onInspect={item.package_id !== undefined ? () => setSelectedPkgId(item.package_id!) : undefined}
    />
  );

  return (
    <div className={activePkgId ? "place inbox inbox-has-drawer" : "place inbox"}>
      <div className="inbox-main">
        <section className="panel" aria-labelledby="inbox-title">
          <div className="panel-head">
            <h1 id="inbox-title">Inbox</h1>
            <span className="muted small">Most urgent first.</span>
          </div>
          <NotifyToggle user={user} />
          {notReady.length > 0 && (
            <ul className="runtime-alerts" aria-label="Agents not ready">
              {notReady.map((r) => (
                <li key={r.runtime} className="error">
                  <strong>{agentDisplayName(r.runtime)} can't take work right now.</strong> {sentence(r.reason) ?? "Control Rod's check did not say why."}{" "}
                  <Link to="/setup">Open Setup</Link> to fix it.
                </li>
              ))}
            </ul>
          )}
          {q.isLoading && <p className="muted">Loading</p>}
          {q.isError && (
            <div role="alert" className="error">
              <p>{view === undefined ? "The Inbox could not be loaded." : "The Inbox could not be refreshed; what follows may be out of date."}</p>
              <button type="button" className="btn small" onClick={() => void q.refetch()}>
                Try again
              </button>
            </div>
          )}
          {q.isSuccess && view !== undefined && view.items.length === 0 && (
            <div className="calm calm-large" role="status">
              <span className="calm-tick" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="28" height="28" focusable="false"><path d="M5 12.5 10 17.5 19 7" /></svg>
              </span>
              <div>
                <p className="calm-title">Nothing waits on you.</p>
                <p className="muted">Decisions and held work arrive here as they need you, riskiest first.</p>
              </div>
            </div>
          )}
          {view !== undefined && view.items.length > 0 && (
            <ol className="office-list inbox-list" aria-label={`${view.items.length} waiting on you`}>
              {view.items.slice(0, VISIBLE).map(row)}
            </ol>
          )}
          {view !== undefined && view.items.length > VISIBLE && (
            // Focus writing rule 8: five in view, most urgent first; the rest are one press away, never dropped.
            <details className="inbox-rest">
              <summary>
                Show {view.items.length - VISIBLE} more <span className="muted">(less urgent)</span>
              </summary>
              <ol className="office-list inbox-list" start={VISIBLE + 1}>
                {view.items.slice(VISIBLE).map(row)}
              </ol>
            </details>
          )}
          {view !== undefined && view.waiting_on_others.length > 0 && (
            <details className="waiting-others">
              <summary>
                Waiting on someone else <span className="muted">({view.waiting_on_others.length})</span>
              </summary>
              <ol className="office-list">
                {view.waiting_on_others.map((item) => (
                  <Item key={itemKey(item)} item={item} theirs />
                ))}
              </ol>
            </details>
          )}
        </section>
        <Digest view={view} lastSeen={lastSeen} onMarkSeen={markSeen} />
      </div>
      {activePkgId !== null && (
        <BoardReviewDrawer
          packageId={activePkgId}
          mode={mode}
          autoFocus
          onClose={() => setSelectedPkgId(null)}
        />
      )}
    </div>
  );
}

const itemKey = attentionKey;
/** Items the Inbox shows before folding the rest under "Show N more". */
const VISIBLE = 5;

function Item({
  item,
  theirs = false,
  selected = false,
  onInspect,
}: {
  item: AttentionItem;
  theirs?: boolean;
  selected?: boolean;
  onInspect?: (() => void) | undefined;
}) {
  const said = plainItem(item);
  return (
    <li className={`office-item inbox-item${theirs ? " theirs" : ""}${selected ? " inbox-selected" : ""}`}>
      {!theirs && <RiskBand item={item} />}
      <div className="inbox-item-body">
      <div className="office-meta">
        {theirs && <StateMark kind="waiting" title={item.risk.label} />}
        <span className="tag">{said.label}</span>
        <span className="muted small">waiting {age(item.since)}</span>
      </div>
      <p className="office-title">{item.title}</p>
      <p className="muted">{said.detail}</p>
      {(item.binds !== undefined || item.package_id !== undefined) && (
        <details className="inbox-more small">
          <summary className="muted">Details</summary>
          {item.package_id !== undefined && (
            <p className="mono muted">
              {item.package_id} · version {(item.package_revision ?? 0) + 1}
              {item.subject_digest !== undefined && <> · {shortDigest(item.subject_digest)}</>}
            </p>
          )}
          {said.raw && <p className="muted">{said.raw}</p>}
          {item.binds !== undefined && <p className="binds">{item.binds}</p>}
        </details>
      )}
      {theirs ? (
        <p className="small">
          Waiting on {item.waiting_on}.{item.reason !== undefined && <span className="muted"> {item.reason}.</span>}
        </p>
      ) : (
        <div className="item-actions">
          {/* One way in: the card, unless the item points somewhere more exact, such as its runs. */}
          {onInspect && !item.href?.hash ? (
            <button type="button" className="btn small primary" data-inspect-for={item.package_id} onClick={onInspect} aria-pressed={selected}>
              Open
            </button>
          ) : (
            <Target item={item} />
          )}
        </div>
      )}
      </div>
    </li>
  );
}

function Target({ item }: { item: AttentionItem }) {
  return <AttentionTarget item={item} className="btn small" />;
}

/** The six line digest, in words (OV-09). */
function Digest({ view, lastSeen, onMarkSeen }: { view: InboxView | undefined; lastSeen: number | undefined; onMarkSeen: () => void }) {
  const lines = view?.digest.lines ?? [];
  return (
    <section className="panel" aria-labelledby="since-title">
      <h2 id="since-title">Since you last looked</h2>
      {view === undefined ? (
        <p className="muted">Loading</p>
      ) : lastSeen === undefined ? (
        <p className="muted">First visit on this browser. What happens from now on collects here.</p>
      ) : lines.length === 0 ? (
        <p className="muted">Nothing new since you last looked.</p>
      ) : (
        <ul className="digest">
          {lines.map((l) => (
            <li key={l.topic} className={l.count > 0 ? "active" : "quiet"}>
              {l.text}
            </li>
          ))}
        </ul>
      )}
      {view !== undefined && lines.length > 0 && (
        <button type="button" className="btn ghost small" onClick={onMarkSeen} disabled={view.digest.head === lastSeen}>
          Mark as seen
        </button>
      )}
    </section>
  );
}

export { plainItem };

/** The daemon's reason as a sentence that ends in a full stop, or undefined when there is none. */
function sentence(reason: string | undefined): string | undefined {
  const r = reason?.trim();
  if (!r) return undefined;
  const s = r.charAt(0).toUpperCase() + r.slice(1);
  return /[.!?]$/.test(s) ? s : `${s}.`;
}

function agentDisplayName(runtime: string): string {
  return AGENTS.find((a) => a.id === runtime)?.name ?? runtime;
}
