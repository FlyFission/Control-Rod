import { Refusal } from "./refusal.js";

/**
 * A project's work lanes: what the Plant's six work bays are called and how work is placed in them.
 * Pure: nothing here reads the database or the disk, so every rule is testable on its own.
 *
 * A bay slot is a position on the Plant floor (spec WorkBaySlot); a lane is what a project puts there.
 * Lane i stands in slot i. Under the capital-project preset the lane ids are the slot ids, so the six
 * disciplines keep their meaning for stored data and older clients.
 */

export const SLOTS = ["process", "mechanical", "electrical", "civil", "assurance", "project-controls"] as const;
export type Slot = (typeof SLOTS)[number];
export const PRESET_IDS = ["capital-project", "software", "custom"] as const;
export type PresetId = (typeof PRESET_IDS)[number];
export const MAX_LANES = SLOTS.length;

export interface WorkLane { id: string; name: string; purpose: string; keywords?: string[]; paths?: string[] }
export interface WorkLaneSet { preset: PresetId; lanes: WorkLane[]; default_lane: string }
export interface WorkLaneChoice { preset: PresetId; lanes?: WorkLane[]; default_lane?: string }

/** The six bays as they were drawn before lanes existed. Their words are matched by CUBE_WORDS, so the lanes carry none. */
const CAPITAL: WorkLaneSet = {
  preset: "capital-project",
  default_lane: "process",
  lanes: [
    { id: "process", name: "Process", purpose: "Process design and simulation" },
    { id: "mechanical", name: "Mechanical", purpose: "Mechanical, piping and HVAC design" },
    { id: "electrical", name: "Electrical", purpose: "Electrical, instrumentation and controls design" },
    { id: "civil", name: "Civil", purpose: "Civil, structural and architectural design" },
    { id: "assurance", name: "Assurance", purpose: "Quality, safety and regulatory work" },
    { id: "project-controls", name: "Project controls", purpose: "Project management, schedules and cost" },
  ],
};

/**
 * Software work. Platform also takes work nothing places, so a package with no tag, path or keyword
 * stands in a bay that says "general" and not in a bay that claims a specialty it does not have.
 */
const SOFTWARE: WorkLaneSet = {
  preset: "software",
  default_lane: "platform",
  lanes: [
    { id: "frontend", name: "Frontend", purpose: "User interface, browser code and styling", keywords: ["frontend", "front end", "ui", "ux", "web", "browser", "css", "react"], paths: ["apps/web/", "web/", "frontend/", "ui/", "client/", "src/components/", "**/*.css"] },
    { id: "backend", name: "Backend", purpose: "Services, APIs and server logic", keywords: ["backend", "back end", "server", "api", "service", "services"], paths: ["services/", "server/", "backend/", "api/", "cmd/", "internal/"] },
    { id: "platform", name: "Platform", purpose: "Build, deploy, infrastructure and general engineering", keywords: ["platform", "infrastructure", "infra", "devops", "ci", "build", "deploy", "deployment", "engineering"], paths: ["infra/", "deploy/", ".github/", "ci/", "scripts/", "tools/", "Dockerfile", "docker/", "terraform/"] },
    { id: "data", name: "Data", purpose: "Schemas, migrations, storage and pipelines", keywords: ["data", "database", "schema", "migration", "migrations", "sql", "pipeline"], paths: ["migrations/", "db/", "data/", "schema/", "schemas/", "**/*.sql"] },
    { id: "tests", name: "Tests", purpose: "Automated tests, fixtures and quality checks", keywords: ["test", "tests", "testing", "qa", "e2e", "fixture", "fixtures"], paths: ["test/", "tests/", "e2e/", "__tests__/", "**/*.test.*", "**/*.spec.*"] },
    { id: "docs", name: "Docs", purpose: "Documentation, guides and decision records", keywords: ["docs", "documentation", "readme", "guide", "adr"], paths: ["docs/", "README.md", "**/*.md"] },
  ],
};

export const PRESETS: Readonly<Record<Exclude<PresetId, "custom">, WorkLaneSet>> = { "capital-project": CAPITAL, software: SOFTWARE };

