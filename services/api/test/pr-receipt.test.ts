import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { isoCBOR } from "@simplewebauthn/server/helpers";
import { describe, expect, it } from "vitest";
import { type EventRecord, eventDigest } from "../src/events.js";
import { digest } from "../src/kernel.js";
import { formatPrReceipt, normalizeProvider, prReceiptFromBundleText } from "../src/pr-receipt.js";
import { type InclusionBundle, keyDigest, sealChallenge, sealSubject } from "../src/seals.js";
import { verifyBundleText } from "../src/verify-bundle.js";

type Json = Record<string, any>;

function chain(
  specs: { type: string; subject: string; actor?: { kind: "human" | "agent" | "system"; id: string }; data?: Json }[],
): EventRecord[] {
  const out: EventRecord[] = [];
  for (const [i, s] of specs.entries()) {
    const prev = out.at(-1)?.digest;
    const rest = {
      seq: i + 1,
      at: `2026-11-22T00:00:${String(i).padStart(2, "0")}.000Z`,
      type: s.type,
      subject: s.subject,
      actor: s.actor ?? { kind: "system" as const, id: "test" },
      ...(s.data ? { data: s.data } : {}),
      ...(prev ? { prev } : {}),
    };
    out.push({ ...rest, digest: { algorithm: "sha256", value: eventDigest(rest) } });
  }
  return out;
}

function makeSealedBundle(
  pkgId: string,
  specs: { type: string; subject: string; actor?: { kind: "human" | "agent" | "system"; id: string }; data?: Json }[],
): InclusionBundle {
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
  const credentialId = Buffer.from(randomBytes(16)).toString("base64url");
  const orgId = "org_test";
  const memberId = "mem_owner";
  const pubB64 = cose.toString("base64url");
  const preEvents = chain(specs);
  const head = preEvents[specs.length - 1]!;
  const sealedAt = new Date().toISOString();
  const req = { head_seq: head.seq, head_digest: head.digest.value, purpose: "PR bundle", sealed_at: sealedAt };
  const subjectDigest = sealSubject(memberId, orgId, req);
  const nonce = "0123456789abcdef0123456789abcdef";
  const challenge = sealChallenge(subjectDigest, nonce);
  const rpId = "localhost";
  const origin = "http://localhost:7300";
  const clientData = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge, origin }));
  const rpHash = createHash("sha256").update(rpId).digest();
  const counter = Buffer.alloc(4);
  counter.writeUInt32BE(1);
  const authData = Buffer.concat([rpHash, Buffer.from([0x01 | 0x04]), counter]);
  const clientHash = createHash("sha256").update(clientData).digest();
  const signature = sign("sha256", Buffer.concat([authData, clientHash]), privateKey);

  const seal = {
    id: "seal_test123",
    org_id: orgId,
    payload: {
      head_seq: head.seq,
      head_digest: { algorithm: "sha256", value: head.digest.value },
      org_id: orgId,
      sealed_at: sealedAt,
      signer_id: memberId,
      purpose: "PR bundle",
    },
    subject_digest: { algorithm: "sha256", value: subjectDigest },
    nonce,
    assertion: {
      credential_id: credentialId,
      authenticator_data: authData.toString("base64url"),
      client_data_json: clientData.toString("base64url"),
      signature: signature.toString("base64url"),
    },
  };
  const sealDigest = digest(seal);
  const fullSegment = chain([
    ...specs,
    {
      type: "chain.sealed",
      subject: seal.id,
      actor: { kind: "human", id: memberId },
      data: {
        head_seq: head.seq,
        head_digest: head.digest.value,
        purpose: "PR bundle",
        seal_digest: sealDigest,
        key_digest: keyDigest(cose),
      },
    },
  ]);
  return {
    package_id: pkgId,
    segment: fullSegment,
    seal,
    seal_evidence: {
      public_key: pubB64,
      rp_id: rpId,
      origins: [origin],
    },
    witnessed: false,
    statement: "Local chain, not witnessed",
  };
}

