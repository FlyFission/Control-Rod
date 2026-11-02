import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { AttentionItem, InboxView } from "../api/types.js";
import { StateMark, type StateKind } from "../components/StateMark.js";
import { age } from "../lib/office.js";
import { lastSeenKey, readNumber, writeNumber } from "../lib/storage.js";

const KIND_LABEL: Record<AttentionItem["kind"], string> = {
  scram: "SCRAM",
  confirm: "Confirm requirements",
  permission: "Waiting agent",
  lost: "Lost run",
  dispute: "Dispute",
  accept: "Accept",
  release: "Release",
};

/** A mark by gate risk, shape as well as colour: a security hold or held agent is stuck, a decision needs you. */
const markFor = (item: AttentionItem): StateKind =>
  item.kind === "scram" || item.kind === "lost" ? "stuck" : item.kind === "permission" || item.kind === "dispute" ? "changed" : "needs";

const DECISION_WORDS: Record<string, string> = {
  confirm: "confirm the requirements",
  release: "release", accept: "accept", "accept-with-findings": "accept with findings", return: "return", reject: "reject",
};

/**
 * Inbox (specification 12; plan task 3.3): what waits on you, by gate risk then age, each decision
 * saying exactly what a signature binds; what waits on someone else, apart and never counted as
 * yours (OV-01); and the "since you last looked" digest (OV-09), counted from the last event this
 * browser marked seen.
 */
export function Inbox() {
  const session = useQuery({ queryKey: ["session"], queryFn: api.session });
  const user = session.data?.user ?? undefined;
  const cursorKey = lastSeenKey(user);
  // Read for the signed-in person on every render, so a cursor is never used or written for anyone else.
  const [, rerender] = useState(0);
  const lastSeen = user === undefined ? undefined : readNumber(cursorKey);
  // Moving the cursor (first visit, Mark as seen) keeps showing the list while the new digest loads.
  const q = useQuery({ queryKey: ["inbox", user ?? "", lastSeen ?? null], queryFn: () => api.inbox(lastSeen), placeholderData: (previous) => previous, enabled: user !== undefined });
  const rt = useQuery({ queryKey: ["runtimes"], queryFn: api.runtimes });
  const notReady = (rt.data?.runtimes ?? []).filter((r) => !r.ready);
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

  return (
    <div className="place inbox">
      <section className="panel" aria-labelledby="inbox-title">
        <div className="panel-head">
          <h1 id="inbox-title">Inbox</h1>
          <span className="muted small">Riskiest first: security holds, waiting agents, unknown outcomes, disputes, then decisions by consequence; oldest first within each.</span>
        </div>
        {notReady.length > 0 && (
          <ul className="runtime-alerts" aria-label="Runtimes not ready">
            {notReady.map((r) => (
              <li key={r.runtime} className="error">
                <strong>{r.runtime} is not ready and is not offered for work.</strong> {r.reason ?? "The daemon gave no reason."}
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
        {q.isSuccess && view !== undefined && view.items.length === 0 && <p className="muted">Nothing waits on you. Decisions and held work arrive here as they need you.</p>}
        {view !== undefined && view.items.length > 0 && (
          <ol className="office-list" aria-label={`${view.items.length} waiting on you`}>
            {view.items.map((item) => (
              <Item key={itemKey(item)} item={item} />
            ))}
          </ol>
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
  );
}

const itemKey = (i: AttentionItem) => `${i.kind}-${i.package_id ?? i.scram_id ?? i.capture_id}-${i.package_revision ?? ""}`;

function Item({ item, theirs = false }: { item: AttentionItem; theirs?: boolean }) {
  const decisions = (item.decisions ?? []).map((d) => DECISION_WORDS[d] ?? d);
  return (
    <li className={`office-item${theirs ? " theirs" : ""}`}>
      <div className="office-meta">
        <StateMark kind={theirs ? "waiting" : markFor(item)} title={item.risk.label} />
        <span className="tag">{item.risk.label}</span>
        <span className="muted small">{KIND_LABEL[item.kind]}</span>
        {item.package_id !== undefined && (
          <span className="mono small muted">
            {item.package_id} rev {item.package_revision}
          </span>
        )}
        <span className="muted small">waiting {age(item.since)}</span>
      </div>
      <p className="office-title">{item.title}</p>
      <p className="muted">{item.detail}</p>
      {item.binds !== undefined && <p className="binds small">{item.binds}</p>}
      {theirs ? (
        <p className="small">
          Waiting on {item.waiting_on}.{item.reason !== undefined && <span className="muted"> {item.reason}.</span>}
        </p>
      ) : (
        <div className="item-actions">
          <Target item={item} />
          {decisions.length > 0 && <span className="muted small">You may {decisions.join(", ")}.</span>}
        </div>
      )}
    </li>
  );
}

function Target({ item }: { item: AttentionItem }) {
  const label =
    item.kind === "scram" ? "Open SCRAM commands"
    : item.kind === "confirm" ? "Open and confirm"
    : item.capture_id !== undefined ? (item.href.to === "/roster" ? "Open the roster" : "Open Packages")
    : item.binds !== undefined ? "Open and decide"
    : "Open the runs";
  if (item.href.to === "/packages/$id" && item.href.id !== undefined)
    return (
      <Link to="/packages/$id" params={{ id: item.href.id }} {...(item.href.hash ? { hash: item.href.hash } : {})} className="btn primary small">
        {label}
      </Link>
    );
  return (
    <Link to={item.href.to} {...(item.href.hash ? { hash: item.href.hash } : {})} className="btn primary small">
      {label}
    </Link>
  );
}

/** The six line digest, in words (OV-09). */
function Digest({ view, lastSeen, onMarkSeen }: { view: InboxView | undefined; lastSeen: number | undefined; onMarkSeen: () => void }) {
  const lines = view?.digest.lines ?? [];
  return (
    <section className="panel" aria-labelledby="since-title">
      <h2 id="since-title">Since you last looked</h2>
      {view === undefined ? (
        <p className="muted">Loading</p>
      ) : lastSeen === undefined || lines.length === 0 ? (
        <p className="muted">First visit on this browser. What happens from now on collects here.</p>
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