const clone = <T>(v: T): T => structuredClone(v);

/** The set a project reads as when it stores none: the capital-project preset, exactly today's six bays. */
export const defaultLaneSet = (): WorkLaneSet => clone(CAPITAL);

const bad = (message: string): never => {
  throw new Refusal(400, "invalid", message);
};
const textList = (v: unknown, what: string, max: number, each: number): string[] | undefined => {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.length > max) return bad(`${what} must be a list of at most ${max}`);
  return v.map((x) => {
    if (typeof x !== "string" || !x.trim() || x.length > each) return bad(`${what} must hold non-empty text of at most ${each} characters`);
    return x.trim();
  });
};

/** One custom lane, checked field by field; the same limits as the spec's WorkLane. */
function cleanLane(raw: unknown): WorkLane {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return bad("A work lane must be an object");
  const r = raw as Record<string, unknown>;
  for (const k of Object.keys(r)) if (!["id", "name", "purpose", "keywords", "paths"].includes(k)) return bad(`A work lane has no field ${k}`);
  if (typeof r.id !== "string" || !/^[a-z][a-z0-9-]{0,31}$/.test(r.id)) return bad("A work lane id is lowercase letters, digits and hyphens, starting with a letter (32 at most)");
  const name = typeof r.name === "string" ? r.name.trim() : "";
  if (!name || name.length > 24) return bad("A work lane name is 1 to 24 characters, short enough for a bay's plate");
  const purpose = typeof r.purpose === "string" ? r.purpose.trim() : "";
  if (r.purpose !== undefined && typeof r.purpose !== "string") return bad("A work lane purpose is text");
  if (purpose.length > 120) return bad("A work lane purpose is 120 characters at most");
  const keywords = textList(r.keywords, "keywords", 20, 40);
  const paths = textList(r.paths, "paths", 20, 120);
  for (const p of paths ?? []) if (p.startsWith("/") || p.split("/").includes("..")) return bad("A work lane path is relative to the repository and never leaves it");
  return { id: r.id, name, purpose, ...(keywords?.length ? { keywords } : {}), ...(paths?.length ? { paths } : {}) };
}

/**
 * A request to the set it means. A preset other than custom takes its lanes from the control plane
 * (whatever `lanes` the request carried is ignored); custom needs one to six lanes with unique ids.
 * More than six is refused, not folded: a seventh lane would have no bay to stand in.
 */
export function resolveChoice(choice: unknown): WorkLaneSet {
  if (!choice || typeof choice !== "object" || Array.isArray(choice)) return bad("work_lanes must be an object");
  const c = choice as Record<string, unknown>;
  if (!PRESET_IDS.includes(c.preset as PresetId)) return bad(`work_lanes.preset must be one of ${PRESET_IDS.join(", ")}`);
  const preset = c.preset as PresetId;
  let set: WorkLaneSet;
  if (preset === "custom") {
    if (!Array.isArray(c.lanes) || c.lanes.length < 1) return bad("A custom set needs at least one lane");
    if (c.lanes.length > MAX_LANES) return bad(`A project has at most ${MAX_LANES} work lanes: the Plant has ${MAX_LANES} work bays`);
    const lanes = c.lanes.map(cleanLane);
    if (new Set(lanes.map((l) => l.id)).size !== lanes.length) return bad("Work lane ids must be unique");
    if (new Set(lanes.map((l) => l.name.toLowerCase())).size !== lanes.length) return bad("Work lane names must be unique");
    set = { preset, lanes, default_lane: lanes[0]!.id };
  } else {
    set = clone(PRESETS[preset]);
  }
  if (c.default_lane !== undefined) {
    if (typeof c.default_lane !== "string" || !set.lanes.some((l) => l.id === c.default_lane)) return bad("default_lane must name one of the lanes");
    set.default_lane = c.default_lane;
  }
  return set;
}

