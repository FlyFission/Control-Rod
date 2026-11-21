import { describe, expect, it } from "vitest";
import { type EventRecord, eventDigest } from "../src/events.js";
import { verifyBundleText } from "../src/verify-bundle.js";

/** The offline bundle check behind `pnpm cr verify` (docs/auditing.md). The sealed case is in seals.test.ts. */
type Json = Record<string, any>;

function chain(specs: { type: string; subject: string; data?: Json }[]): EventRecord[] {
  const out: EventRecord[] = [];
  for (const [i, s] of specs.entries()) {
    const prev = out.at(-1)?.digest;
    const rest = { seq: i + 1, at: `2026-11-21T00:00:0${i}.000Z`, type: s.type, subject: s.subject, actor: { kind: "system" as const, id: "test" }, ...(s.data ? { data: s.data } : {}), ...(prev ? { prev } : {}) };
    out.push({ ...rest, digest: { algorithm: "sha256", value: eventDigest(rest) } });
  }
  return out;
}

const segment = chain([
  { type: "package.created", subject: "WP-1" },
  { type: "run.queued", subject: "R-1", data: { package: "WP-1" } },
  { type: "package.created", subject: "WP-2" },
]);
const bundle = {
  package_id: "WP-1", segment, seal: null,
  head: { seq: 3, digest: segment[2]!.digest.value },
  witnessed: false, statement: "Local chain, not witnessed",
};

describe("pnpm cr verify", () => {
  it("passes an untouched unsealed bundle and says nothing authenticates it", async () => {
    const r = await verifyBundleText(JSON.stringify(bundle));
    expect(r.code).toBe(0);
    expect(r.lines[0]).toBe("OK    WP-1: 2 entries (1, 2) recompute and link through the chain from entry 1 to entry 3.");
    expect(r.lines.join("\n")).toContain("No seal covers these entries");
    expect(r.lines.join("\n")).toContain("Local chain, not witnessed");
  });

  it("accepts the whole proof response as well as the bundle the Records page downloads", async () => {
    expect((await verifyBundleText(JSON.stringify({ ok: true, chain: {}, check: {}, bundle }))).code).toBe(0);
  });

  it("fails an edited entry, a missing entry and a cut tail, naming the problem", async () => {
    const edited = structuredClone(bundle) as Json;
    edited.segment[1].data = { package: "WP-2" };
    expect(await verifyBundleText(JSON.stringify(edited))).toEqual({ code: 1, lines: ["FAIL  WP-1: event 2 does not match its digest."] });
    const missing = structuredClone(bundle) as Json;
    missing.segment.splice(1, 1);
    expect((await verifyBundleText(JSON.stringify(missing))).lines[0]).toBe("FAIL  WP-1: event 2 is missing from the segment.");
    const cut = structuredClone(bundle) as Json;
    cut.segment.pop();
    expect((await verifyBundleText(JSON.stringify(cut))).lines[0]).toBe("FAIL  WP-1: the segment does not end at the head the bundle states.");
  });

  it("refuses a file that is not a bundle", async () => {
    expect((await verifyBundleText("not json")).code).toBe(2);
    expect((await verifyBundleText(JSON.stringify({ hello: "world" }))).code).toBe(2);
  });
});
