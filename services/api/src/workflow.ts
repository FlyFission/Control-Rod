/**
 * Workflows for agent briefs. A package runs one workflow: the plain playbook (nothing added to
 * the brief), or one of the packs under packs/workflows (Superpowers, Pocock, or the hybrid of the
 * two). The workflow sets how the work is sequenced; the context profile is a separate choice.
 * Everything here decides from package, project and capture-tag facts; nothing reads agent prose.
 * `loadWorkflowPacks` reads the packs from disk; the rest is pure.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, normalize, relative, sep } from "node:path";
import type { Input } from "./context-profile.js";

export type Workflow = "playbook" | "superpowers" | "pocock" | "pocock-superpowers";
export const WORKFLOWS: readonly Workflow[] = ["playbook", "superpowers", "pocock", "pocock-superpowers"];
export interface ResolvedWorkflow {
  workflow: Workflow;
  reason?: string;
}

type Json = Record<string, any>;
const isWorkflow = (v: unknown): v is Workflow => typeof v === "string" && (WORKFLOWS as readonly string[]).includes(v);

/**
 * The workflow a package's runs use: the card's own setting, else the project's default, else the
 * playbook. Unknown values are ignored. A playbook that nobody chose has no reason to give.
 */
export function resolveWorkflow(pkg: Json | undefined, project: Json | null | undefined): ResolvedWorkflow {
  if (isWorkflow(pkg?.workflow)) return { workflow: pkg.workflow, reason: `The card is set to ${pkg.workflow}` };
  if (isWorkflow(project?.default_workflow)) return { workflow: project.default_workflow, reason: `The project default is ${project.default_workflow}` };
  return { workflow: "playbook" };
}

/**
 * The tags a capture's header carries, or undefined when it has none. The New work form writes its
 * tags as `[key:value]` on the first line, then a blank line, then the person's text. The line is
 * read as top-level tags only: a value may hold brackets of its own (a project called
 * `Plant [Phase 2]`, a path), and whatever sits inside a value is part of that value, never a tag.
 * A first line with anything outside a tag, or with unbalanced brackets, is the person's own prose,
 * so a tag written inside a sentence selects nothing.
 */
export function captureTags(text: unknown): { key: string; value: string }[] | undefined {
  if (typeof text !== "string") return undefined;
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const tags: { key: string; value: string }[] = [];
  let i = 0;
  while (i < first.length) {
    const ch = first[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch !== "[") return undefined;
    let depth = 0;
    let end = -1;
    for (let k = i; k < first.length; k++) {
      if (first[k] === "[") depth++;
      else if (first[k] === "]" && --depth === 0) {
        end = k;
        break;
      }
    }
    if (end < 0) return undefined;
    const m = /^([a-z][a-z-]*):([\s\S]*)$/.exec(first.slice(i + 1, end));
    if (!m) return undefined;
    tags.push({ key: m[1]!, value: m[2]! });
    i = end + 1;
  }
  return tags.length ? tags : undefined;
}

/**
 * The workflow a capture asks for: the header's `[workflow:<id>]` tag. Nothing after the first line
 * is read, so prose that mentions a workflow changes nothing. An unknown id, or two tags that name
 * different workflows, is no tag at all: the request runs the playbook.
 */
export function captureWorkflow(text: unknown): Workflow | undefined {
  const tags = captureTags(text);
  if (!tags) return undefined;
  const found = new Set<Workflow>();
  for (const t of tags) {
    if (t.key !== "workflow") continue;
    // A workflow tag with an id nobody knows makes the whole tag line ambiguous.
    if (!isWorkflow(t.value)) return undefined;
    found.add(t.value);
  }
  return found.size === 1 ? [...found][0] : undefined;
}

/** Whether the header carries any `[workflow:...]` tag, known, unknown or conflicting. */
export function captureNamesWorkflow(text: unknown): boolean {
  return (captureTags(text) ?? []).some((t) => t.key === "workflow");
}

/**
 * The project a capture's header names (`[project:<code or name>]`, or `[project-id:<id>]` for a
 * workspace project, both written by the New work form),
 * or undefined. The value may contain spaces and brackets; two different project tags are no
 * project at all. Only the first line is read.
 */
export function captureProject(text: unknown): string | undefined {
  const tags = captureTags(text);
  if (!tags) return undefined;
  const found = new Set(tags.filter((t) => t.key === "project" || t.key === "project-id").map((t) => t.value.trim()).filter(Boolean));
  return found.size === 1 ? [...found][0] : undefined;
}

