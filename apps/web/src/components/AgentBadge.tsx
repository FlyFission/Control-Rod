import type { AgentId } from "../lib/agents.js";
import { AGENTS, agentIdForProvider } from "../lib/agents.js";
import { AgentMark } from "./AgentMark.js";

/**
 * A small badge for who is doing the work. An agent Control Rod lists shows its product mark, the same
 * AgentMark the workflow diagram and the seats use (lib/agentMarks.ts is the one map). A provider it
 * does not list, or a user-named model, shows the generic chip glyph on the same tile, never another
 * vendor's logo. With no runtime recorded it shows a role glyph. The badge is decoration unless given a
 * `label`: the figure's accessible name already says who and what.
 */

/** The generic glyph on a 16 x 16 grid, stroked in the current colour. */
const GENERIC_GLYPH = "M4 4h8v8H4ZM8 1.5V4M8 12v2.5M1.5 8H4M12 8h2.5"; // chip
/** Role glyphs, for a figure whose run records no runtime: one per RunRole, and a fallback. */
const ROLE_GLYPH: Record<string, string> = {
  intake: "M2 4h12M4 8h8M6 12h4", // funnel
  author: "M3 13l1-3.5L11 2.5l2.5 2.5L6.5 12ZM3 13l3.5-1", // pen
  "pre-check": "M2.5 8.5l3.5 3.5 7.5-8", // tick
  "requirements-preparer": "M3 2.5h10v11H3ZM5.5 6h5M5.5 9h5", // sheet
  "technical-preparer": "M2 13.5V8M6 13.5V4M10 13.5V6.5M14 13.5V2.5", // bars
  other: "M8 2v12M2 8h12",
};

export function roleWord(role: string | undefined): string {
  return role ? role.replace(/-/g, " ") : "agent";
}

export function AgentBadge({ runtime, role, size = 16, label }: { runtime?: string | undefined; role?: string | undefined; size?: number; label?: string | undefined }) {
  const known: AgentId | undefined = agentIdForProvider(runtime);
  if (runtime) {
    const name = label ?? (known ? AGENTS.find((a) => a.id === known)?.name : undefined) ?? runtime;
    return (
      <span className="agent-badge" data-badge={known ?? "generic"} style={{ display: "inline-flex" }}>
        <AgentMark
          id={known ?? runtime}
          name={name}
          size={size}
          label={label}
          fallback={
            <svg className="agent-mark-glyph" viewBox="0 0 16 16" focusable="false">
              <path d={GENERIC_GLYPH} />
            </svg>
          }
        />
      </span>
    );
  }
  const d = ROLE_GLYPH[role ?? ""] ?? ROLE_GLYPH["other"]!;
  return (
    <svg className="agent-badge" data-badge={`role-${role ?? "other"}`} width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
