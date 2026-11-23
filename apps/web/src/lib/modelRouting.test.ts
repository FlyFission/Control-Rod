import { describe, expect, it } from "vitest";
import { modelRouting } from "./modelRouting.js";

describe("model routing line", () => {
  it("flags a run that another model answered", () => {
    expect(modelRouting({ requested_model: "gpt-6.2-sol", reported_model: "gpt-6.1" }, true)).toEqual({
      kind: "rerouted",
      text: "Answered by gpt-6.1 (requested gpt-6.2-sol)",
    });
  });
  it("does not call an alias resolving to its concrete model a fallback", () => {
    expect(modelRouting({ requested_model: "opus", reported_model: "claude-opus-5-5" }, true)).toEqual({
      kind: "same",
      text: "Model claude-opus-5-5 (requested opus)",
    });
  });
  it("names the model once when it is the one requested", () => {
    expect(modelRouting({ requested_model: "opus", reported_model: "opus" }, true)).toEqual({ kind: "same", text: "Model opus" });
  });
  it("says a finished run did not report its model rather than assume the requested one", () => {
    expect(modelRouting({ requested_model: "opus" }, true)).toEqual({ kind: "unreported", text: "Model not reported (requested opus)" });
    expect(modelRouting({ requested_model: "opus" }, false)).toEqual({ kind: "same", text: "Requested opus" });
  });
  it("does not call the runtime's own default choice a fallback", () => {
    expect(modelRouting({ requested_model: "default", reported_model: "sonnet" }, true)).toEqual({ kind: "same", text: "Model sonnet" });
    expect(modelRouting({ requested_model: "default" }, true)).toEqual({ kind: "unreported", text: "Model not reported (runtime default)" });
  });
  it("shows nothing when the trace names no model", () => {
    expect(modelRouting(undefined, true)).toEqual({ kind: "none" });
    expect(modelRouting({ requested_model: "  ", reported_model: "" }, true)).toEqual({ kind: "none" });
  });
});
