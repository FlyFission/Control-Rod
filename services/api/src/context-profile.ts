/**
 * Context profiles for agent briefs. A card runs Light (the brief as it has always been) or
 * Nuclear (the nuclear-grade pack's Core card and the clusters its structured facts select).
 * Everything here decides from package, project and role facts; nothing reads agent prose.
 * `loadNuclearPack` reads the pack from disk; the rest is pure.
 */
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, normalize, relative, sep } from "node:path";

export type ContextProfile = "light" | "nuclear";
export interface ResolvedProfile {
  profile: ContextProfile;
  /** True when the package's grade or scope forces Nuclear and no setting can lower it. */
  locked: boolean;
  reason?: string;
}

type Json = Record<string, any>;
const isProfile = (v: unknown): v is ContextProfile => v === "light" || v === "nuclear";

/**
 * Trust surfaces (AGENTS.md rule 2). A package scoped to one of these would lock Nuclear, but the
 * WorkPackage contract has no path scope today: deliverables carry an id, a type and formats, and
 * interfaces name parameters, not files. So this rule has nothing to read yet and is not applied;
 * when spec/ adds a path scope, match it against this list in resolveContextProfile.
 */
export const TRUST_SURFACE_PATHS = ["policies/", "tests/redteam/", ".github/workflows/", "kernel/", "spec/"] as const;

/**
 * The profile a package's runs use: locked Nuclear for Safety or Material grade, else the card's
 * own setting, else the project's default, else Light. Unknown values are ignored.
 */
export function resolveContextProfile(pkg: Json | undefined, project: Json | null | undefined): ResolvedProfile {
  const grade = pkg?.grade;
  if (grade === "safety") return { profile: "nuclear", locked: true, reason: "Safety grade work is always Nuclear" };
  if (grade === "material") return { profile: "nuclear", locked: true, reason: "Material grade work is always Nuclear" };
  if (isProfile(pkg?.context_profile))
    return { profile: pkg.context_profile, locked: false, reason: `The card is set to ${label(pkg.context_profile)}` };
  if (isProfile(project?.default_context_profile))
    return { profile: project.default_context_profile, locked: false, reason: `The project default is ${label(project.default_context_profile)}` };
  return { profile: "light", locked: false };
}

const label = (p: ContextProfile) => (p === "nuclear" ? "Nuclear" : "Light");

export const CLUSTER_IDS = [
  "agent-authority",
  "claims-discipline",
  "configuration-management",
  "hygiene",
  "incident-deficiency",
  "review-panel",
] as const;
export type ClusterId = (typeof CLUSTER_IDS)[number];

/** Structured facts cluster selection reads. Never agent-written text. */
export interface ClusterFacts {
  /** The role's qualified tools, as readRoleTools returns them. */
  tools: string[];
  /** The network hosts the role's tools file asks for. */
  hosts: string[];
  deliverables: { type?: string; format?: string[] }[];
  rigorMode?: string;
  grade?: string;
}

