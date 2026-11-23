import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { isoCBOR } from "@simplewebauthn/server/helpers";
import { describe, expect, it } from "vitest";
import { type EventRecord, eventDigest } from "../src/events.js";
import { digest } from "../src/kernel.js";
import { type InclusionBundle, keyDigest, sealChallenge, sealSubject } from "../src/seals.js";
import { parseVerifyCliArgs, verifyBundleText } from "../src/verify-bundle.js";

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

  it("checks an audit export for a time window, deriving its entries from their recorded times", async () => {
    const window = { ...bundle, package_id: undefined, window: { from: "2026-11-21T00:00:01Z", to: "2026-11-21T00:00:03Z" } };
    delete (window as Json).package_id;
    const ok = await verifyBundleText(JSON.stringify(window));
    expect(ok.code).toBe(0);
    expect(ok.lines[0]).toBe("OK    window 2026-11-21T00:00:01Z to 2026-11-21T00:00:03Z: 2 entries (2, 3) recompute and link through the chain from entry 1 to entry 3.");
    const empty = structuredClone(window) as Json;
    empty.window = { from: "2027-01-01T00:00:00Z", to: "2027-02-01T00:00:00Z" };
    expect((await verifyBundleText(JSON.stringify(empty))).lines[0]).toBe("FAIL  window 2027-01-01T00:00:00Z to 2027-02-01T00:00:00Z: the segment records nothing inside the window.");
    const backwards = structuredClone(window) as Json;
    backwards.window = { from: "2026-11-21T00:00:03Z", to: "2026-11-21T00:00:01Z" };
    expect((await verifyBundleText(JSON.stringify(backwards))).lines[0]).toContain("the window is not valid: from must be before to");
    // Finer than a millisecond would be truncated and select the wrong events, so it is refused.
    const fine = structuredClone(window) as Json;
    fine.window = { from: "2026-11-21T00:00:00.0005Z", to: "2026-11-21T00:00:00.0015Z" };
    expect((await verifyBundleText(JSON.stringify(fine))).lines[0]).toContain("at most millisecond precision");
    const edited = structuredClone(window) as Json;
    edited.segment[2].at = "2026-11-21T00:00:02.500Z";
    expect((await verifyBundleText(JSON.stringify(edited))).lines[0]).toContain("event 3 does not match its digest");
  });

  it("rejects a proof accepted on revision A when verified against an Action receipt for revision B", async () => {
    const diffA = "1".repeat(64);
    const diffB = "2".repeat(64);
    const headA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const headB = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

    const mkSpecs = (withHead: boolean) => [
      { type: "package.created", subject: "PR-42" },
      { type: "run.started", subject: "R-1", actor: { kind: "agent" as const, id: "author-claude" }, data: { package: "PR-42", role: "author", round: 1 } },
      {
        type: "run.succeeded",
        subject: "R-1",
        actor: { kind: "agent" as const, id: "author-claude" },
        data: { package: "PR-42", role: "author", round: 1, ...(withHead ? { head_sha: headA } : {}), outputs: [{ name: "diff.patch", sha256: diffA }] },
      },
      {
        type: "package.pre-checked",
        subject: "PR-42",
        actor: { kind: "agent" as const, id: "checker-codex" },
        data: { revision: 1, round: 1, outcome: "pass", findings: 0, shared_runtime: false },
      },
      {
        type: "decision.accept",
        subject: "PR-42",
        actor: { kind: "human" as const, id: "mem_owner" },
        data: { revision: 1, decision: "D-revA", subject_digest: { algorithm: "sha256", value: "3".repeat(64) } },
      },
    ];
    const build = (specs: ReturnType<typeof mkSpecs>): InclusionBundle => {
      const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
      const jwk = publicKey.export({ format: "jwk" }) as { x: string; y: string };
      const cose = Buffer.from(
        isoCBOR.encode(
          new Map<number, number | Uint8Array>([
            [1, 2],
            [3, -7],
            [-1, 1],
            [-2, Buffer.from(jwk.x, "base64url")],
            [-3, Buffer.from(jwk.y, "base64url")],
          ]),
        ),
      );
      const chainWithActors = (): EventRecord[] => {
        const out: EventRecord[] = [];
        for (const [i, s] of specs.entries()) {
          const prev = out.at(-1)?.digest;
          const rest = {
            seq: i + 1,
            at: `2026-11-22T00:00:0${i}.000Z`,
            type: s.type,
            subject: s.subject,
            actor: s.actor ?? { kind: "system" as const, id: "test" },
            ...(s.data ? { data: s.data } : {}),
            ...(prev ? { prev } : {}),
          };
          out.push({ ...rest, digest: { algorithm: "sha256", value: eventDigest(rest) } });
        }
        return out;
      };
      const baseEvents = chainWithActors();
      const head = baseEvents[baseEvents.length - 1]!;
      const sealedAt = new Date().toISOString();
      const subjectDigest = sealSubject("mem_owner", "org_test", { head_seq: head.seq, head_digest: head.digest.value, purpose: "PR bundle", sealed_at: sealedAt });
      const nonce = "0123456789abcdef0123456789abcdef";
      const clientData = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge: sealChallenge(subjectDigest, nonce), origin: "http://localhost:7300" }));
      const rpHash = createHash("sha256").update("localhost").digest();
      const counter = Buffer.alloc(4);
      counter.writeUInt32BE(1);
      const authData = Buffer.concat([rpHash, Buffer.from([0x05]), counter]);
      const signature = sign("sha256", Buffer.concat([authData, createHash("sha256").update(clientData).digest()]), privateKey);
      const seal = {
        id: "seal_revA",
        org_id: "org_test",
        payload: { head_seq: head.seq, head_digest: head.digest, org_id: "org_test", sealed_at: sealedAt, signer_id: "mem_owner", purpose: "PR bundle" },
        subject_digest: { algorithm: "sha256", value: subjectDigest },
        nonce,
        assertion: {
          credential_id: Buffer.from(randomBytes(16)).toString("base64url"),
          authenticator_data: authData.toString("base64url"),
          client_data_json: clientData.toString("base64url"),
          signature: signature.toString("base64url"),
        },
      };
      const lastPrev = head.digest;
      const sealRecRest = {
        seq: head.seq + 1,
        at: "2026-11-22T00:00:10.000Z",
        type: "chain.sealed",
        subject: seal.id,
        actor: { kind: "human" as const, id: "mem_owner" },
        data: { head_seq: head.seq, head_digest: head.digest.value, purpose: "PR bundle", seal_digest: digest(seal), key_digest: keyDigest(cose) },
        prev: lastPrev,
      };
      const segment: EventRecord[] = [...baseEvents, { ...sealRecRest, digest: { algorithm: "sha256", value: eventDigest(sealRecRest) } }];
      const proofA: InclusionBundle = {
        package_id: "PR-42",
        segment,
        seal,
        seal_evidence: { public_key: cose.toString("base64url"), rp_id: "localhost", origins: ["http://localhost:7300"] },
        witnessed: false,
        statement: "Local chain, not witnessed",
      };
      return proofA;
    };
    const proofA = build(mkSpecs(true));
    const proofNoHead = build(mkSpecs(false));
    const segment = proofA.segment;

    const receiptA = `<!-- controlrod-pr-receipt:v1 -->\n<!-- controlrod-check-binding: {"package_id":"PR-42","revision":1,"head_sha":"${headA}","diff_sha256":"${diffA}","outcome":"pass"} -->\n`;
    const receiptB = `<!-- controlrod-pr-receipt:v1 -->\n<!-- controlrod-check-binding: {"package_id":"PR-42","revision":2,"head_sha":"${headB}","diff_sha256":"${diffB}","outcome":"pass"} -->\n`;
    const receiptSameRevNewDiff = `<!-- controlrod-pr-receipt:v1 -->\n<!-- controlrod-check-binding: {"package_id":"PR-42","head_sha":"${headB}","diff_sha256":"${diffB}","outcome":"pass"} -->\n`;

    // Matching revision A receipt passes.
    const okA = await verifyBundleText(JSON.stringify(proofA), { receiptText: receiptA });
    expect(okA.code, okA.lines.join("\n")).toBe(0);
    expect(okA.lines.join("\n")).toContain("Acceptance link holds");

    // Standalone check without receipt still sees valid internal chain for A,
    // while checking against revision B or diff B fails offline detection.
    const badB = await verifyBundleText(JSON.stringify(proofA), { receiptText: receiptB });
    expect(badB.code).toBe(1);
    expect(badB.lines[0]).toContain("revision 1, not expected revision 2");

    const badDiff = await verifyBundleText(JSON.stringify(proofA), { receiptText: receiptSameRevNewDiff });
    expect(badDiff.code).toBe(1);
    expect(badDiff.lines[0]).toContain("do not cover receipt diff");

    // Finding 1: a receipt without a valid diff digest cannot be verified.
    const noDiff = `<!-- controlrod-check-binding: {"package_id":"PR-42","revision":1,"head_sha":"${headA}"} -->\n`;
    const noDiffR = await verifyBundleText(JSON.stringify(proofA), { receiptText: noDiff });
    expect(noDiffR.code).toBe(1);
    expect(noDiffR.lines[0]).toContain("no valid diff digest");
    const badDigest = `<!-- controlrod-check-binding: {"package_id":"PR-42","revision":1,"diff_sha256":"not-a-digest"} -->\n`;
    expect((await verifyBundleText(JSON.stringify(proofA), { receiptText: badDigest })).code).toBe(1);
    expect((await verifyBundleText(JSON.stringify(proofA), { expectedRevision: 1 })).code).toBe(1);

    // Revision 0 is a real revision: a receipt for revision 0 must not verify against revision 1.
    const rev0 = `<!-- controlrod-check-binding: {"package_id":"PR-42","revision":0,"diff_sha256":"${diffA}"} -->\n`;
    const rev0R = await verifyBundleText(JSON.stringify(proofA), { receiptText: rev0 });
    expect(rev0R.code).toBe(1);
    expect(rev0R.lines[0]).toContain("not expected revision 0");
    expect(parseVerifyCliArgs(["--revision", "0", "p.json"]).error).toBeUndefined();
    expect(parseVerifyCliArgs(["--revision", "-1", "p.json"]).error).toBeDefined();

    // A recorded head commit that differs still fails.
    const wrongHead = `<!-- controlrod-check-binding: {"package_id":"PR-42","revision":1,"head_sha":"${headB}","diff_sha256":"${diffA}"} -->\n`;
    const wrongHeadR = await verifyBundleText(JSON.stringify(proofA), { receiptText: wrongHead });
    expect(wrongHeadR.code).toBe(1);
    expect(wrongHeadR.lines[0]).toContain("does not match head commit");
    expect(okA.lines.join("\n")).toContain(`head ${headA}`);

    // A bundle that records no head commit verifies the rest and says it is not head-bound.
    const headNone = await verifyBundleText(JSON.stringify(proofNoHead), { receiptText: receiptA });
    expect(headNone.code, headNone.lines.join("\n")).toBe(0);
    expect(headNone.lines.join("\n")).toContain("not head-bound");
    expect(headNone.lines.join("\n")).not.toContain(`head ${headA}`);

    // A receipt for another package cannot verify against this bundle's acceptance.
    const otherPkg = `<!-- controlrod-check-binding: {"package_id":"PR-99","revision":1,"head_sha":"${headA}","diff_sha256":"${diffA}"} -->\n`;
    const otherPkgR = await verifyBundleText(JSON.stringify(proofA), { receiptText: otherPkg });
    expect(otherPkgR.code).toBe(1);
    expect(otherPkgR.lines[0]).toContain("not this bundle's package");
    const noPkg = `<!-- controlrod-check-binding: {"revision":1,"diff_sha256":"${diffA}"} -->\n`;
    expect((await verifyBundleText(JSON.stringify(proofA), { receiptText: noPkg })).code).toBe(1);

    // Unsealed bundle cannot claim acceptance against any receipt.
    const unsealedA = { ...proofA, seal: null, seal_evidence: undefined, head: { seq: segment.length, digest: segment.at(-1)!.digest.value } };
    const badUnsealed = await verifyBundleText(JSON.stringify(unsealedA), { receiptText: receiptA });
    expect(badUnsealed.code).toBe(1);
    expect(badUnsealed.lines[0]).toContain("unsealed");
  });
});
