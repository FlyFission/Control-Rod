import { describe, expect, it } from "vitest";
import { admitsDecidingChecker, admitsLocalOllama } from "../src/disclosure.js";
import { countedProvider, harnessName, verifyQualifiedAttestation } from "../src/run-attestation.js";
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
    expect(admitsDecidingChecker("proprietary", "ollama", "standard")).toBe(true);
    expect(admitsDecidingChecker("proprietary", "ollama", "safety")).toBe(false);
    expect(admitsDecidingChecker("proprietary", "ollama", "material")).toBe(false);
    expect(admitsDecidingChecker("public", "grok", "safety")).toBe(true);
  });

  it("verifyO6CheckerQuorum enforces distinct vendor families and 2-of-2 for safety", () => {
    expect(distinctFamily("claude", "claude")).toBe(false);
    expect(distinctFamily("claude", "grok")).toBe(true);
    expect(verifyO6CheckerQuorum("claude", ["claude"], "standard").ok).toBe(false);
    expect(verifyO6CheckerQuorum("claude", ["codex"], "standard").ok).toBe(true);
    expect(verifyO6CheckerQuorum("claude", ["codex"], "safety").ok).toBe(false);
    expect(verifyO6CheckerQuorum("claude", ["codex", "grok"], "safety").ok).toBe(true);
  });

  it("verifyQualifiedAttestation requires pass probe and enforced endpoint", () => {
    expect(verifyQualifiedAttestation({ probe_result: "pass", endpoint_enforcement: "enforced" }).ok).toBe(
      true,
    );
    expect(
      verifyQualifiedAttestation({ probe_result: "pass", endpoint_enforcement: "EndpointNotEnforced" }).ok,
    ).toBe(false);
    expect(verifyQualifiedAttestation({ probe_result: "fail", endpoint_enforcement: "enforced" }).ok).toBe(
      false,
    );
  });

  it("harnessName and countedProvider recognize Wave 2 runtimes", () => {
    for (const r of ["grok", "opencode", "agy", "ollama"]) {
      expect(harnessName(r)).toBe(r);
      expect(countedProvider(r)).toBe(true);
    }
  });
});
