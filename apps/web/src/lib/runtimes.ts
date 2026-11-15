/**
 * Integrated and planned CLI ecosystems, models, and reasoning effort levels
 * for Author (Originator) and Checker (Verifier) agent assignments.
 */

export type CliEcosystemId = "claude" | "codex" | "agy" | "gemini";
export type ReasoningLevel = "low" | "medium" | "high" | "max" | "xhigh";

export interface CliEcosystem {
  id: CliEcosystemId;
  label: string;
  cliCommand: string;
  models: readonly string[];
  reasoningLevels: readonly ReasoningLevel[];
  defaultModel: string;
  defaultReasoning: ReasoningLevel;
}

export const CLI_ECOSYSTEMS: readonly CliEcosystem[] = [
  {
    id: "claude",
    label: "Claude Code",
    cliCommand: "claude",
    models: ["claude-sonnet-4-5", "claude-opus-4-1", "claude-haiku-4-5"],
    reasoningLevels: ["low", "medium", "high", "max"],
    defaultModel: "claude-sonnet-4-5",
    defaultReasoning: "medium",
  },
  {
    id: "codex",
    label: "Codex CLI",
    cliCommand: "codex",
    models: ["sol-6.1", "gpt-5.4", "o3", "o4-mini"],
    reasoningLevels: ["low", "medium", "high", "xhigh"],
    defaultModel: "sol-6.1",
    defaultReasoning: "medium",
  },
  {
    id: "agy",
    label: "AGY CLI",
    cliCommand: "agy",
    models: ["argon", "gemini-2.5-pro", "gemini-2.5-flash"],
    reasoningLevels: ["low", "medium", "high", "max"],
    defaultModel: "argon",
    defaultReasoning: "high",
  },
  {
    id: "gemini",
    label: "Gemini CLI",
    cliCommand: "gemini",
    models: ["gemini-2.5-pro", "gemini-2.5-flash"],
    reasoningLevels: ["low", "medium", "high"],
    defaultModel: "gemini-2.5-pro",
    defaultReasoning: "medium",
  },
];

export interface AgentRuntimeSelection {
  ecosystem: CliEcosystemId;
  model: string;
  reasoning: ReasoningLevel;
}

export function ecosystemById(id: CliEcosystemId): CliEcosystem {
  return CLI_ECOSYSTEMS.find((c) => c.id === id) ?? CLI_ECOSYSTEMS[0]!;
}

export function defaultAuthorSelection(): AgentRuntimeSelection {
  const claude = ecosystemById("claude");
  return {
    ecosystem: claude.id,
    model: claude.defaultModel,
    reasoning: claude.defaultReasoning,
  };
}

export function defaultCheckerSelection(): AgentRuntimeSelection {
  const codex = ecosystemById("codex");
  return {
    ecosystem: codex.id,
    model: codex.defaultModel,
    reasoning: codex.defaultReasoning,
  };
}

/** O6 independence rule: verifier runtime should be independent of the originator runtime. */
export function isIndependentCustody(author: AgentRuntimeSelection, checker: AgentRuntimeSelection): boolean {
  return author.ecosystem !== checker.ecosystem;
}