/** A stored set, read defensively: anything that does not validate reads as the default, never as a crash on the Plant. */
export function laneSetOf(stored: unknown): WorkLaneSet {
  if (stored === undefined || stored === null) return defaultLaneSet();
  try {
    const s = stored as Partial<WorkLaneSet>;
    const set = resolveChoice({ preset: s.preset, lanes: s.lanes, ...(s.default_lane ? { default_lane: s.default_lane } : {}) });
    // A stored preset set keeps its stored lanes (a later preset edit never rewrites a stored project).
    return s.preset !== "custom" && Array.isArray(s.lanes) && s.lanes.length === MAX_LANES ? { ...set, lanes: s.lanes } : set;
  } catch {
    return defaultLaneSet();
  }
}

// ---------------------------------------------------------------------------------------------------
// Placing work

/**
 * A package's discipline, as free text, to its capital-project bay. The text is lowercased and split on non-letters
 * into words, and a keyword matches only at a word boundary: as a whole word or as a deliberate stem
 * ("electric" in "electrical"), never inside another word ("site" in "website", "fire" in "firebase",
 * "power" in "powershell"). Ambiguous words ("project", "cost", "controls") count only in the phrase that
 * makes them a discipline. An unset or unmatched discipline stands in Process and the figure says so.
 */
const CUBE_WORDS: [Slot, RegExp][] = [
  // Project controls first: "controls" alone means instrumentation and controls.
  ["project-controls", /\b(?:project (?:controls?|management|planning|schedul\w*|cost\w*)|cost (?:estimat\w*|controls?|engineering)|schedul(?:e|es|ing)|estimat(?:e|es|ing|ion|or|ors)|procure(?:ment)?)\b/],
  ["mechanical", /\b(?:mechanical|piping|hvac|plumbing|fire (?:protection|suppression|safety|water))\b/],
  ["electrical", /\b(?:electrical|electric|instrument(?:ation|ed)?|i&c|c&i|power)\b|(?<!\b(?:access|document|change|configuration|version|security|quality) )\bcontrols?\b/],
  ["civil", /\b(?:civil|structural|structure|architectural|architect|geotechnical|geotech|site)\b/],
  ["assurance", /\b(?:quality|safety|regulatory|regulation|licensing|license|assurance|nqa)\b/],
  ["process", /\b(?:process|chemical|nuclear|reactor|fuel)\b/],
];
export function cubeFor(discipline: unknown): { place: Slot; defaulted: boolean } {
  const d = typeof discipline === "string" ? discipline.toLowerCase().replace(/[^a-z&]+/g, " ").trim() : "";
  for (const [place, words] of CUBE_WORDS) if (d && words.test(d)) return { place, defaulted: false };
  return { place: "process", defaulted: true };
}

const wordsOf = (s: string) => s.toLowerCase().split(/[^a-z0-9&]+/).filter(Boolean);

/** Whether a keyword (one word or a run of words) appears in the text as whole words, never inside another word. */
export function hasWholeWords(text: unknown, keyword: string): boolean {
  if (typeof text !== "string") return false;
  const t = wordsOf(text);
  const k = wordsOf(keyword);
  if (!k.length) return false;
  for (let i = 0; i + k.length <= t.length; i++) if (k.every((w, j) => t[i + j] === w)) return true;
  return false;
}

const escape = (s: string) => s.replace(/[.+^${}()|[\]\\?]/g, "\\$&");
const normalPath = (p: string) => p.replace(/\\/g, "/").replace(/^\.?\/+/, "");

/**
 * A repository path against a lane's pattern: a trailing slash is a directory prefix, a pattern with `*`
 * is a glob (`*` within a segment, `**` across segments, `**` + `/` also matching none), anything else
 * is an exact path or a directory of that name.
 */
export function pathMatches(pattern: string, path: string): boolean {
  const p = normalPath(path);
  const pat = normalPath(pattern);
  if (!pat) return false;
  if (pat.endsWith("/")) return p.startsWith(pat);
  if (!pat.includes("*")) return p === pat || p.startsWith(`${pat}/`);
  let re = "";
  for (let i = 0; i < pat.length; i++) {
    const ch = pat[i]!;
    if (ch === "*" && pat[i + 1] === "*") {
      if (pat[i + 2] === "/") { re += "(?:.*/)?"; i += 2; } else { re += ".*"; i += 1; }
    } else if (ch === "*") re += "[^/]*";
    else re += escape(ch);
  }
  return new RegExp(`^${re}$`).test(p);
}

