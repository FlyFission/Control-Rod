import { AGENTS } from "../../lib/agents.js";
import { type ReactNode, useEffect, useState } from "react";
import type { WorkPackage } from "../../api/types.js";
import type { ColumnId } from "../../lib/board.js";
import { needsIndependentCheck } from "../../lib/board.js";
import type { Kind } from "../../lib/kind.js";
import type { NextLine } from "../../lib/next.js";
import { AgentBadge } from "../../components/AgentBadge.js";
import { elapsedText } from "../../lib/format.js";
import { showsRunSpinner } from "./boardOrder.js";


/** One fixed symbol and word per tone; the symbols belong to the meaning, never to a lens. */
const TONE: Record<NextLine["tone"], { symbol: string; word?: string }> = {
  needs: { symbol: "▲", word: "Needs you" },
  block: { symbol: "✕", word: "Blocked" },
  // The ok line's own text ("Accepted", "Closed") is its word.
  ok: { symbol: "✓" },
  wait: { symbol: "○", word: "Waiting" },
};

/** A time of day for "Status unknown since", or a plain phrase when the time is not known. */
export function sinceText(iso: string | undefined): string {
  if (!iso) return "an unknown time";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "an unknown time" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** "12 min" since a run started, redrawn each 30 s while mounted; nothing ticks in a hidden tab. */
export function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState !== "hidden") setNow(Date.now());
    }, 30_000);
    return () => clearInterval(t);
  }, []);
  const start = Date.parse(since);
  return Number.isNaN(start) ? null : <span className="mono bd-elapsed">{elapsedText(now - start)}</span>;
}

export type CardProps = {
  pkg: WorkPackage;
  kinds: Kind[];
  next: NextLine;
  column: ColumnId;
  onOpen: () => void;
  owner?: string;
  /**
   * The event stream. Only "live" shows the symbol and meaning word; "connecting" shows the line plainly;
   * "unknown" replaces it with "Status unknown since <time>" (spec 8, ruling 13).
   */
  stream?: "connecting" | "live" | "unknown";
  /** When the stream dropped, for the unknown line. */
  unknownSince?: string;
  /** Reads again what the next line could not read. */
  onRetry?: () => void;
  /** A read behind the card has not succeeded since the latest stream drop: its line is last known. */
  lastKnown?: boolean;
  /** Whether this card is currently open in the Board Review Drawer. */
  selected?: boolean;
  /** The brief carries the Nuclear context: the card shows one small badge. */
  nuclear?: boolean;
  /** The card's actions (primary decision and Move to), shown under the next line. */
  actions?: ReactNode;
  /** Left-edge color from the active `colorBy` lens (never a meaning token). */
  edgeColor?: string;
  /** Compact density shows one line: a status mark and the title (the next line is the hover text). */
  compact?: boolean;
  /** Set when intake turned one request into several cards: this card's place and the request. */
  split?: { index: number; total: number; request: string };
  /** An agent run on this card is running now, as last read; queued alone does not count. */
  runRunning?: boolean;
  /** Runtime providers of the author and checker runs, for their icons. */
  author?: string;
  checker?: string;
};

