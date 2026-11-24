import type { AgentId } from "../lib/agents.js";
import { agentIdForProvider } from "../lib/agents.js";

/**
 * A small badge for who is doing the work: the agent's own glyph when the run's provider is known
 * (lib/agents.ts), the generic agent glyph for a provider it does not list, and a role glyph when
 * no runtime is recorded. The glyphs are plain geometry drawn for this app, one stroke weight, so
 * they read at 14 px and never stand for a vendor's trademark. The badge is decoration: the
 * figure's accessible name already says who and what.
 */

/** Glyph paths on a 16 x 16 grid, stroked in the current colour. */
const AGENT_GLYPH: Record<AgentId | "generic", string> = {
  claude: "M8 1.5V14.5M2.4 4.75 13.6 11.25M2.4 11.25 13.6 4.75", // asterisk
  codex: "M5.5 4 1.5 8l4 4M10.5 4l4 4-4 4", // angle brackets
  agy: "M8 2 14 13.5H2Z", // peak
  grok: "M3 3l10 10M13 3 3 13", // cross
  opencode: "M5 2.5H3v11h2M11 2.5h2v11h-2", // square brackets
  ollama: "M3 13V7a5 5 0 0 1 10 0v6M6 13V9M10 13V9", // arch
  generic: "M4 4h8v8H4ZM8 1.5V4M8 12v2.5M1.5 8H4M12 8h2.5", // chip
};

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

export function AgentBadge({ runtime, role, size = 14 }: { runtime?: string | undefined; role?: string | undefined; size?: number }) {
  const known = agentIdForProvider(runtime);
  const d = runtime ? AGENT_GLYPH[known ?? "generic"] : (ROLE_GLYPH[role ?? ""] ?? ROLE_GLYPH["other"]!);
  return (
    <svg
      className="agent-badge"
      data-badge={runtime ? (known ?? "generic") : `role-${role ?? "other"}`}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
