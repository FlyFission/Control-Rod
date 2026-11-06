import type { WorkPackage } from "../../api/types.js";
import type { ColumnId } from "../../lib/board.js";
import { needsIndependentCheck } from "../../lib/board.js";
import type { Kind } from "../../lib/kind.js";
import type { NextLine } from "../../lib/next.js";

const KIND_WORD: Record<Kind, string> = { code: "Code", doc: "Document" };
const KIND_ICON: Record<Kind, string> = { code: "</>", doc: "☰" };

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

function initials(name: string): string {
  const parts = name.split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts.slice(0, 2).map((s) => s[0]) : [name.slice(0, 2)];
  return letters.join("").toUpperCase();
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
};

/** A board card: the small fixed core of spec 6.2. No drag; the title opens the package. */
export function Card({ pkg, kinds, next, column, onOpen, owner, stream = "live", unknownSince, onRetry, lastKnown = false }: CardProps) {
  const agent = pkg.agent_assignment[0]?.agent_baseline;
  const tone = TONE[next.tone];
  const titleId = `bd-card-${pkg.id}`;
  return (
    <article aria-labelledby={titleId} className="bd-card" data-kind={kinds[0]} data-column={column} data-tone={stream === "live" && !lastKnown ? next.tone : "unknown"}>
      <div className="bd-kinds">
        {kinds.map((k) => (
          <span key={k} className="bd-kind" data-kind={k}>
            <span aria-hidden="true" className="bd-kind-icon">
              {KIND_ICON[k]}
            </span>
            {KIND_WORD[k]}
          </span>
        ))}
      </div>
      <button type="button" id={titleId} className="bd-title" onClick={onOpen}>
        {pkg.title}
      </button>
      <span className="bd-id mono small muted">
        {pkg.id} rev {pkg.revision}
      </span>
      <div className="bd-meta">
        {owner && (
          <span className="bd-avatar" title={`Owner: ${owner}`}>
            <span aria-hidden="true">{initials(owner)}</span>
            <span className="sr-only">Owner {owner}</span>
          </span>
        )}
        {agent && (
          <span className="bd-avatar bd-agent" title={`Agent: ${agent}`}>
            <span aria-hidden="true">{initials(agent)}</span>
            <span className="sr-only">Agent {agent}</span>
          </span>
        )}
        <span className="bd-chip">{pkg.grade ?? "general-service"}</span>
        {needsIndependentCheck(pkg) && (
          <span className="bd-check">
            <span aria-hidden="true">{"◆"} </span>
            Independent check
          </span>
        )}
      </div>
      <p className="bd-next">
        {stream === "live" && lastKnown ? (
          <span className="muted">Last known: {next.text}</span>
        ) : stream === "live" ? (
          <>
            <span className="bd-sym">
              <span aria-hidden="true">{tone.symbol} </span>
              {tone.word ? <span className="bd-word">{tone.word}: </span> : null}
            </span>
            <span>{next.text}</span>
          </>
        ) : stream === "unknown" ? (
          <span className="muted">Status unknown since {sinceText(unknownSince)}</span>
        ) : (
          <span className="muted">{next.text}</span>
        )}
      </p>
      {onRetry && stream !== "unknown" && (
        <button type="button" className="btn small bd-retry" onClick={onRetry}>
          Retry
        </button>
      )}
    </article>
  );
}
