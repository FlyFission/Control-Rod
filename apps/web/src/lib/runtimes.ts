/**
 * Integrated and planned CLI ecosystems, models, and reasoning effort levels
 * for Author (Originator) and Checker (Verifier) agent assignments.
 */

export type CliEcosystemId =
  | "claude"
  | "codex"
  | "agy"
  | "opencode"
  | "grok"
  | "cursor"
  | "copilot"
  | "aider"
  | "cline"
  | "ollama";
export type ReasoningLevel =
  | "default"
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "max"
  | "xhigh";

export interface CliEcosystem {
  id: CliEcosystemId;
  label: string;
  cliCommand: string;
  readonly runnable: boolean;
  models: readonly string[];
  reasoningLevels: readonly ReasoningLevel[];
  modelReasoningLevels?: Readonly<Record<string, readonly ReasoningLevel[]>>;
  defaultModel: string;
  defaultReasoning: ReasoningLevel;
  modelDefaultReasoning?: Readonly<Record<string, ReasoningLevel>>;
}

export const CLI_ECOSYSTEMS: readonly CliEcosystem[] = [
  {
    id: "claude",
    label: "Claude Code",
    cliCommand: "claude",
    runnable: true,
    models: ["claude-sonnet-4-5", "claude-opus-4-1", "claude-haiku-4-5"],
    reasoningLevels: ["low", "medium", "high", "max"],
    modelReasoningLevels: {
      "claude-sonnet-4-5": ["low", "medium", "high", "max"],
      "claude-opus-4-1": ["low", "medium", "high", "max"],
      "claude-haiku-4-5": ["off", "low", "medium", "high"],
    },
    defaultModel: "claude-sonnet-4-5",
    defaultReasoning: "medium",
    modelDefaultReasoning: {
      "claude-haiku-4-5": "low",
    },
  },
  {
    id: "codex",
    label: "Codex CLI",
    cliCommand: "codex",
    runnable: true,
    models: ["sol-6.1", "gpt-5.4", "o3", "o4-mini"],
    reasoningLevels: ["low", "medium", "high", "xhigh"],
    modelReasoningLevels: {
      "sol-6.1": ["low", "medium", "high", "xhigh"],
      "gpt-5.4": ["low", "medium", "high", "xhigh"],
      o3: ["low", "medium", "high"],
      "o4-mini": ["low", "medium", "high"],
    },
    defaultModel: "sol-6.1",
    defaultReasoning: "medium",
  },
  {
    id: "agy",
    label: "Antigravity CLI (AGY)",
    cliCommand: "agy",
    runnable: false,
    models: ["argon", "gemini-2.5-pro", "gemini-2.5-flash"],
    reasoningLevels: ["low", "medium", "high", "max"],
    modelReasoningLevels: {
      argon: ["low", "medium", "high", "max"],
      "gemini-2.5-pro": ["low", "medium", "high"],
      "gemini-2.5-flash": ["off", "minimal", "low", "medium", "high"],
    },
    defaultModel: "argon",
    defaultReasoning: "high",
    modelDefaultReasoning: {
      "gemini-2.5-pro": "medium",
      "gemini-2.5-flash": "medium",
    },
  },
  {
    id: "opencode",
    label: "OpenCode",
    cliCommand: "opencode",
    runnable: false,
    models: ["default", "claude-sonnet-4-5", "gpt-5.4", "deepseek-r1"],
    reasoningLevels: ["default", "low", "medium", "high"],
    modelReasoningLevels: {
      default: ["default"],
      "claude-sonnet-4-5": ["low", "medium", "high", "max"],
      "gpt-5.4": ["low", "medium", "high", "xhigh"],
      "deepseek-r1": ["low", "medium", "high"],
    },
    defaultModel: "default",
    defaultReasoning: "default",
    modelDefaultReasoning: {
      "claude-sonnet-4-5": "medium",
      "gpt-5.4": "medium",
      "deepseek-r1": "medium",
    },
  },
  {
    id: "grok",
    label: "Grok CLI",
    cliCommand: "grok",
    runnable: false,
    models: ["grok-code-fast-1", "grok-4", "grok-3"],
    reasoningLevels: ["low", "medium", "high"],
    modelReasoningLevels: {
      "grok-code-fast-1": ["off", "low", "medium"],
      "grok-4": ["low", "medium", "high"],
      "grok-3": ["off", "low", "high"],
    },
    defaultModel: "grok-code-fast-1",
    defaultReasoning: "medium",
  },
  {
    id: "cursor",
    label: "Cursor Agent",
    cliCommand: "cursor-agent",
    runnable: false,
    models: ["auto", "claude-sonnet-4-5", "gpt-5.4"],
    reasoningLevels: ["default", "low", "medium", "high"],
    modelReasoningLevels: {
      auto: ["default"],
      "claude-sonnet-4-5": ["low", "medium", "high", "max"],
      "gpt-5.4": ["low", "medium", "high", "xhigh"],
    },
    defaultModel: "auto",
    defaultReasoning: "default",
    modelDefaultReasoning: {
      "claude-sonnet-4-5": "medium",
      "gpt-5.4": "medium",
    },
  },
  {
    id: "copilot",
    label: "GitHub Copilot CLI",
    cliCommand: "copilot",
    runnable: false,
    models: ["claude-sonnet-4-5", "gpt-5.4", "gemini-2.5-pro"],
    reasoningLevels: ["low", "medium", "high"],
    modelReasoningLevels: {
      "claude-sonnet-4-5": ["low", "medium", "high"],
      "gpt-5.4": ["low", "medium", "high"],
      "gemini-2.5-pro": ["low", "medium", "high"],
    },
    defaultModel: "claude-sonnet-4-5",
    defaultReasoning: "medium",
  },
  {
    id: "aider",
    label: "Aider",
    cliCommand: "aider",
    runnable: false,
    models: ["default", "claude-sonnet-4-5", "deepseek-chat", "o3"],
    reasoningLevels: ["default", "low", "medium", "high"],
    modelReasoningLevels: {
      default: ["default"],
      "claude-sonnet-4-5": ["off", "low", "medium", "high", "max"],
      "deepseek-chat": ["off"],
      o3: ["low", "medium", "high"],
    },
    defaultModel: "default",
    defaultReasoning: "default",
    modelDefaultReasoning: {
      "claude-sonnet-4-5": "medium",
      "deepseek-chat": "off",
      o3: "medium",
    },
  },
  {
    id: "cline",
    label: "Cline CLI",
    cliCommand: "cline",
    runnable: false,
    models: ["default", "claude-sonnet-4-5", "deepseek-r1"],
    reasoningLevels: ["default", "low", "medium", "high"],
    modelReasoningLevels: {
      default: ["default"],
      "claude-sonnet-4-5": ["off", "low", "medium", "high", "max"],
      "deepseek-r1": ["low", "medium", "high"],
    },
    defaultModel: "default",
    defaultReasoning: "default",
    modelDefaultReasoning: {
      "claude-sonnet-4-5": "medium",
      "deepseek-r1": "medium",
    },
  },
  {
    id: "ollama",
    label: "Ollama Local",
    cliCommand: "ollama",
    runnable: false,
    models: ["qwen2.5-coder:32b", "deepseek-r1:32b", "llama3.3:70b"],
    reasoningLevels: ["off", "low", "medium", "high"],
    modelReasoningLevels: {
      "qwen2.5-coder:32b": ["off", "low", "medium", "high"],
      "deepseek-r1:32b": ["low", "medium", "high"],
      "llama3.3:70b": ["off"],
    },
    defaultModel: "qwen2.5-coder:32b",
    defaultReasoning: "off",
    modelDefaultReasoning: {
      "deepseek-r1:32b": "medium",
      "llama3.3:70b": "off",
    },
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

/** Valid reasoning levels for a given CLI ecosystem and model pair. */
export function reasoningLevelsFor(
  ecosystemId: CliEcosystemId,
  model: string,
): readonly ReasoningLevel[] {
  const eco = ecosystemById(ecosystemId);
  return eco.modelReasoningLevels?.[model] ?? eco.reasoningLevels;
}

/** Keep preferred reasoning if supported by (ecosystem, model), otherwise pick the pair's default. */
export function resolveReasoningForModel(
  ecosystemId: CliEcosystemId,
  model: string,
  preferred?: ReasoningLevel,
): ReasoningLevel {
  const levels = reasoningLevelsFor(ecosystemId, model);
  if (preferred && levels.includes(preferred)) {
    return preferred;
  }
  const eco = ecosystemById(ecosystemId);
  const modelDefault = eco.modelDefaultReasoning?.[model];
  if (modelDefault && levels.includes(modelDefault)) {
    return modelDefault;
  }
  if (levels.includes(eco.defaultReasoning)) {
    return eco.defaultReasoning;
  }
  return levels[0] ?? "medium";
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

/** Preliminary UI check: distinct ecosystems selected (baselines and overrides are enforced at run time). */
export function isIndependentCustody(author: AgentRuntimeSelection, checker: AgentRuntimeSelection): boolean {
  return author.ecosystem !== checker.ecosystem;
}
