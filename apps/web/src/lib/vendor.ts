/**
 * Vendor families for the providers the daemon adapters name
 * (claudeAdapter.Providers and Family, codexAdapter.Providers and Family).
 * A provider that is not one of those has no family. None is invented.
 */
const FAMILIES: Record<string, string> = {
  claude: "Anthropic",
  anthropic: "Anthropic",
  "claude-code": "Anthropic",
  codex: "OpenAI",
  openai: "OpenAI",
};

export function vendorFamily(provider: string | undefined): string | undefined {
  if (!provider) return undefined;
  return FAMILIES[provider.toLowerCase()];
}