export type PackWorkflow = Exclude<Workflow, "playbook">;
export type Stage = "intake" | "author" | "pre-check";
const STAGES: readonly Stage[] = ["intake", "author", "pre-check"];
const BASE_PACKS = ["superpowers", "pocock"] as const;
const HYBRID = "pocock-superpowers";

/** A stage's skill, always with the pack it lives in. */
interface SkillRef {
  pack: string;
  skill: string;
}
interface StageCard {
  card: string;
  skills: SkillRef[];
}
export interface WorkflowPack {
  id: string;
  name: string;
  /** The upstream commit of each pack whose skills this workflow ships (the hybrid has two). */
  commits: Record<string, string>;
  stages: Record<Stage, StageCard>;
  /** Verified skill files by skill name, as paths relative to the skill's folder. Empty for the hybrid, which has no copies. */
  skills: Record<string, { name: string; bytes: Buffer }[]>;
}
/** A pack is null when its directory is not installed. */
export type WorkflowPacks = Partial<Record<PackWorkflow, WorkflowPack | null>>;

const climbs = (r: string) => !r || r === ".." || r.startsWith(`..${sep}`) || isAbsolute(r);

/**
 * A path inside the pack, refusing absolute paths and anything that climbs out, by name or through
 * a symlink anywhere on the way: the file's real path must sit under the pack root's real path.
 * `root` is the pack directory's real path.
 */
function inside(dir: string, root: string, rel: unknown, label: string): string {
  if (typeof rel !== "string" || !rel || isAbsolute(rel)) throw new Error(`${label}: bad path ${String(rel)}`);
  const p = normalize(join(dir, rel));
  if (climbs(relative(dir, p))) throw new Error(`${label}: path ${rel} leaves the pack`);
  if (!existsSync(p)) throw new Error(`${label}: ${rel} is missing`);
  const real = realpathSync(p);
  if (climbs(relative(root, real))) throw new Error(`${label}: path ${rel} leaves the pack`);
  if (!statSync(real).isFile()) throw new Error(`${label}: ${rel} is missing`);
  return real;
}

/** Reads a generated pack file and checks its bytes against the manifest's `files` digest. */
function verified(dir: string, root: string, files: Json, rel: string, label: string): Buffer {
  const bytes = readFileSync(inside(dir, root, rel, label));
  const want = files[rel];
  if (typeof want !== "string") throw new Error(`${label}: ${rel} has no digest in the manifest`);
  const got = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  if (got !== want) throw new Error(`${label}: ${rel} does not match its manifest digest`);
  return bytes;
}

const NAME = /^[a-z0-9][a-z0-9._-]*$/i;

/**
 * lock.json, one level above the packs: the digest of every manifest, workflow map and stage card.
 * Those files are ours or generated, not upstream copies, so the manifest cannot vouch for them;
 * the lock does, and every one is checked against it before use.
 */
type Lock = { files: Record<string, string>; dir: string } | null;

/** Null when there is no lock.json; any read that needs it then fails, so an empty packs folder still reads as not installed. */
function readLock(dir: string): Lock {
  const path = join(dir, "lock.json");
  if (!existsSync(path)) return null;
  const v = JSON.parse(readFileSync(path, "utf8"));
  if (!v || typeof v.files !== "object" || Array.isArray(v.files)) throw new Error("workflow packs: lock.json has no file digests");
  return { files: v.files as Record<string, string>, dir };
}

/** A manifest, map or card, read inside its pack and checked against the lock. */
function lockedBytes(dir: string, root: string, rel: string, lock: Lock, label: string): Buffer {
  if (!lock) throw new Error(`${label}: lock.json is missing beside the packs`);
  const bytes = readFileSync(inside(dir, root, rel, label));
  const key = relative(lock.dir, join(dir, rel)).split(sep).join("/");
  const want = lock.files[key];
  if (typeof want !== "string") throw new Error(`${label}: ${rel} is not in lock.json`);
  if (`sha256:${createHash("sha256").update(bytes).digest("hex")}` !== want) throw new Error(`${label}: ${rel} does not match lock.json`);
  return bytes;
}

function readJson(dir: string, root: string, rel: string, label: string, lock: Lock): Json {
  const v = JSON.parse(lockedBytes(dir, root, rel, lock, label).toString("utf8"));
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error(`${label}: ${rel} is not an object`);
  return v as Json;
}

