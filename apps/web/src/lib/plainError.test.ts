import { describe, expect, it } from "vitest";
import { plainError, plainItem } from "./plainError.js";

describe("plainError", () => {
  it("says the Codex sign-in folder limit in plain words, with the fix", () => {
    const p = plainError('Policy: the login directory could not be hashed, so the check cannot count: protected login entry "/Users/x/.codex/plugins/codex" is over the 20971520 byte limit');
    expect(p?.what).toMatch(/sign-in folder was too large/);
    expect(p?.fix).toMatch(/controlrod update/);
  });
  it("does not blame size when the sign-in folder simply could not be read", () => {
    const p = plainError("Policy: the login directory could not be hashed, so the check cannot count: open /x/.codex: permission denied");
    expect(p?.what).toMatch(/could not read the agent's sign-in folder/);
    expect(p?.fix).not.toMatch(/update/i);
  });
  it("names sign-in and usage limits", () => {
    expect(plainError("codex: not logged in")?.what).toBe("The agent is not signed in.");
    expect(plainError("HTTP 429 Too Many Requests")?.what).toBe("The agent hit its usage limit.");
  });
  it("keeps a short plain sentence as it is", () => {
    expect(plainError("Stopped by the owner before it started.")).toEqual({ what: "Stopped by the owner before it started." });
  });
  it("falls back to an honest general sentence for machine text, and says nothing without text", () => {
    expect(plainError("panic: runtime error: index out of range [3] with length 2")?.what).toBe("Something went wrong while it ran.");
    expect(plainError("   ")).toBeUndefined();
  });
});

describe("plainItem tags", () => {
  it("says what an item asks of the person, not the server's gate name", () => {
    expect(plainItem({ kind: "accept", risk: { label: "Standard gate" } }).label).toBe("Ready to accept");
    expect(plainItem({ kind: "release", risk: { label: "Quick gate" } }).label).toBe("Ready to start");
    expect(plainItem({ kind: "accept", risk: { label: "High consequence gate" } }).label).toBe("High risk: ready to accept");
    expect(plainItem({ kind: "scram", risk: { label: "Security hold" } }).label).toBe("Stopped for safety");
    expect(plainItem({ kind: "lost", risk: { label: "Outcome unknown" } }).label).toBe("Not sure the run stopped");
    expect(plainItem({ kind: "something-new", risk: { label: "Its own label" } }).label).toBe("Its own label");
    expect(plainItem({ kind: "dispute", detail: "Run failed: boom", risk: { label: "Dispute" } }).label).toBe("Did not finish");
  });
});
