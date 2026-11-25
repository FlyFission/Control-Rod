import { describe, expect, it } from "vitest";
import { admitsDecidingChecker, admitsLocalOllama } from "../src/disclosure.js";
import { countedProvider, harnessName } from "../src/run-attestation.js";
import { distinctFamily, verifyO6CheckerQuorum } from "../src/runtimes.js";

describe("Wave 2 multi-CLI assurance and O6 quorum", () => {
  it("admitsLocalOllama enforces local-only loopback and Capability Tier 2+", () => {
    expect(
      admitsLocalOllama({ locality: "local", endpoint: "http://127.0.0.1:11434", capabilityTier: 2 }),
    ).toBe(true);
    expect(
      admitsLocalOllama({ locality: "remote", endpoint: "http://127.0.0.1:11434", capabilityTier: 2 }),
    ).toBe(false);
    expect(
      admitsLocalOllama({ locality: "local", endpoint: "http://10.0.0.5:11434", capabilityTier: 2 }),
    ).toBe(false);
    expect(
      admitsLocalOllama({ locality: "local", endpoint: "http://127.0.0.1:11434", capabilityTier: 1 }),
    ).toBe(false);
  });

  it("admitsDecidingChecker forbids ollama on safety and material grades", () => {
    // Ollama is not admitted on a proprietary lane at all, since it can route to a hosted model.
    expect(admitsDecidingChecker("proprietary", "ollama", "standard")).toBe(false);
    expect(admitsDecidingChecker("public", "ollama", "standard")).toBe(false);
    expect(admitsDecidingChecker("proprietary", "ollama", "safety")).toBe(false);
    expect(admitsDecidingChecker("proprietary", "ollama", "material")).toBe(false);
    expect(admitsDecidingChecker("public", "grok", "safety")).toBe(true);
  });

  it("verifyO6CheckerQuorum enforces distinct vendor families and 2-of-2 for safety", () => {
    expect(distinctFamily("claude", "claude")).toBe(false);
    expect(distinctFamily("claude", "grok")).toBe(true);
    // OpenCode and Ollama can serve any vendor's model, so they never count as a distinct family.
    expect(distinctFamily("claude", "opencode")).toBe(false);
    expect(distinctFamily("claude", "ollama")).toBe(false);
    expect(distinctFamily("unknown-cli", "codex")).toBe(false);
    expect(verifyO6CheckerQuorum("claude", ["codex", "opencode"], "safety").ok).toBe(false);
    expect(verifyO6CheckerQuorum("claude", ["claude"], "standard").ok).toBe(false);
    expect(verifyO6CheckerQuorum("claude", ["codex"], "standard").ok).toBe(true);
    expect(verifyO6CheckerQuorum("claude", ["codex"], "safety").ok).toBe(false);
    expect(verifyO6CheckerQuorum("claude", ["codex", "grok"], "safety").ok).toBe(true);
  });

  it("harnessName names the Wave 2 runtimes, which do not count until they can run", () => {
    for (const r of ["grok", "opencode", "ollama"]) {
      expect(harnessName(r)).toBe(r);
      expect(countedProvider(r)).toBe(false);
    }
    // Antigravity runs confined on macOS, so its pre-checks count.
    expect(harnessName("antigravity")).toBe("agy");
    expect(countedProvider("agy")).toBe(true);
  });
});
