import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { command } from "../src/commands/executor.js";
import { CLAIMS, DENIED_READ, networkFor, policyId, readRoleTools, resolveSandboxPolicy, runtimesForHosts, toolsFile } from "../src/sandbox.js";
import { type Harness, startHarness } from "./harness.js";

/** Sandbox policy resolution (workbench plan task 6.1; specification 23; ADR 0021). */

describe("what a role asks for", () => {
  it("passes only qualified tools, and reads the network line as named hosts", () => {
    const got = readRoleTools("# tools\nnetwork: Geo.dot.gov, hazards.fema.gov geo.dot.gov\nRead\nWebSearch\nWebFetch\nTask\nBash(cr-site:*)\n");
    expect(got).toEqual({ tools: ["Read", "Bash(cr-site:*)"], hosts: ["geo.dot.gov", "hazards.fema.gov"], malformed: [] });
    // Anything that is not a plain host name is refused, never widened: no scheme, port, path, wildcard or "on".
    expect(readRoleTools("network: on, https://x.gov, x.gov:443, *.gov, x.gov/path\n").malformed).toEqual(["on", "https://x.gov", "x.gov:443", "*.gov", "x.gov/path"]);
    expect(toolsFile(["Read"], ["a.gov", "b.gov"])).toBe("network: a.gov, b.gov\nRead\n");
    expect(toolsFile(["Read"], [])).toBe("Read\n");
  });

  it("allows named hosts only for public or internal work of general-service grade", () => {
    const asked = { hosts: ["geo.dot.gov"], malformed: [] };
    expect(networkFor(asked, "internal", undefined)).toEqual({ hosts: ["geo.dot.gov"] });
    expect(networkFor(asked, "public", "general-service")).toEqual({ hosts: ["geo.dot.gov"] });
    for (const [lane, grade] of [["proprietary", undefined], ["client-confidential", undefined], ["restricted", undefined], ["internal", "safety"], ["public", "material"]] as const)
      expect(networkFor(asked, lane, grade).refused).toMatch(/allows only for public or internal work of general-service grade/);
    expect(networkFor({ hosts: [], malformed: ["on"] }, "internal", undefined).refused).toMatch(/not plain host names \(on\)/);
    expect(networkFor({ hosts: [], malformed: [] }, "restricted", "safety")).toEqual({ hosts: [] });
    // Codex can switch network on or off, not limit it to hosts.
    expect(runtimesForHosts(["claude", "codex", "fake"], ["geo.dot.gov"])).toEqual(["claude", "fake"]);
    expect(runtimesForHosts(["claude", "codex"], [])).toEqual(["claude", "codex"]);
  });

  it("names exactly the hosts cr-site queries in the site roles' tools files", () => {
    const pack = new URL("../../../packs/capital-projects/site-concept/", import.meta.url);
    const sources = readFileSync(new URL("src/cr_site/sources.py", pack), "utf8");
    const hosts = [...new Set([...sources.matchAll(/"url": "https:\/\/([^/"]+)/g)].map((m) => m[1]!))].sort();
    expect(hosts.length).toBeGreaterThan(0);
    for (const role of ["site-parcel", "site-constraints"])
      expect(readRoleTools(readFileSync(new URL(`roles/${role}.tools.md`, pack), "utf8")).hosts).toEqual(hosts);
  });
});

describe("recording a policy", () => {
  let h: Harness;
  beforeAll(async () => { h = await startHarness(); }, 120_000);
  afterAll(async () => h?.stop());
  const resolve = (hosts: string[]) => command(h.db, "run.claim", async (c) =>
    resolveSandboxPolicy(c, (await c.query<{ id: string }>("select tenancy_sole_org() as id")).rows[0]!.id, hosts));

  it("records one frozen version per content, reuses it, and keeps each host set apart", async () => {
    const a = await resolve([]);
    expect(a.ref).toMatchObject({ id: expect.stringMatching(/^sbp_none-[0-9a-f]{20}$/), version: 1, digest: { algorithm: "sha256", value: expect.stringMatching(/^[0-9a-f]{64}$/) } });
    expect(a.body).toMatchObject({ driver: "native-cli", denied_read: [...DENIED_READ], allowed_hosts: [], writable_roots: ["workspace"],
      mandatory_claims: [CLAIMS.homeConfined, CLAIMS.noNetwork, CLAIMS.writesConfined] });
    expect(await resolve([])).toEqual(a);
    const net = await resolve(["geo.dot.gov"]);
    expect(net.ref.id).toMatch(/^sbp_net-/);
    expect(net.ref.id).not.toBe(a.ref.id);
    expect(net.body.mandatory_claims).toContain(CLAIMS.hostsOnly);
    // Recorded and frozen: the stored row's digest is the one the run cites.
    const row = (await h.db.query<{ digest: string }>("select digest from sandbox_policies where body->>'id' = $1", [a.ref.id])).rows;
    expect(row).toEqual([{ digest: a.ref.digest.value }]);
    // A different organization gets a different policy id for the same content.
    expect(policyId("org_a", [])).not.toBe(policyId("org_b", []));
  });

  it("records a new version when the policy's content changes", async () => {
    const before = await resolve([]);
    // An older content recorded under the same id, as a previous release would have left it.
    await h.admin.query("insert into sandbox_policies (body, digest) values ($1, $2)",
      [{ ...before.body, version: 2, denied_read: ["~/.claude"] }, "0".repeat(64)]);
    const after = await resolve([]);
    expect(after.ref.version).toBe(3);
    expect(after.body.denied_read).toEqual([...DENIED_READ]);
  });
});