export type SortedBy = "tag" | "path" | "keyword" | "default";
export interface Placement { lane: WorkLane; slot: Slot; defaulted: boolean; by: SortedBy }

/**
 * Where a package's work stands, in this order and stopping at the first that places it:
 *  1. its lane tag: the discipline equal (ignoring case and spacing) to a lane's id or name;
 *  2. the repository paths its recorded outputs touch: the lane matching the most of them (the earlier lane on a tie);
 *  3. whole-word keywords: a lane's own, in lane order; the capital-project preset's built-in discipline words
 *     (cubeFor) stand for the six lanes' keywords;
 *  4. the set's default lane, and the placement says it was defaulted.
 * The slot is the lane's position, so at most six bays are ever drawn.
 */
export function placeWork(set: WorkLaneSet, work: { discipline?: unknown; paths?: readonly string[] }): Placement {
  const at = (i: number, by: SortedBy): Placement => ({ lane: set.lanes[i]!, slot: SLOTS[i]!, defaulted: by === "default", by });
  const tag = typeof work.discipline === "string" ? work.discipline.trim().toLowerCase().replace(/\s+/g, " ") : "";
  if (tag) {
    const i = set.lanes.findIndex((l) => l.id === tag || l.name.toLowerCase() === tag);
    if (i >= 0) return at(i, "tag");
  }
  const paths = work.paths ?? [];
  if (paths.length) {
    let best = -1, bestCount = 0;
    set.lanes.forEach((l, i) => {
      const n = paths.filter((p) => (l.paths ?? []).some((pat) => pathMatches(pat, p))).length;
      if (n > bestCount) { best = i; bestCount = n; }
    });
    if (best >= 0) return at(best, "path");
  }
  const i = set.lanes.findIndex((l) => (l.keywords ?? []).some((k) => hasWholeWords(work.discipline, k)));
  if (i >= 0) return at(i, "keyword");
  if (set.preset === "capital-project") {
    const c = cubeFor(work.discipline);
    const j = set.lanes.findIndex((l) => l.id === c.place);
    if (!c.defaulted && j >= 0) return at(j, "keyword");
  }
  const d = Math.max(0, set.lanes.findIndex((l) => l.id === set.default_lane));
  return at(d, "default");
}

// ---------------------------------------------------------------------------------------------------
// Setup

/** Files and folders at the top of a repository that mark an engineering-discipline project. */
export const DISCIPLINE_MARKERS = ["calculations", "calcs", "drawings", "specifications", "datasheets", "p&ids", "pids", "civil", "mechanical", "electrical", "structural"] as const;
/** Files at the top of a repository that mark a software project. */
export const SOFTWARE_MARKERS = ["package.json", "go.mod", "cargo.toml", "pyproject.toml", "setup.py", "requirements.txt", "pom.xml", "build.gradle", "build.gradle.kts", "gemfile", "composer.json", "mix.exs", "deno.json", "cmakelists.txt"] as const;

export interface PresetProposal { preset: Exclude<PresetId, "custom">; reason: string }

/**
 * The preset a project's setup proposes, from what is at the top of its repository (entry names only; no file is
 * read) and, when the repository says nothing, from its engineering mode. It is a proposal: the project's
 * setting changes it, and nothing here is final.
 */
export function proposePreset(signals: { entries?: readonly string[]; mode?: string }): PresetProposal {
  const names = new Set((signals.entries ?? []).map((e) => e.toLowerCase().replace(/\/$/, "")));
  const discipline = DISCIPLINE_MARKERS.filter((m) => names.has(m));
  if (discipline.length) return { preset: "capital-project", reason: `The repository has ${discipline.join(", ")}, which mark an engineering-discipline project` };
  const software = SOFTWARE_MARKERS.filter((m) => names.has(m));
  if (software.length) return { preset: "software", reason: `The repository has ${software.join(", ")} and no engineering-discipline folders` };
  if (signals.mode === "software") return { preset: "software", reason: "The repository shows no signal, and the project's mode is Software" };
  return { preset: "capital-project", reason: "The repository shows no signal, so the project keeps the capital-project bays" };
}
