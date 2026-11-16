import { describe, expect, it } from "vitest";
import { vendorFamily } from "./vendor.js";

describe("vendor family", () => {
  it("names the families of the registered provider CLIs and no others", () => {
    expect(vendorFamily("claude")).toBe("Anthropic");
    expect(vendorFamily("anthropic")).toBe("Anthropic");
    expect(vendorFamily("claude-code")).toBe("Anthropic");
    expect(vendorFamily("codex")).toBe("OpenAI");
    expect(vendorFamily("openai")).toBe("OpenAI");
    expect(vendorFamily("agy")).toBeUndefined();
    expect(vendorFamily("grok")).toBeUndefined();
    expect(vendorFamily("opencode")).toBeUndefined();
    expect(vendorFamily("ollama")).toBeUndefined();
    expect(vendorFamily("fake")).toBeUndefined();
    expect(vendorFamily(undefined)).toBeUndefined();
  });
});
