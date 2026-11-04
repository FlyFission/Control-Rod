import { createHash } from "node:crypto";
import type { Tx } from "./db/index.js";
import { digest } from "./kernel.js";
import { currentSandboxPolicy, recordSandboxPolicy } from "./workbench.js";

/**
 * Sandbox policy resolution (workbench plan task 6.1; specification 23; ADR 0021). Every run is
 * dispatched under one SandboxPolicy version, resolved here from the run's lane, its package's grade
 * and what its role asks for, recorded (versions are frozen) and bound to the run by digest. The
 * daemon derives each CLI's settings from that policy alone and refuses to launch without it.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- records are validated JSON */
type Json = any;

/**
 * Paths agent actions can never read. `~` is the whole home folder except the run's own workspace
 * (both CLIs confine reads to the workspace inside a denied home; measured in evidence/phase6), so
 * login folders and credential stores nobody listed are covered too. The named entries repeat the
 * known stores so a single control failing does not expose them, and `/mnt` keeps WSL's Windows
 * drives out of reach.
 */
export const DENIED_READ = [
  "~", "~/.claude", "~/.codex", "~/.ssh", "~/.config/gh", "~/.git-credentials", "~/.netrc", "~/.aws", "~/.azure",
  "~/.config/gcloud", "~/.kube", "~/.docker", "~/.gnupg", "~/.local/share/keyrings", "~/.password-store", "~/.npmrc",
  "~/.pypirc", "~/.controlrod", "/mnt",
] as const;

/** Agent tools a policy may enable, in Control Rod's own words; the daemon maps them per CLI. */
export const QUALIFIED_TOOLS = ["command", "read", "edit", "write", "search"] as const;

/** Claims the in-run probe must observe (plan task 6.5). */
export const CLAIMS = {
  homeConfined: "agent actions cannot read the home folder outside the workspace",
  noNetwork: "agent actions have no network",
  hostsOnly: "agent actions reach only the allowed hosts",
  writesConfined: "agent writes stay in the workspace",
} as const;

/**
 * Where a role may have network for its agent actions: named hosts only, and only for lanes and
 * grades where sending a request to a public service cannot carry sensitive work out. Every other
 * combination runs with no network.
 */
const NETWORK_LANES = new Set(["public", "internal"]);
const NETWORK_GRADES = new Set(["general-service"]);

/** A host name as a role may list it: no scheme, port, path or wildcard. */
const HOST = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/**
 * What a role's tools file asks for. Tool lines pass through as the Claude Code allowlist, less any
 * tool the sandbox has not qualified; a `network:` line names the hosts its agent actions need,
 * separated by commas or spaces.
 */
export function readRoleTools(text: string): { tools: string[]; hosts: string[]; malformed: string[] } {
  const tools: string[] = [];
  const hosts: string[] = [];
  const malformed: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const net = /^network\s*:(.*)$/i.exec(line);
    if (net) {
      for (const h of net[1]!.split(/[\s,]+/).map((x) => x.trim().toLowerCase()).filter(Boolean)) {
        if (HOST.test(h)) hosts.push(h);
        else malformed.push(h);
      }
      continue;
    }
    if (UNQUALIFIED.has(line.replace(/\(.*$/, ""))) continue;
    tools.push(line);
  }
  return { tools, hosts: [...new Set(hosts)].sort(), malformed };
}

/** Claude Code tools the sandbox does not cover yet (ADR 0021 conditions): never enabled. */
const UNQUALIFIED = new Set(["WebFetch", "WebSearch", "Task", "Agent", "NotebookEdit", "NotebookRead"]);

/** The tools file as the daemon receives it: qualified tools, and the network line only when allowed. */
export function toolsFile(tools: string[], hosts: string[]): string {
  return [...(hosts.length ? [`network: ${hosts.join(", ")}`] : []), ...tools, ""].join("\n");
}

export interface NetworkDecision {
  hosts: string[];
  /** Why the role may not have the network it asks for here, in words; absent when it may. */
  refused?: string;
}

/** Whether a role's hosts are allowed for this lane and grade. */
export function networkFor(asked: { hosts: string[]; malformed: string[] }, lane: string, grade: string | undefined): NetworkDecision {
  if (asked.malformed.length)
    return { hosts: [], refused: `This role's tools file names network entries that are not plain host names (${asked.malformed.join(", ")}); an administrator lists each host by name` };
  if (!asked.hosts.length) return { hosts: [] };
  const g = grade ?? "general-service";
  if (!NETWORK_LANES.has(lane) || !NETWORK_GRADES.has(g))
    return { hosts: [], refused: `This role needs network to ${asked.hosts.join(", ")}, which the sandbox policy allows only for public or internal work of general-service grade; this is ${lane} work of ${g} grade` };
  return { hosts: asked.hosts };
}

/** Runtimes that can hold a policy: Codex can switch network on or off, not limit it to hosts. */
export function runtimesForHosts(offer: string[], hosts: string[]): string[] {
  return hosts.length ? offer.filter((r) => r !== "codex") : offer;
}

/** The policy body for an organization and a set of allowed hosts, without id or version. */
function content(orgId: string, hosts: string[]) {
  return {
    org_id: orgId,
    driver: "native-cli",
    denied_read: [...DENIED_READ],
    writable_roots: ["workspace"],
    allowed_hosts: hosts,
    enabled_tools: [...QUALIFIED_TOOLS],
    mandatory_claims: [CLAIMS.homeConfined, hosts.length ? CLAIMS.hostsOnly : CLAIMS.noNetwork, CLAIMS.writesConfined],
  };
}

/**
 * One policy per organization and host set (a tenancy id: `sbp_` then `none-` or `net-` and a hash
 * of both); a new version is recorded only when its content changes.
 */
export function policyId(orgId: string, hosts: string[]): string {
  const h = createHash("sha256").update(`${orgId}\n${hosts.join(",")}`).digest("hex").slice(0, 20);
  return `sbp_${hosts.length ? "net" : "none"}-${h}`;
}

export interface ResolvedPolicy {
  body: Json;
  ref: { id: string; version: number; digest: { algorithm: "sha256"; value: string } };
}

/**
 * The policy a run is dispatched under, recorded if this is its first use or its content changed.
 * The caller holds the claim's transaction; recordSandboxPolicy serializes versions per id.
 */
export async function resolveSandboxPolicy(c: Tx, orgId: string, hosts: string[]): Promise<ResolvedPolicy> {
  const id = policyId(orgId, hosts);
  const want = content(orgId, hosts);
  const current = await currentSandboxPolicy(c, id);
  if (current) {
    const { id: _i, version: _v, ...had } = current.body;
    if (digest(had) === digest(want))
      return { body: current.body, ref: { id, version: current.body.version, digest: { algorithm: "sha256", value: current.digest } } };
  }
  const body = { id, version: (current?.body.version ?? 0) + 1, ...want };
  const { digest: d } = await recordSandboxPolicy(c, body, { kind: "system", id: "control-rod" });
  return { body, ref: { id, version: body.version, digest: { algorithm: "sha256", value: d } } };
}