/**
 * workflow.json's stages, with each card read from inside the pack. A skill is `<pack>:<skill>`; a
 * bare name means the pack's own (never in the hybrid, which owns none). `allowed` is the packs a
 * stage may name.
 */
function readStages(dir: string, root: string, w: Json, allowed: readonly string[], own: string | undefined, label: string, lock: Lock): Record<Stage, StageCard> {
  const out = {} as Record<Stage, StageCard>;
  for (const stage of STAGES) {
    const s = w.stages?.[stage];
    if (!s || typeof s !== "object") throw new Error(`${label}: workflow.json has no ${stage} stage`);
    if (!Array.isArray(s.skills)) throw new Error(`${label}: ${stage} stage names no skills list`);
    const skills: SkillRef[] = [];
    for (const raw of s.skills) {
      if (typeof raw !== "string") throw new Error(`${label}: bad skill ${String(raw)}`);
      const [pack, skill] = raw.includes(":") ? [raw.slice(0, raw.indexOf(":")), raw.slice(raw.indexOf(":") + 1)] : [own, raw];
      if (!pack || !skill || !NAME.test(pack) || !NAME.test(skill)) throw new Error(`${label}: bad skill ${raw}`);
      if (!allowed.includes(pack)) throw new Error(`${label}: ${stage} skill ${raw} names pack ${pack}, which this workflow does not use`);
      if (!skills.some((x) => x.pack === pack && x.skill === skill)) skills.push({ pack, skill });
    }
    out[stage] = { card: lockedBytes(dir, root, s.card, lock, label).toString("utf8"), skills };
  }
  return out;
}

const refsOf = (stages: Record<Stage, StageCard>) => STAGES.flatMap((s) => stages[s].skills);

/**
 * Reads one base pack (superpowers or pocock): the skills its stages name plus any `extra` skills
 * the hybrid takes from it. Returns null when the pack has no manifest (not installed).
 */
function readBasePack(dir: string, id: (typeof BASE_PACKS)[number], extra: Set<string>, lock: Lock): WorkflowPack | null {
  const label = `workflow pack ${id}`;
  if (!existsSync(join(dir, "manifest.json"))) return null;
  const root = realpathSync(dir);
  const m = readJson(dir, root, "manifest.json", label, lock);
  if (!m.files || typeof m.files !== "object" || Array.isArray(m.files)) throw new Error(`${label}: manifest has no file digests`);
  if (!m.skills || typeof m.skills !== "object" || Array.isArray(m.skills)) throw new Error(`${label}: manifest has no skills`);
  const w = readJson(dir, root, "workflow.json", label, lock);
  if (w.id !== id) throw new Error(`${label}: workflow.json names ${String(w.id)}`);
  const stages = readStages(dir, root, w, [id], id, label, lock);
  const names = new Set([...refsOf(stages).map((r) => r.skill), ...extra]);
  const skills: WorkflowPack["skills"] = {};
  for (const skill of [...names].sort()) {
    const listed = (m.skills as Json)[skill];
    if (!Array.isArray(listed) || listed.length === 0) throw new Error(`${label}: stage skill ${id}:${skill} does not resolve (the manifest lists no files for it)`);
    const base = `reference/${skill}/`;
    skills[skill] = [...listed].sort().map((rel) => {
      if (typeof rel !== "string" || !rel.startsWith(base) || rel.length === base.length) throw new Error(`${label}: ${String(rel)} is not under ${base}`);
      return { name: rel.slice(base.length), bytes: verified(dir, root, m.files, rel, label) };
    });
  }
  return { id, name: String(w.name ?? id), commits: { [id]: typeof m.commit === "string" ? m.commit : "unknown" }, stages, skills };
}

/**
 * Reads packs/workflows (or another directory laid out the same way). With `only`, reads just what
 * that workflow needs, so a damaged pack stops its own runs and no others. A pack that is not
 * installed is null. Throws when a file a pack ships is missing, outside the pack (by name or
 * through a symlink), or differs from its manifest digest, or when a stage names a skill that does
 * not resolve. Manifests, workflow maps and cards are checked against lock.json; the upstream files
 * each manifest lists are checked against the manifest.
 */