/** A board card: the small fixed core of spec 6.2. The title opens the review drawer. */
export function Card({ pkg, kinds, next, column, onOpen, owner, stream = "live", unknownSince, onRetry, lastKnown = false, selected = false, nuclear = false, actions, edgeColor, compact = false, runRunning = false, author, checker, split }: CardProps) {
  const agent = pkg.agent_assignment[0]?.agent_baseline;
  const tone = TONE[next.tone];
  const titleId = `bd-card-${pkg.id}`;
  const check = needsIndependentCheck(pkg);
  const spin = showsRunSpinner({ runRunning, lastKnown }, stream);
  if (compact) {
    // Compact is one line: a status mark and the name. The next line stays for screen readers and
    // as the hover text; everything else is one click away in the drawer.
    const live = stream === "live" && !lastKnown;
    const said = stream === "unknown" ? `Status unknown since ${sinceText(unknownSince)}` : lastKnown ? `Last known: ${next.text}` : `${tone.word ? `${tone.word}: ` : ""}${next.text}`;
    return (
      <article
        aria-labelledby={titleId}
        className={selected ? "bd-card bd-card-compact selected" : "bd-card bd-card-compact"}
        data-kind={kinds[0]}
        data-column={column}
        data-tone={live ? next.tone : "unknown"}
        style={edgeColor ? { borderLeftColor: edgeColor } : undefined}
        title={said}
      >
        <span className={spin ? "bd-sym bd-live" : "bd-sym"} aria-hidden="true">
          {spin ? "\u25cf" : live ? tone.symbol : "\u25cb"}
        </span>
        <button type="button" id={titleId} className="bd-title" onClick={onOpen}>
          {pkg.title}
        </button>
        <p className="bd-next sr-only">{said}</p>
      </article>
    );
  }
  return (
    <article
      aria-labelledby={titleId}
      className={selected ? "bd-card selected" : "bd-card"}
      data-kind={kinds[0]}
      data-column={column}
      data-tone={stream === "live" && !lastKnown ? next.tone : "unknown"}
      style={edgeColor ? { borderLeftColor: edgeColor } : undefined}
    >
      <button type="button" id={titleId} className="bd-title" onClick={onOpen}>
        {pkg.title}
      </button>
      {split && (
        <p className="bd-split small muted" title={split.request ? `From your request: ${split.request}` : undefined}>
          Card {split.index} of {split.total} from one request
          {split.request ? <>: <span className="bd-split-request">{split.request}</span></> : null}
        </p>
      )}
      <p className="bd-next">
        {stream === "live" && lastKnown ? (
          <span className="muted">Last known: {next.text}</span>
        ) : stream === "live" ? (
          <>
            {spin ? (
              // A run executing now is live, not waiting: a lit dot, no "Waiting" word.
              <span className="bd-sym bd-live" aria-hidden="true">{"\u25cf "}</span>
            ) : (
              <span className="bd-sym">
                <span aria-hidden="true">{tone.symbol} </span>
                {tone.word ? <span className="bd-word">{tone.word}: </span> : null}
              </span>
            )}
            <span>{next.text}</span>
            {next.since && spin && (
              <>
                <span aria-hidden="true">, </span>
                <Elapsed since={next.since} />
              </>
            )}
          </>
        ) : stream === "unknown" ? (
          <span className="muted">Status unknown since {sinceText(unknownSince)}</span>
        ) : (
          <span className="muted">{next.text}</span>
        )}
      </p>
      {stream === "live" && !lastKnown && next.detail && <p className="bd-next-detail small muted">{next.detail}</p>}
      {spin && (
        <span className="bd-progress" role="img" aria-label="Agent running">
          <span aria-hidden="true" />
        </span>
      )}
      {actions}
      {onRetry && stream !== "unknown" && (
        <button type="button" className="btn small bd-retry" onClick={onRetry}>
          Retry
        </button>
      )}
      {/*
        Focus order (docs/reading-comfort.md): title, what happens next, the one action, then the
        quiet facts. The kind shows in the filter and the drawer; the owner shows in the drawer.
      */}
      <div className="bd-meta bd-meta-quiet">
        {pkg.grade && pkg.grade !== "general-service" && <span className="bd-grade">{pkg.grade}</span>}
        {nuclear && <span className="bd-nuclear">Nuclear</span>}
        {check && (
          <span className="bd-check">
            <span aria-hidden="true">{"\u25c6"} </span>
            Independent check
          </span>
        )}
        <span className="bd-id mono">
          {pkg.id}
          {pkg.revision > 0 ? ` · version ${pkg.revision + 1}` : ""}
        </span>
        <span className="bd-meta-end">
          {owner && <span className="sr-only">Owner {owner}</span>}
          {/* An agent icon only once a real agent has the work; a role's initials ("SA") mean nothing at a glance. */}
          {author ? (
            <span className="bd-agent-icon" title={`${agentWord(author)} does the work`}>
              <AgentBadge runtime={author} size={18} />
              <span className="sr-only">Author agent {author}</span>
            </span>
          ) : (
            agent && !checker && <span className="sr-only">Agent {agent}</span>
          )}
          {checker && (
            <span className="bd-agent-icon bd-agent-checker" title={`${agentWord(checker)} checks it`}>
              <AgentBadge runtime={checker} size={18} />
              <span className="sr-only">Checker agent {checker}</span>
            </span>
          )}
        </span>
      </div>
    </article>
  );
}

/** An agent's short name for a tooltip, as the column pickers say it. */
function agentWord(provider: string): string {
  // A run not yet handed out has no agent: the first one free takes it.
  if (provider === "any") return "The first free agent";
  return AGENTS.find((a) => a.id === provider)?.name.replace(/ (Code|CLI)$/, "") ?? provider;
}