describe("PR receipt", () => {
  it("formats an authenticated Control Rod PR receipt with digest binding and offline verify command", () => {
    const md = formatPrReceipt({
      packageId: "WP-0042",
      revision: 3,
      author: { provider: "claude", model: "claude-sonnet-4-5" },
      checker: { provider: "codex", model: "gpt-5-codex", outcome: "pass", findingsCount: 0, independent: true },
      acceptance: {
        acceptedBy: "mem_ben",
        decisionId: "dec_1234",
        subjectDigest: "a".repeat(64),
        acceptedAt: "2026-11-22T12:00:00Z",
        passkeyVerified: true,
      },
      proof: {
        bundlePath: "WP-0042-inclusion-proof.json",
        authenticated: true,
        sealKeyTrusted: true,
        bundleDigest: "b".repeat(64),
        headSeq: 15,
        headDigest: "c".repeat(64),
        sealedBy: "seal_abc",
        witnessed: false,
      },
    });
    expect(md).toContain("<!-- controlrod-pr-receipt:v1 -->");
    expect(md).toContain("`WP-0042` (rev 3)");
    expect(md).toContain("**Written by:** `claude` (`Anthropic`, model `claude-sonnet-4-5`)");
    expect(md).toContain("**Checked blind by:** `codex` (`OpenAI`, model `gpt-5-codex`) — **PASS** (0 findings)");
    expect(md).toContain("**Accepted by:** `mem_ben` (passkey decision `dec_1234`, subject `sha256:aaaaaaaaaaaa`, 2026-11-22T12:00:00Z)");
    expect(md).toContain("`pnpm cr verify WP-0042-inclusion-proof.json`");
    expect(md).toContain("bundle `sha256:bbbbbbbbbbbb`");
    expect(md).toContain("head #15 `cccccccccccc`");
    expect(md).toContain("Local chain, not witnessed");
  });

  it("fails closed on canClaimBlind for aliases, unknown, opencode, ollama, and empty providers", () => {
    expect(normalizeProvider("Anthropic")).toBe("claude");
    expect(normalizeProvider("OpenAI")).toBe("codex");
    const pairs: [string, string][] = [
      ["claude", "claude"],
      ["Anthropic", "claude-code"],
      ["unknown", "codex"],
      ["claude", "unknown"],
      ["opencode", "codex"],
      ["claude", "opencode"],
      ["ollama", "codex"],
      ["claude", "ollama"],
      ["", "codex"],
    ];
    for (const [author, checker] of pairs) {
      const md = formatPrReceipt({
        packageId: "WP-0043",
        author: { provider: author },
        checker: { provider: checker, outcome: "pass", findingsCount: 1, independent: true },
      });
      expect(md, `author=${author} checker=${checker}`).not.toContain("**Checked blind by:**");
      expect(md, `author=${author} checker=${checker}`).toContain("**Checked by:**");
      expect(md, `author=${author} checker=${checker}`).toContain("shared or unknown vendor family");
    }
  });

  it("never claims human passkey acceptance for an unsealed bundle", async () => {
    const segment = chain([
      { type: "package.created", subject: "WP-99" },
      { type: "run.started", subject: "R-auth", actor: { kind: "agent", id: "claude" }, data: { package: "WP-99", role: "author", round: 1 } },
      { type: "run.succeeded", subject: "R-auth", actor: { kind: "agent", id: "claude" }, data: { package: "WP-99", role: "author", round: 1, outputs: ["diff.patch"] } },
      { type: "package.pre-checked", subject: "WP-99", actor: { kind: "agent", id: "codex" }, data: { revision: 1, round: 1, outcome: "pass", findings: 0, shared_runtime: false } },
      {
        type: "decision.accept",
        subject: "WP-99",
        actor: { kind: "human", id: "mem_owner" },
        data: { revision: 1, decision: "dec_99", subject_digest: { algorithm: "sha256", value: "d".repeat(64) } },
      },
    ]);
    const bundle = {
      package_id: "WP-99",
      segment,
      seal: null,
      head: { seq: segment.length, digest: segment[segment.length - 1]!.digest.value },
      witnessed: false,
      statement: "Local chain, not witnessed",
    };

    const ok = await prReceiptFromBundleText(JSON.stringify(bundle), "WP-99-proof.json");
    expect(ok.code).toBe(0);
    expect(ok.markdown).toContain("UNAUTHENTICATED (unsealed bundle)");
    expect(ok.markdown).toContain("**Accepted by:** unauthenticated (bundle is unsealed");
    expect(ok.markdown).not.toContain("passkey decision");
    expect(ok.markdown).toContain("pnpm cr verify WP-99-proof.json");
    expect(ok.markdown).toContain("UNSEALED");

    const tampered = structuredClone(bundle) as Json;
    tampered.segment[3].data.outcome = "fail";
    const bad = await prReceiptFromBundleText(JSON.stringify(tampered), "WP-99-proof.json");
    expect(bad.code).toBe(1);
    expect(bad.markdown).toBeUndefined();
    expect(bad.lines[0]).toContain("FAIL  WP-99");
  });

  it("emits a binding marker and a --receipt command, and the generated receipt verifies against its bundle (revision 0)", async () => {
    const digestVal = { algorithm: "sha256", value: "e".repeat(64) };
    const diff = "d".repeat(64);
    const head = "c".repeat(40);
    const sealed = makeSealedBundle("WP-RT-1", [
      { type: "package.created", subject: "WP-RT-1" },
      { type: "run.succeeded", subject: "R-1", actor: { kind: "agent", id: "claude" }, data: { package: "WP-RT-1", role: "author", round: 1, head_sha: head, outputs: [{ name: "diff.patch", sha256: diff }] } },
      { type: "package.pre-checked", subject: "WP-RT-1", actor: { kind: "agent", id: "codex" }, data: { revision: 0, round: 1, outcome: "pass", findings: 0, shared_runtime: false } },
      { type: "decision.accept", subject: "WP-RT-1", actor: { kind: "human", id: "mem_owner" }, data: { revision: 0, decision: "D-1", subject_digest: digestVal } },
    ]);
    const res = await prReceiptFromBundleText(JSON.stringify(sealed), "rt.json");
    expect(res.code, res.lines.join("\n")).toBe(0);
    expect(res.markdown).toContain("<!-- controlrod-check-binding:");
    expect(res.markdown).toContain("pnpm cr verify --receipt pr-receipt.md rt.json");
    const v = await verifyBundleText(JSON.stringify(sealed), { receiptText: res.markdown! });
    expect(v.code, v.lines.join("\n")).toBe(0);
    expect(v.lines.join("\n")).toContain("Acceptance link holds");
    // Editing the verdict, the checker or the accepting person invalidates the receipt.
    const md = res.markdown!;
    expect(md).toContain("**PASS**");
    for (const [from, to] of [["**PASS**", "**FAIL**"], ["`codex`", "`claude`"], ["mem_owner", "mem_other"], ["`claude` (`Anthropic`)", "`grok` (`xAI`)"]] as const) {
      const edited = await verifyBundleText(JSON.stringify(sealed), { receiptText: md.replace(from, to) });
      expect(edited.code, `${from} -> ${to}`).toBe(1);
      expect(edited.lines[0]).toContain("claims");
    }
    // Editing the heading must not bypass the claim check: the marker alone makes the compare mandatory.
    const noHeading = await verifyBundleText(JSON.stringify(sealed), { receiptText: md.replace("### Control Rod receipt", "## Control Rod receipt").replace("mem_owner", "mem_other") });
    expect(noHeading.code).toBe(1);
    expect(noHeading.lines[0]).toContain("claims");
    const headingOnly = await verifyBundleText(JSON.stringify(sealed), { receiptText: md.replace("### Control Rod receipt", "## Control Rod receipt") });
    expect(headingOnly.code).toBe(1);
    // A platform receipt relabelled as a standalone summary still fails while it names a person.
    const relabelled = md.replace("### Control Rod receipt", "### Control Rod check summary (standalone, unaccepted)").replace("mem_owner", "mem_other");
    expect((await verifyBundleText(JSON.stringify(sealed), { receiptText: relabelled })).code).toBe(1);
    // Explicit options that disagree with the receipt's binding fail instead of overriding it.
    const conflict = await verifyBundleText(JSON.stringify(sealed), { receiptText: md, expectedDiffSha256: "f".repeat(64) });
    expect(conflict.code).toBe(1);
    expect(conflict.lines[0]).toContain("disagree");
    expect((await verifyBundleText(JSON.stringify(sealed), { receiptText: md, expectedDiffSha256: diff })).code).toBe(0);

    // An output that is not a patch is not a diff binding.
    const notPatch = makeSealedBundle("WP-RT-3", [
      { type: "package.created", subject: "WP-RT-3" },
      { type: "run.succeeded", subject: "R-1", actor: { kind: "agent", id: "claude" }, data: { package: "WP-RT-3", role: "author", round: 1, outputs: [{ name: "notes.txt", sha256: diff }] } },
      { type: "package.pre-checked", subject: "WP-RT-3", actor: { kind: "agent", id: "codex" }, data: { revision: 0, round: 1, outcome: "pass", findings: 0, shared_runtime: false } },
      { type: "decision.accept", subject: "WP-RT-3", actor: { kind: "human", id: "mem_owner" }, data: { revision: 0, decision: "D-1", subject_digest: digestVal } },
    ]);
    const np = await prReceiptFromBundleText(JSON.stringify(notPatch), "np.json");
    expect(np.markdown).not.toContain("controlrod-check-binding");
    expect(np.markdown).toContain("no diff binding");
    const npv = await verifyBundleText(JSON.stringify(notPatch), { expectedDiffSha256: diff, expectedRevision: 0 });
    expect(npv.code).toBe(1);
    expect(npv.lines[0]).toContain("do not cover");

    // The same receipt does not verify against another package's bundle.
    const other = makeSealedBundle("WP-RT-2", [
      { type: "package.created", subject: "WP-RT-2" },
      { type: "run.succeeded", subject: "R-1", actor: { kind: "agent", id: "claude" }, data: { package: "WP-RT-2", role: "author", round: 1, head_sha: head, outputs: [{ name: "diff.patch", sha256: diff }] } },
      { type: "package.pre-checked", subject: "WP-RT-2", actor: { kind: "agent", id: "codex" }, data: { revision: 0, round: 1, outcome: "pass", findings: 0, shared_runtime: false } },
      { type: "decision.accept", subject: "WP-RT-2", actor: { kind: "human", id: "mem_owner" }, data: { revision: 0, decision: "D-1", subject_digest: digestVal } },
    ]);
    expect((await verifyBundleText(JSON.stringify(other), { receiptText: res.markdown! })).code).toBe(1);
  });

  it("distinguishes bundle-key seals from external trust anchors and verifies human/revision/latest rules", async () => {
    const digestVal = { algorithm: "sha256", value: "e".repeat(64) };
    const sealed = makeSealedBundle("WP-SEAL-1", [
      { type: "package.created", subject: "WP-SEAL-1" },
      { type: "run.started", subject: "R-1", actor: { kind: "agent", id: "claude" }, data: { package: "WP-SEAL-1", role: "author", round: 1 } },
      { type: "run.succeeded", subject: "R-1", actor: { kind: "agent", id: "claude" }, data: { package: "WP-SEAL-1", role: "author", round: 1, outputs: ["diff.patch"] } },
      { type: "package.pre-checked", subject: "WP-SEAL-1", actor: { kind: "agent", id: "codex" }, data: { revision: 2, round: 1, outcome: "pass", findings: 0, shared_runtime: false } },
      { type: "decision.accept", subject: "WP-SEAL-1", actor: { kind: "human", id: "mem_owner" }, data: { revision: 2, decision: "D-1", subject_digest: digestVal } },
    ]);

    // Without external trustedSealKeys, a bundle-supplied key must NOT claim passkey decision.
    const untrusted = await prReceiptFromBundleText(JSON.stringify(sealed), "sealed.json");
    expect(untrusted.code, untrusted.lines.join("\n")).toBe(0);
    expect(untrusted.markdown).not.toContain("UNAUTHENTICATED");
    expect(untrusted.markdown).toContain("UNVERIFIED SEAL KEY:");
    expect(untrusted.markdown).toContain("**Written by:** `claude` (`Anthropic`)");
    expect(untrusted.markdown).toContain("**Checked blind by:** `codex` (`OpenAI`) — **PASS**");
    expect(untrusted.markdown).toContain("**Accepted by:** unverified claim naming `mem_owner`");
    expect(untrusted.markdown).not.toContain("passkey decision");
    expect(untrusted.markdown).toContain("bundle key, ownership unconfirmed");
    const signedHead = sealed.segment.find((e) => e.seq === sealed.seal!.payload.head_seq)!;
    const sealRecordEvent = sealed.segment.at(-1)!;
    expect(sealRecordEvent.type).toBe("chain.sealed");
    expect(sealRecordEvent.seq).toBe(signedHead.seq + 1);
    expect(untrusted.markdown).toContain(`head #${signedHead.seq} \`${signedHead.digest.value.slice(0, 12)}\``);
    expect(untrusted.markdown).not.toContain(`head #${signedHead.seq} \`${sealRecordEvent.digest.value.slice(0, 12)}\``);

    // With external trustedSealKeys matching the enrolled key_digest, key ownership is verified
    // while still honestly noting the per-decision WebAuthn assertion is absent from the bundle.
    const sealKeyDigest = keyDigest(Buffer.from(sealed.seal_evidence!.public_key!, "base64url"));
    const trusted = await prReceiptFromBundleText(JSON.stringify(sealed), "sealed.json", {
      trustedSealKeys: new Map([["mem_owner", sealKeyDigest]]),
    });
    expect(trusted.code, trusted.lines.join("\n")).toBe(0);
    expect(trusted.markdown).toContain(`head #${signedHead.seq} \`${signedHead.digest.value.slice(0, 12)}\``);
    expect(trusted.markdown).not.toContain(`head #${signedHead.seq} \`${sealRecordEvent.digest.value.slice(0, 12)}\``);
    expect(trusted.markdown).not.toContain("UNVERIFIED SEAL KEY");
    expect(trusted.markdown).toContain("**Accepted by:** recorded `mem_owner` (decision `D-1`, subject `sha256:eeeeeeeeeeee`, under trusted seal of `mem_owner`, per-decision WebAuthn assertion not in bundle)");
    expect(trusted.markdown).not.toContain("passkey decision");
    expect(trusted.markdown).toContain("sealed by `seal_test123`");
    expect(trusted.markdown).toContain("(trusted key)");

    const agentAccept = makeSealedBundle("WP-SEAL-2", [
      { type: "package.created", subject: "WP-SEAL-2" },
      { type: "run.succeeded", subject: "R-1", actor: { kind: "agent", id: "claude" }, data: { package: "WP-SEAL-2", role: "author", round: 1, outputs: ["diff.patch"] } },
      { type: "package.pre-checked", subject: "WP-SEAL-2", actor: { kind: "agent", id: "codex" }, data: { revision: 1, round: 1, outcome: "pass", findings: 0, shared_runtime: false } },
      { type: "decision.accept", subject: "WP-SEAL-2", actor: { kind: "agent", id: "claude" }, data: { revision: 1, decision: "D-2", subject_digest: digestVal } },
    ]);
    const resAgent = await prReceiptFromBundleText(JSON.stringify(agentAccept), "agent.json");
    expect(resAgent.code).toBe(0);
    expect(resAgent.markdown).toContain("**Accepted by:** not yet accepted");

    const superseded = makeSealedBundle("WP-SEAL-3", [
      { type: "package.created", subject: "WP-SEAL-3" },
      { type: "run.succeeded", subject: "R-1", actor: { kind: "agent", id: "claude" }, data: { package: "WP-SEAL-3", role: "author", round: 1, outputs: ["diff.patch"] } },
      { type: "package.pre-checked", subject: "WP-SEAL-3", actor: { kind: "agent", id: "codex" }, data: { revision: 1, round: 1, outcome: "pass", findings: 0, shared_runtime: false } },
      { type: "decision.accept", subject: "WP-SEAL-3", actor: { kind: "human", id: "mem_owner" }, data: { revision: 1, decision: "D-3", subject_digest: digestVal } },
      { type: "decision.reject", subject: "WP-SEAL-3", actor: { kind: "human", id: "mem_owner" }, data: { revision: 1, decision: "D-4", subject_digest: digestVal } },
    ]);
    const resSup = await prReceiptFromBundleText(JSON.stringify(superseded), "sup.json");
    expect(resSup.code).toBe(0);
    expect(resSup.markdown).toContain("**Accepted by:** not yet accepted");

    const mismatchedRev = makeSealedBundle("WP-SEAL-4", [
      { type: "package.created", subject: "WP-SEAL-4" },
      { type: "run.succeeded", subject: "R-1", actor: { kind: "agent", id: "claude" }, data: { package: "WP-SEAL-4", role: "author", round: 1, outputs: ["diff.patch"] } },
      { type: "package.pre-checked", subject: "WP-SEAL-4", actor: { kind: "agent", id: "codex" }, data: { revision: 2, round: 1, outcome: "pass", findings: 0, shared_runtime: false } },
      { type: "decision.accept", subject: "WP-SEAL-4", actor: { kind: "human", id: "mem_owner" }, data: { revision: 1, decision: "D-5", subject_digest: digestVal } },
    ]);
    const resRev = await prReceiptFromBundleText(JSON.stringify(mismatchedRev), "rev.json");
    expect(resRev.code).toBe(0);
    expect(resRev.markdown).toContain("**Accepted by:** not yet accepted");
  });

  it("normalizes control-plane baseline actor IDs (author-claude / checker-codex) while still failing closed on unknown prefixes", async () => {
    expect(normalizeProvider("author-claude")).toBe("claude");
    expect(normalizeProvider("checker-codex")).toBe("codex");
    expect(normalizeProvider("cli-checker-grok")).toBe("grok");
    expect(normalizeProvider("author-opencode")).toBe("opencode");

    const bundle = makeSealedBundle("WP-PREF-1", [
      { type: "package.created", subject: "WP-PREF-1" },
      { type: "run.succeeded", subject: "R-1", actor: { kind: "agent", id: "author-claude" }, data: { package: "WP-PREF-1", role: "author", round: 1, outputs: ["diff.patch"] } },
      { type: "package.pre-checked", subject: "WP-PREF-1", actor: { kind: "agent", id: "checker-codex" }, data: { revision: 1, round: 1, outcome: "pass", findings: 0, shared_runtime: false } },
    ]);
    const res = await prReceiptFromBundleText(JSON.stringify(bundle), "pref.json");
    expect(res.code, res.lines.join("\n")).toBe(0);
    expect(res.markdown).toContain("**Written by:** `claude` (`Anthropic`)");
    expect(res.markdown).toContain("**Checked blind by:** `codex` (`OpenAI`) — **PASS**");

    const unknownPrefix = makeSealedBundle("WP-PREF-2", [
      { type: "package.created", subject: "WP-PREF-2" },
      { type: "run.succeeded", subject: "R-1", actor: { kind: "agent", id: "author-opencode" }, data: { package: "WP-PREF-2", role: "author", round: 1, outputs: ["diff.patch"] } },
      { type: "package.pre-checked", subject: "WP-PREF-2", actor: { kind: "agent", id: "checker-codex" }, data: { revision: 1, round: 1, outcome: "pass", findings: 0, shared_runtime: false } },
    ]);
    const resUnknown = await prReceiptFromBundleText(JSON.stringify(unknownPrefix), "pref-unknown.json");
    expect(resUnknown.code).toBe(0);
    expect(resUnknown.markdown).not.toContain("**Checked blind by:**");
    expect(resUnknown.markdown).toContain("**Checked by:** `codex` (`OpenAI`) (shared or unknown vendor family)");
  });

  it("never credits authorship from failed or output-free author runs", async () => {
    const failedRun = makeSealedBundle("WP-FAIL-1", [
      { type: "package.created", subject: "WP-FAIL-1" },
      { type: "run.started", subject: "R-fail", actor: { kind: "agent", id: "author-claude" }, data: { package: "WP-FAIL-1", role: "author", round: 1 } },
      { type: "run.failed", subject: "R-fail", actor: { kind: "agent", id: "author-claude" }, data: { package: "WP-FAIL-1", role: "author", round: 1, error: "crash" } },
      { type: "package.pre-checked", subject: "WP-FAIL-1", actor: { kind: "agent", id: "checker-codex" }, data: { revision: 1, round: 1, outcome: "pass", findings: 0, shared_runtime: false } },
    ]);
    const resFailed = await prReceiptFromBundleText(JSON.stringify(failedRun), "failed.json");
    expect(resFailed.code).toBe(0);
    expect(resFailed.markdown).toContain("**Written by:** `unknown`");
    expect(resFailed.markdown).not.toContain("**Checked blind by:**");
    expect(resFailed.markdown).toContain("shared or unknown vendor family");

    const emptyOutputs = makeSealedBundle("WP-EMPTY-1", [
      { type: "package.created", subject: "WP-EMPTY-1" },
      { type: "run.succeeded", subject: "R-empty", actor: { kind: "agent", id: "author-claude" }, data: { package: "WP-EMPTY-1", role: "author", round: 1, outputs: [] } },
      { type: "package.pre-checked", subject: "WP-EMPTY-1", actor: { kind: "agent", id: "checker-codex" }, data: { revision: 1, round: 1, outcome: "pass", findings: 0, shared_runtime: false } },
    ]);
    const resEmpty = await prReceiptFromBundleText(JSON.stringify(emptyOutputs), "empty.json");
    expect(resEmpty.code).toBe(0);
    expect(resEmpty.markdown).toContain("**Written by:** `unknown`");
    expect(resEmpty.markdown).not.toContain("**Checked blind by:**");
  });
});