export function loadWorkflowPacks(dir: string, only?: PackWorkflow): WorkflowPacks {
  const out: WorkflowPacks = {};
  const lock = readLock(dir);
  const wantHybrid = !only || only === HYBRID;
  const extra: Record<string, Set<string>> = { superpowers: new Set(), pocock: new Set() };
  let hybrid: { root: string; w: Json; dir: string } | null = null;
  const hdir = join(dir, HYBRID);
  if (wantHybrid && existsSync(join(hdir, "workflow.json"))) {
    const root = realpathSync(hdir);
    hybrid = { root, dir: hdir, w: readJson(hdir, root, "workflow.json", `workflow pack ${HYBRID}`, lock) };
    // The hybrid's skills are read in the packs they live in, so find them before reading those.
    const stages = readStages(hdir, root, hybrid.w, [...BASE_PACKS], undefined, `workflow pack ${HYBRID}`, lock);
    for (const r of refsOf(stages)) extra[r.pack]!.add(r.skill);
  }
  for (const id of BASE_PACKS) {
    if (only && only !== id && !(hybrid && only === HYBRID)) continue;
    const bdir = join(dir, id);
    out[id] = existsSync(bdir) ? readBasePack(bdir, id, extra[id]!, lock) : null;
  }
  if (!wantHybrid) return out;
  if (!hybrid) {
    out[HYBRID] = null;
    return out;
  }
  const label = `workflow pack ${HYBRID}`;
  const uses = Array.isArray(hybrid.w.hybrid_of) ? (hybrid.w.hybrid_of as unknown[]) : [];
  if (uses.length === 0 || uses.some((u) => !(BASE_PACKS as readonly string[]).includes(String(u)))) throw new Error(`${label}: hybrid_of must name superpowers and pocock`);
  const stages = readStages(hybrid.dir, hybrid.root, hybrid.w, uses as string[], undefined, label, lock);
  const commits: Record<string, string> = {};
  for (const u of uses as (typeof BASE_PACKS)[number][]) {
    const base = out[u];
    if (!base) throw new Error(`${label}: it uses the ${u} pack, which is not installed`);
    Object.assign(commits, base.commits);
  }
  for (const r of refsOf(stages))
    if (!out[r.pack as PackWorkflow]?.skills[r.skill]) throw new Error(`${label}: stage skill ${r.pack}:${r.skill} does not resolve`);
  out[HYBRID] = { id: HYBRID, name: String(hybrid.w.name ?? HYBRID), commits, stages, skills: {} };
  return out;
}

const input = (name: string, bytes: Buffer): Input => ({ name, content_base64: bytes.toString("base64") });

/** The pack commits a workflow's brief names, sorted by pack, or none for the playbook. */
export function workflowPackCommits(packs: WorkflowPacks, workflow: Workflow): Record<string, string> {
  const pack = workflow === "playbook" ? null : packs[workflow];
  return pack ? Object.fromEntries(Object.entries(pack.commits).sort(([a], [b]) => (a < b ? -1 : 1))) : {};
}

/**
 * The workflow's brief sections and the input files that go with them. The stage's card goes in the
 * brief; every file of every skill the stage names goes in as inputs/workflow/<pack>/<skill>/<file>,
 * never inline, which is where the cards tell the agent to read. The playbook adds nothing, so its
 * brief is byte for byte what it was before workflows existed. The checker role reads the pre-check card.
 */
export function workflowBriefSections(packs: WorkflowPacks, workflow: Workflow, role: string): { sections: string[]; inputs: Input[] } {
  if (workflow === "playbook") return { sections: [], inputs: [] };
  const stage: Stage | undefined = role === "checker" ? "pre-check" : STAGES.find((s) => s === role);
  if (!stage) throw new Error(`workflow ${workflow}: no stage card for role ${role}`);
  const pack = packs[workflow];
  if (!pack) throw new Error(`workflow ${workflow}: pack is not installed`);
  const commits = Object.entries(workflowPackCommits(packs, workflow)).map(([p, c]) => `${p} ${c.slice(0, 12)}`).join(", ");
  const sections = [`Workflow: ${workflow} (${commits}). Skills the card names: inputs/workflow/<pack>/<skill>/.\n`, pack.stages[stage].card];
  const inputs: Input[] = [];
  for (const { pack: from, skill } of pack.stages[stage].skills) {
    const files = packs[from as PackWorkflow]?.skills[skill];
    if (!files) throw new Error(`workflow ${workflow}: skill ${from}:${skill} is not loaded`);
    for (const f of files) inputs.push(input(`workflow/${from}/${skill}/${f.name}`, f.bytes));
  }
  return { sections, inputs };
}
