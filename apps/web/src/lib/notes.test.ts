import { describe, expect, it } from "vitest";
import type { Api } from "../api/client.js";
import { NEEDS_REASON, NOTE_FALLBACK, decide, noteOr, signOverride, signReconcile, type Passkeys } from "./decide.js";

// Innocent until proven guilty: a note helps, but leaving it empty never stops a step.
const DIGEST = { algorithm: "sha256", value: "a".repeat(64) } as const;
const passkeys: Passkeys = { get: async () => ({ id: "cred-1" }), create: async () => ({}) };

function fakeClient(sent: Array<[string, Record<string, unknown>]>): Api {
  return {
    decisionOptions: async (_id: string, body: Record<string, unknown>) => (sent.push(["options", body]), { subject_digest: DIGEST, options: {} }),
    decide: async (_id: string, body: Record<string, unknown>) => (sent.push(["decide", body]), { kind: body.kind }),
    reconcileOptions: async (_p: string, _r: string, reason: string) => (sent.push(["reconcile-options", { reason }]), { subject_digest: DIGEST, options: {} }),
    reconcileRun: async (_p: string, _r: string, body: Record<string, unknown>) => (sent.push(["reconcile", body]), {}),
    overrideOptions: async (_p: string, _r: string, reason: string) => (sent.push(["override-options", { reason }]), { subject_digest: DIGEST, options: {} }),
    overrideIndependence: async (_p: string, _r: string, body: Record<string, unknown>) => (sent.push(["override", body]), {}),
  } as unknown as Api;
}

describe("optional notes", () => {
  it("noteOr keeps a typed note, trimmed, and falls back only when it is empty", () => {
    expect(noteOr("  Use the vendor curve ", "x")).toBe("Use the vendor curve");
    expect(noteOr("", "x")).toBe("x");
    expect(noteOr("   \n", "x")).toBe("x");
    expect(noteOr(undefined, "x")).toBe("x");
  });

  it("every note fallback is plain, non-empty and short enough for any record", () => {
    for (const v of Object.values(NOTE_FALLBACK)) {
      expect(v.trim()).toBe(v);
      expect(v.length).toBeGreaterThan(0);
      expect(v.length).toBeLessThanOrEqual(200);
    }
  });

  for (const kind of NEEDS_REASON) {
    it(`sends ${kind} with an empty note as its plain fallback, on both the options and the decision`, async () => {
      const sent: Array<[string, Record<string, unknown>]> = [];
      await decide({ packageId: "WP-1", revision: 0, kind, shownDigest: DIGEST, reason: "  " }, passkeys, fakeClient(sent));
      const fallback = NOTE_FALLBACK[kind as keyof typeof NOTE_FALLBACK];
      expect(sent.map(([what, b]) => [what, b.reason])).toEqual([["options", fallback], ["decide", fallback]]);
    });
  }

  it("sends a typed note as typed", async () => {
    const sent: Array<[string, Record<string, unknown>]> = [];
    await decide({ packageId: "WP-1", revision: 0, kind: "reject", shownDigest: DIGEST, reason: " Wrong site " }, passkeys, fakeClient(sent));
    expect(sent.map(([, b]) => b.reason)).toEqual(["Wrong site", "Wrong site"]);
  });

  it("a press with no passkey also gets the fallback", async () => {
    const sent: Array<[string, Record<string, unknown>]> = [];
    await decide({ packageId: "WP-1", revision: 0, kind: "return", shownDigest: DIGEST, noPasskey: true }, passkeys, fakeClient(sent));
    expect(sent).toEqual([["decide", expect.objectContaining({ reason: NOTE_FALLBACK.return })]]);
  });

  it("reconcile and override sign the same fallback they send", async () => {
    const sent: Array<[string, Record<string, unknown>]> = [];
    await signReconcile({ packageId: "WP-1", runId: "R-1", reason: "" }, passkeys, fakeClient(sent));
    await signOverride({ packageId: "WP-1", runId: "R-2", reason: "" }, passkeys, fakeClient(sent));
    expect(sent.map(([what, b]) => [what, b.reason])).toEqual([
      ["reconcile-options", NOTE_FALLBACK.reconcile],
      ["reconcile", NOTE_FALLBACK.reconcile],
      ["override-options", NOTE_FALLBACK.override],
      ["override", NOTE_FALLBACK.override],
    ]);
  });
});