/** Tools that change files (write) or run programs (run). */
const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
const RUN_TOOLS = new Set(["Bash"]);
/** Deliverable types that are public documents or claims made to others. */
const PUBLIC_DELIVERABLE_TYPES = new Set([
  "announcement",
  "claim",
  "documentation",
  "marketing",
  "press-release",
  "publication",
  "readme",
  "website",
  "white-paper",
]);
const toolName = (t: string) => t.replace(/\(.*$/, "").trim();

/**
 * The cluster rule table. One rule per cluster; each reads only structured facts.
 * hygiene and incident-deficiency stay in the pack but are not selectable yet: no WorkPackage
 * field says when they apply, and the contract allows no undeclared ones. Each needs a declared
 * contract field in spec/ (follow-up) before a rule can read it.
 */
const CLUSTER_RULES: Record<ClusterId, (f: ClusterFacts) => boolean> = {
  // The role may write files, run programs or reach the network (its tools file says so).
  "agent-authority": (f) => f.hosts.length > 0 || f.tools.some((t) => WRITE_TOOLS.has(toolName(t)) || RUN_TOOLS.has(toolName(t))),
  // A deliverable is a public document or claim: its type is in PUBLIC_DELIVERABLE_TYPES or starts "public-".
  "claims-discipline": (f) =>
    f.deliverables.some((d) => {
      const t = typeof d?.type === "string" ? d.type.trim().toLowerCase() : "";
      return PUBLIC_DELIVERABLE_TYPES.has(t) || t.startsWith("public-");
    }),
  // Rigor mode is Standard or High consequence.
  "configuration-management": (f) => f.rigorMode === "standard" || f.rigorMode === "high-consequence",
  // Safety grade work gets the review panel card.
  "review-panel": (f) => f.grade === "safety",
  // Not selectable yet; needs a declared contract field (follow-up).
  "incident-deficiency": () => false,
  hygiene: () => false,
};

/** The clusters a Nuclear brief carries, sorted. */
export function selectClusters(facts: ClusterFacts): ClusterId[] {
  return CLUSTER_IDS.filter((id) => CLUSTER_RULES[id](facts)).sort();
}

/** The nuclear-grade pack, read and checked. Texts and bytes are loaded so the brief builder stays pure. */
export interface NuclearPack {
  commit: string;
  core: { card: string; skills: string[] };
  clusters: Record<string, { card: string; skills: string[] }>;
  /** Template files by mode (quick, standard, cm): published name under templates/<mode>/, and bytes. */
  templates: Record<string, { name: string; bytes: Buffer }[]>;
  /** Full skill files by skill name, from reference/<skill>/SKILL.md. */
  skills: Record<string, Buffer>;
}

export type Input = { name: string; content_base64: string };
const input = (name: string, content: string | Buffer): Input => ({ name, content_base64: Buffer.from(content).toString("base64") });

const climbs = (r: string) => !r || r === ".." || r.startsWith(`..${sep}`) || isAbsolute(r);

/**
 * A path inside the pack, refusing absolute paths and anything that climbs out, by name or through
 * a symlink anywhere on the way: the file's real path must sit under the pack root's real path.
 * `root` is the pack directory's real path.
 */
function inside(dir: string, root: string, rel: unknown): string {
  if (typeof rel !== "string" || !rel || isAbsolute(rel)) throw new Error(`nuclear-grade pack: bad path ${String(rel)}`);
  const p = normalize(join(dir, rel));
  if (climbs(relative(dir, p))) throw new Error(`nuclear-grade pack: path ${rel} leaves the pack`);
  if (!existsSync(p)) throw new Error(`nuclear-grade pack: ${rel} is missing`);
  const real = realpathSync(p);
  if (climbs(relative(root, real))) throw new Error(`nuclear-grade pack: path ${rel} leaves the pack`);
  if (!statSync(real).isFile()) throw new Error(`nuclear-grade pack: ${rel} is missing`);
  return real;
}

/**
 * Reads a pack file and checks its bytes against the manifest's `files` digest. A file the
 * manifest does not list, or whose digest differs, fails the whole pack.
 */
function verified(dir: string, root: string, files: Json, rel: unknown): Buffer {
  const bytes = readFileSync(inside(dir, root, rel));
  const want = files[rel as string];
  if (typeof want !== "string") throw new Error(`nuclear-grade pack: ${String(rel)} has no digest in the manifest`);
  const got = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  if (got !== want) throw new Error(`nuclear-grade pack: ${String(rel)} does not match its manifest digest`);
  return bytes;
}

const SKILL_NAME = /^[a-z0-9][a-z0-9._-]*$/i;
const skillList = (v: unknown): string[] => {
  if (!Array.isArray(v)) return [];
  for (const s of v) if (typeof s !== "string" || !SKILL_NAME.test(s)) throw new Error(`nuclear-grade pack: bad skill name ${String(s)}`);
  return v as string[];
};

/** Every file under a directory, sorted, as paths relative to it. */
function filesUnder(dir: string): string[] {
  const out: string[] = [];
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop() as string;
    if (!existsSync(d) || !lstatSync(d).isDirectory()) continue;
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      const st = lstatSync(p);
      if (st.isDirectory()) stack.push(p);
      else if (st.isFile()) out.push(relative(dir, p).split(sep).join("/"));
    }
  }
  return out.sort();
}

/**
 * Reads packs/nuclear-grade (or another directory laid out the same way). Returns null when the
 * pack is not installed; throws when its manifest names files that are missing, outside it (by
 * name or through a symlink), or whose bytes differ from the manifest's `files` digests.
 * budgets.json is not in the manifest by design and is never read here.
 */
