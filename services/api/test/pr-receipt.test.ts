import { describe, expect, it } from "vitest";
import { type EventRecord, eventDigest } from "../src/events.js";
import { formatPrReceipt, prReceiptFromBundleText } from "../src/pr-receipt.js";

type Json = Record<string, any>;

function chain(specs: { type: string; subject: string; actor?: { kind: "human" | "agent" | "system"; id: string }; data?: Json }[]): EventRecord[] {
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
}

describe("PR receipt", () => {
  it("formats a full Control Rod PR receipt with offline verify command", () => {
    const md = formatPrReceipt({
      packageId: "WP-0042",
      revision: 3,
      author: { provider: "claude", model: "claude-sonnet-4-5" },
      checker: { provider: "codex", model: "gpt-5-codex", outcome: "pass", findingsCount: 0, independent: true },
      acceptance: { acceptedBy: "mem_ben", decisionId: "dec_1234", acceptedAt: "2026-11-22T12:00:00Z" },
      proof: { bundlePath: "WP-0042-inclusion-proof.json", sealedBy: "seal_abc", headSeq: 15, witnessed: false },
    });
    expect(md).toContain("<!-- controlrod-pr-receipt:v1 -->");
    expect(md).toContain("`WP-0042` (rev 3)");
    expect(md).toContain("**Written by:** `claude` (`Anthropic`, model `claude-sonnet-4-5`)");
    expect(md).toContain("**Checked blind by:** `codex` (`OpenAI`, model `gpt-5-codex`) — **PASS** (0 findings)");
    expect(md).toContain("**Accepted by:** `mem_ben` (passkey decision `dec_1234`, 2026-11-22T12:00:00Z)");
    expect(md).toContain("`pnpm cr verify WP-0042-inclusion-proof.json`");
    expect(md).toContain("Local chain, not witnessed");
  });

  it("refuses to claim blind checking when author and checker share a family", () => {
    const md = formatPrReceipt({
      packageId: "WP-0043",
      author: { provider: "claude" },
      checker: { provider: "claude", outcome: "pass", findingsCount: 1, independent: true },
    });
    expect(md).not.toContain("**Checked blind by:**");
    expect(md).toContain("**Checked by:**");
    expect(md).toContain("shared or unknown vendor family");
    expect(md).toContain("**Accepted by:** not yet accepted");
  });

  it("derives an honest receipt from a valid inclusion proof bundle and rejects tampered bundles", async () => {
    const segment = chain([
      { type: "package.created", subject: "WP-99" },
      { type: "run.started", subject: "R-auth", actor: { kind: "agent", id: "claude" }, data: { package: "WP-99", role: "author", round: 1 } },
      { type: "package.pre-checked", subject: "WP-99", actor: { kind: "agent", id: "codex" }, data: { revision: 1, round: 1, outcome: "pass", findings: 0, shared_runtime: false } },
      { type: "decision.accept", subject: "WP-99", actor: { kind: "human", id: "mem_owner" }, data: { revision: 1, decision: "dec_99" } },
    ]);
    const bundle = {
      package_id: "WP-99",
      segment,
      seal: null,
      head: { seq: 4, digest: segment[3]!.digest.value },
      witnessed: false,
      statement: "Local chain, not witnessed",
    };

    const ok = await prReceiptFromBundleText(JSON.stringify(bundle), "WP-99-proof.json");
    expect(ok.code).toBe(0);
    expect(ok.markdown).toContain("**Written by:** `claude`");
    expect(ok.markdown).toContain("**Checked blind by:** `codex`");
    expect(ok.markdown).toContain("**Accepted by:** `mem_owner`");
    expect(ok.markdown).toContain("pnpm cr verify WP-99-proof.json");
    expect(ok.markdown).toContain("unsealed");

    const tampered = structuredClone(bundle) as Json;
    tampered.segment[2].data.outcome = "fail";
    const bad = await prReceiptFromBundleText(JSON.stringify(tampered), "WP-99-proof.json");
    expect(bad.code).toBe(1);
    expect(bad.markdown).toBeUndefined();
    expect(bad.lines[0]).toContain("FAIL  WP-99");
  });
});
