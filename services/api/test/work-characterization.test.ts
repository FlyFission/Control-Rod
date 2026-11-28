import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { digest } from "../src/kernel.js";
import { draftEtag, modelMismatch, overrideChallenge, publishBranchOf, recheckChallenge } from "../src/work.js";

/**
 * Contracts a later split of work.ts must keep. HTTP and kernel-authority paths are already
 * pinned by the existing suite (runs, authority, signing-policy, app, scram, budgets). These
 * are the pure contracts that suite does not name, and a move could change them silently.
 */
function sha256(text: string): Buffer {
  return createHash("sha256").update(text).digest();
}

describe("work.ts contracts a split must keep", () => {
  it("binds an independence override to that act, the run, and the nonce", () => {
    const got = overrideChallenge("digest", 3, "run-1", "nonce");
    expect(Buffer.from(got)).toEqual(sha256("digest|override-independence|3|run-1|nonce"));
    expect(Buffer.from(overrideChallenge("digest", 3, "run-1", "other"))).not.toEqual(got);
  });

  it("binds a recheck override to that act, the deliverable, and the nonce", () => {
    const got = recheckChallenge("digest", 2, "deliverable", "nonce");
    expect(Buffer.from(got)).toEqual(sha256("digest|recheck-override|2|deliverable|nonce"));
    expect(Buffer.from(recheckChallenge("digest", 2, "other", "nonce"))).not.toEqual(got);
  });

  it("quotes the draft digest as its ETag", () => {
    const body = { title: "Pump", revision: 1 };
    expect(draftEtag(body)).toBe(`"${digest(body)}"`);
    expect(draftEtag({ title: "Pump", revision: 2 })).not.toBe(draftEtag(body));
  });

  it("names a publish branch from the package id and revision, and strips other characters", () => {
    expect(publishBranchOf("WP-1", 4)).toBe("controlrod/WP-1-r4");
    expect(publishBranchOf("wp/1 2", 1)).toBe("controlrod/wp-1-2-r1");
  });

  it("treats a dated variant as the requested model, and default as no request", () => {
    expect(modelMismatch({ requested_model: "claude", reported_model: "claude-2026-11-01" })).toBeNull();
    expect(modelMismatch({ requested_model: "default", reported_model: "other" })).toBeNull();
    expect(modelMismatch({ requested_model: "claude", reported_model: "gpt" })).toEqual({ requested: "claude", reported: "gpt" });
    expect(modelMismatch({})).toBeNull();
  });
});