export function loadNuclearPack(dir: string): NuclearPack | null {
  const manifestPath = join(dir, "manifest.json");
  if (!existsSync(manifestPath)) return null;
  const root = realpathSync(dir);
  const m = JSON.parse(readFileSync(inside(dir, root, "manifest.json"), "utf8")) as Json;
  if (!m.core || typeof m.core !== "object") throw new Error("nuclear-grade pack: manifest has no core");
  if (!m.files || typeof m.files !== "object" || Array.isArray(m.files)) throw new Error("nuclear-grade pack: manifest has no file digests");
  const read = (rel: unknown) => verified(dir, root, m.files, rel);
  const core = { card: read(m.core.card).toString("utf8"), skills: skillList(m.core.skills) };
  const clusters: NuclearPack["clusters"] = {};
  for (const [id, c] of Object.entries((m.clusters ?? {}) as Record<string, Json>))
    clusters[id] = { card: read(c.card).toString("utf8"), skills: skillList(c.skills) };
  const skills: Record<string, Buffer> = {};
  for (const s of new Set([...core.skills, ...Object.values(clusters).flatMap((c) => c.skills)]))
    skills[s] = read(`reference/${s}/SKILL.md`);
  const templates: NuclearPack["templates"] = {};
  for (const [mode, list] of Object.entries((m.templates ?? {}) as Record<string, unknown>)) {
    if (!SKILL_NAME.test(mode)) throw new Error(`nuclear-grade pack: bad template mode ${mode}`);
    // A listed entry is a file under templates/<mode>/ (or a pack path starting templates/<mode>/);
    // with no list, every file under templates/<mode>/ ships.
    const base = `templates/${mode}/`;
    const names = Array.isArray(list) ? list.map((e) => (typeof e === "string" && e.startsWith(base) ? e.slice(base.length) : e)) : filesUnder(join(dir, base));
    templates[mode] = names.map((n) => ({ name: n as string, bytes: read(`${base}${n as string}`) }));
  }
  return { commit: typeof m.commit === "string" ? m.commit : "unknown", core, clusters, templates, skills };
}

/** Template modes a rigor mode ships: Quick for Quick and Administrative, Standard, or Standard and CM. */
export function templateModes(rigorMode: string | undefined): string[] {
  if (rigorMode === "high-consequence") return ["standard", "cm"];
  if (rigorMode === "standard") return ["standard"];
  return ["quick"];
}

const isChecker = (role: string) => role === "pre-check" || role === "checker";

/**
 * The Nuclear brief sections and the input files that go with them. Cards go in the brief; full
 * skills go in as inputs/reference/<skill>/SKILL.md and templates as inputs/templates/<mode>/...,
 * never inline. `reason` is why the profile is Nuclear, shown in the section's first line.
 */
export function nuclearBriefSections(
  pack: NuclearPack,
  clusters: string[],
  role: string,
  rigorMode: string | undefined,
  reason?: string,
): { sections: string[]; inputs: Input[] } {
  const chosen = clusters.filter((id) => pack.clusters[id]).sort();
  const sections: string[] = [
    `## Nuclear-grade context\n\nThis package runs under the Nuclear context profile${reason ? ` (${reason})` : ""}. Pack ${pack.commit}. Clusters: ${chosen.length ? chosen.join(", ") : "none"}.\n`,
    pack.core.card,
    ...chosen.map((id) => pack.clusters[id]!.card),
  ];
  const modes = templateModes(rigorMode).filter((m) => pack.templates[m]?.length);
  const inputs: Input[] = [];
  for (const m of modes) for (const t of pack.templates[m]!) inputs.push(input(`templates/${m}/${t.name}`, t.bytes));
  const skillNames = [...new Set([...pack.core.skills, ...chosen.flatMap((id) => pack.clusters[id]!.skills)])].sort();
  for (const s of skillNames) if (pack.skills[s]) inputs.push(input(`reference/${s}/SKILL.md`, pack.skills[s]!));
  const where = modes.length ? modes.map((m) => `inputs/templates/${m}/`).join(" and ") : "none for this rigor mode";
  sections.push(`Templates for ${rigorMode ?? "quick"} rigor: ${where}. Full skills the cards name: inputs/reference/<skill>/SKILL.md.\n`);
  if (isChecker(role))
    sections.push("As checker, verify the author followed the same Core and cluster cards above; report each departure as a finding.\n");
  return { sections, inputs };
}
