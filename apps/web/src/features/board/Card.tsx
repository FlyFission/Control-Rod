import type { WorkPackage } from "../../api/types.js";
import type { ColumnId } from "../../lib/board.js";
import { needsIndependentCheck } from "../../lib/board.js";
import type { Kind } from "../../lib/kind.js";
import type { NextLine } from "../../lib/next.js";

const KIND_WORD: Record<Kind, string> = { code: "Code", doc: "Document" };
const KIND_ICON: Record<Kind, string> = { code: "</>", doc: "☰" };

/** One fixed symbol and word per tone; the symbols belong to the meaning, never to a lens. */
const TONE: Record<NextLine["tone"], { symbol: string; word: string }> = {
  needs: { symbol: "▲", word: "Needs you" },
  block: { symbol: "✕", word: "Blocked" },
  ok: { symbol: "✓", word: "Done" },
  wait: { symbol: "○", word: "Waiting" },
};

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
   * "unknown" shows it as last known.
   */
  stream?: "connecting" | "live" | "unknown";
};

/** A board card: the small fixed core of spec 6.2. No drag; the title opens the package. */
export function Card({ pkg, kinds, next, column, onOpen, owner, stream = "live" }: CardProps) {
  const agent = pkg.agent_assignment[0]?.agent_baseline;
  const tone = TONE[next.tone];
  return (
    <article className="bd-card" data-kind={kinds[0]} data-column={column} data-tone={stream === "live" ? next.tone : "unknown"}>
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
      <button type="button" className="bd-title" onClick={onOpen}>
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
        {stream === "live" ? (
          <>
            <span className="bd-sym">
              <span aria-hidden="true">{tone.symbol} </span>
              {next.tone === "ok" ? null : <span className="bd-word">{tone.word}: </span>}
            </span>
            <span>{next.text}</span>
          </>
        ) : stream === "unknown" ? (
          <span className="muted">Status unknown. Last known: {next.text}</span>
        ) : (
          <span className="muted">{next.text}</span>
        )}
      </p>
    </article>
  );
}
