import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CLAIM_PROTOCOL, claimProtocolRefusal } from "../src/work.js";

const repo = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const schemas = join(repo, "spec", "generated", "json-schema");

/** The Job schema and every schema it refers to, as one digest: what a daemon must be able to read. */
function jobSchemaDigest(): string {
  const seen = new Map<string, string>();
  const walk = (name: string) => {
    if (seen.has(name)) return;
    const text = readFileSync(join(schemas, name), "utf8");
    seen.set(name, text);
    for (const m of text.matchAll(/"\$ref":\s*"([^"#]+)/g)) walk(m[1]!);
  };
  walk("Job.json");
  const h = createHash("sha256");
  for (const k of [...seen.keys()].sort()) h.update(`${k}\n${seen.get(k)}\n`);
  return h.digest("hex");
}

/**
 * The Job a claim hands out, pinned to the claim protocol version (review DMN-4). When this fails the
 * Job schema changed: if a daemon of the current version could now get a job it cannot read (its
 * schema refuses fields it does not know), raise CLAIM_PROTOCOL in work.ts and ClaimProtocol in
 * daemon/internal/runner/client.go together. Either way, record the new digest here.
 */
const PINNED: Record<number, string> = {
  1: "adf3b6f63938be44cb8ef44f57d60eff6daba878c0e1e41fcab47962daf937a2",
};

describe("claim protocol", () => {
  it("pins the Job schema to the protocol version", () => {
    expect(PINNED[CLAIM_PROTOCOL], "no digest recorded for this claim protocol").toBeDefined();
    expect(jobSchemaDigest()).toBe(PINNED[CLAIM_PROTOCOL]);
  });

  it("is the version the daemon speaks", () => {
    const client = readFileSync(join(repo, "daemon", "internal", "runner", "client.go"), "utf8");
    expect(/const ClaimProtocol = (\d+)/.exec(client)?.[1]).toBe(String(CLAIM_PROTOCOL));
  });

  it("lets a daemon that sends no version claim as version 1, and refuses anything older or malformed", () => {
    expect(claimProtocolRefusal(CLAIM_PROTOCOL)).toBeNull();
    expect(claimProtocolRefusal(CLAIM_PROTOCOL + 1)).toBeNull();
    // An absent version is 1: refused only once the server needs more.
    expect(claimProtocolRefusal(undefined) === null).toBe(CLAIM_PROTOCOL === 1);
    for (const bad of [0, -1, 1.5, "1", null]) expect(claimProtocolRefusal(bad)?.code).toBe("daemon-outdated");
  });
});
