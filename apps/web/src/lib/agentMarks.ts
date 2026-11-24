import type { AgentId } from "./agents.js";

/**
 * Each built-in agent's own mark, so a person recognises who sits in a seat at a glance.
 *
 * The vectors are Lobe Icons (@lobehub/icons-static-svg 1.106.0, MIT, Copyright (c) LobeHub), copied
 * unchanged apart from the fixed 1em size and inline layout style attributes. The names and logos belong to their owners;
 * Control Rod uses them only to say which product sits in a seat and is not affiliated with or
 * endorsed by any of them (public/agent-marks/README.md). Colour marks are drawn in the vendor's own
 * colours; the single-colour marks are drawn in the text colour, as their owners ship them in black or
 * white. To swap or remove a mark, change this map; nothing else names the files.
 */
export interface AgentMark {
  src: string;
  /** Drawn as a single-colour mask in the current text colour, not as an image in its own colours. */
  mono: boolean;
}

export const AGENT_MARKS: Readonly<Record<AgentId, AgentMark>> = {
  claude: { src: "/agent-marks/claude.svg", mono: false },
  codex: { src: "/agent-marks/codex.svg", mono: false },
  agy: { src: "/agent-marks/agy.svg", mono: false },
  grok: { src: "/agent-marks/grok.svg", mono: true },
  opencode: { src: "/agent-marks/opencode.svg", mono: true },
  ollama: { src: "/agent-marks/ollama.svg", mono: true },
};

export function markOf(id: string): AgentMark | undefined {
  return (AGENT_MARKS as Record<string, AgentMark>)[id];
}
