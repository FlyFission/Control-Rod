#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../", import.meta.url));
export const DEFAULT_OUT = join(REPO, "packs/workflows");
const LICENSES = join(REPO, "third_party/licenses");
const GENERATED_BY = "scripts/generate-workflow-packs.mjs";
const PACKS = new Set(["pocock", "superpowers"]);
const STAGES = new Set(["intake", "author", "pre-check"]);

export const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
export const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
const digest = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function listDirectories(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

function listFiles(dir, prefix = "") {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${prefix}${entry.name}`;
    return entry.isDirectory() ? listFiles(join(dir, entry.name), `${path}/`) : [path];
  }).sort();
}

function localPath(path) {
  return typeof path === "string" && !path.includes("\\") && !path.includes("\0") &&
    path.split("/").every((part) => part && part !== "." && part !== "..");
}

export function packPin(pins, pack) {
  const pin = pins[pack];
  if (!PACKS.has(pack) || !pin) throw new Error(`unknown pack: ${pack ?? "(missing --pack)"}`);
  return pin;
}

/**
 * The pinned commit's tree, read through Git rather than the working tree, so local edits and
 * untracked files in the checkout can never ship under the pin's name. Returns regular files only;
 * a symlink or submodule under a source path stops the run.
 */
function treeFiles(from, commit, path) {
  const out = execFileSync("git", ["-C", from, "ls-tree", "-r", "-z", commit, "--", path], { encoding: "utf8" });
  const files = [];
  for (const entry of out.split("\0").filter(Boolean)) {
    const tab = entry.indexOf("\t");
    const [mode, type] = entry.slice(0, tab).split(" ");
    const name = entry.slice(tab + 1);
    if (type !== "blob" || (mode !== "100644" && mode !== "100755")) throw new Error(`${name}: not a regular file in ${commit} (mode ${mode})`);
    files.push(name);
  }
  return files.sort();
}

/** One file's bytes at the commit, with line endings normalized as for every pack file. */
function blobLf(from, commit, name) {
  const bytes = execFileSync("git", ["-C", from, "cat-file", "blob", `${commit}:${name}`], { maxBuffer: 64 * 1024 * 1024 });
  // Latin-1 preserves all byte values while normalizing line endings.
  return Buffer.from(bytes.toString("latin1").replace(/\r\n?/g, "\n"), "latin1");
}

export function checkoutHead(from) {
  if (!from) throw new Error("missing --from <checkout>");
  return execFileSync("git", ["-C", from, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
}

export function generate({ pack, from, out = DEFAULT_OUT, pins = readJson(join(out, "pins.json")) }) {
  const pin = packPin(pins, pack);
  const commit = checkoutHead(from);
  if (commit !== pin.commit) throw new Error(`${pack}: checkout HEAD ${commit} != pin ${pin.commit}`);
  const { upstream, license, sources } = pin;
  const repo = upstream.match(/^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)$/);
  if (!repo) throw new Error(`${pack}: invalid upstream URL ${upstream}`);
  const evidence = join(LICENSES, `${repo[1]}__${repo[2]}`);
  if (!treeFiles(from, commit, "LICENSE").includes("LICENSE")) throw new Error(`${pack}: no LICENSE at ${commit}`);
  const files = new Map([["LICENSE", blobLf(from, commit, "LICENSE")]]);
  const inventory = new Map([["LICENSE", "LICENSE"]]);
  const skills = new Map();

  // Read all inputs before removing any generated files.
  for (const source of sources) {
    if (!localPath(source)) throw new Error(`${pack}: invalid source path ${source}`);
    // Skill folders and their files, as the pinned commit has them.
    const bySkill = new Map();
    for (const name of treeFiles(from, commit, source)) {
      const rest = name.slice(source.length + 1);
      const slash = rest.indexOf("/");
      if (slash < 0) continue; // a file directly under the source folder is not a skill
      const skill = rest.slice(0, slash);
      bySkill.set(skill, [...(bySkill.get(skill) ?? []), rest.slice(slash + 1)]);
    }
    for (const skill of [...bySkill.keys()].sort()) {
      if (skills.has(skill)) throw new Error(`${pack}: duplicate skill ${skill}`);
      const markdown = bySkill.get(skill).filter((path) => path.endsWith(".md")).sort();
      if (!markdown.includes("SKILL.md")) throw new Error(`${source}/${skill}: missing SKILL.md`);
      const paths = markdown.map((path) => {
        if (!localPath(path)) throw new Error(`${source}/${skill}/${path}: invalid path`);
        const destination = `reference/${skill}/${path}`;
        files.set(destination, blobLf(from, commit, `${source}/${skill}/${path}`));
        inventory.set(destination, `${source}/${skill}/${path}`);
        return destination;
      });
      skills.set(skill, paths);
    }
  }

  const sortedPaths = [...files.keys()].sort();
  const manifest = {
    workflow: pack, upstream, commit, license, generated_by: GENERATED_BY,
    skills: Object.fromEntries([...skills.keys()].sort().map((skill) => [skill, skills.get(skill)])),
    files: Object.fromEntries(sortedPaths.map((path) => [path, digest(files.get(path))])),
  };
  const destination = join(out, pack);
  rmSync(join(destination, "reference"), { recursive: true, force: true });
  mkdirSync(join(destination, "reference"), { recursive: true });
  for (const path of sortedPaths) {
    const target = join(destination, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, files.get(path));
  }
  writeJson(join(destination, "manifest.json"), manifest);
  mkdirSync(evidence, { recursive: true });
  writeFileSync(join(evidence, "LICENSE"), files.get("LICENSE"));
  const lines = [
    `Upstream: ${upstream}`, `Commit: ${commit}`, `License: ${license}`,
    `Generated by: ${GENERATED_BY}`, "",
    "Upstream path | Pack path | sha256 of the local file",
    ...sortedPaths.map((path) => `${inventory.get(path)} | ${pack}/${path} | ${manifest.files[path].slice("sha256:".length)}`),
  ];
  writeFileSync(join(evidence, "INVENTORY.txt"), `${lines.join("\n")}\n`);
  return manifest;
}

export function readManifests(out, problems) {
  const manifests = new Map();
  for (const pack of listDirectories(out)) {
    const path = join(out, pack, "manifest.json");
    if (!existsSync(path)) continue;
    try {
      const manifest = readJson(path);
      if (!record(manifest?.skills) || !record(manifest?.files)) throw new Error("expected skills and files maps");
      manifests.set(pack, manifest);
    } catch (error) {
      problems.push(`${pack}/manifest.json: ${error.message}`);
    }
  }
  return manifests;
}

export function checkWorkflows(out, manifests) {
  const problems = [];
  const unresolved = [];
  for (const pack of listDirectories(out)) {
    const base = join(out, pack);
    const path = join(base, "workflow.json");
    const cards = new Set();
    if (existsSync(path)) {
      try {
        const { stages } = readJson(path);
        if (!record(stages)) throw new Error("expected a stages map");
        for (const [name, stage] of Object.entries(stages)) {
          const label = `${pack}/workflow.json (${name})`;
          if (!STAGES.has(name)) problems.push(`${label}: unknown stage`);
          if (localPath(stage?.card)) cards.add(stage.card);
          else problems.push(`${label}: invalid card path`);
          if (!Array.isArray(stage?.skills)) {
            problems.push(`${label}: expected a skills list`);
            continue;
          }
          for (const skill of stage.skills) {
            const parts = typeof skill === "string" ? skill.split(":") : [];
            const [source, id] = parts;
            const known = manifests.get(source)?.skills;
            if (parts.length !== 2 || !known || !Object.hasOwn(known, id)) {
              unresolved.push(`${label}: unresolved stage skill ${skill}`);
            }
          }
        }
      } catch (error) {
        problems.push(`${pack}/workflow.json: ${error.message}`);
      }
    }
    const stagesDir = join(base, "stages");
    if (existsSync(stagesDir)) {
      for (const card of listFiles(stagesDir, "stages/").filter((file) => file.endsWith(".md"))) cards.add(card);
    }
    for (const card of cards) {
      const full = join(base, card);
      if (!existsSync(full) || !lstatSync(full).isFile()) problems.push(`${pack}/${card}: missing`);
      else if (!readFileSync(full, "utf8").trim()) problems.push(`${pack}/${card}: empty`);
    }
  }
  return { problems, unresolved };
}

export function check({ out = DEFAULT_OUT } = {}) {
  const problems = [];
  const pins = readJson(join(out, "pins.json"));
  const manifests = readManifests(out, problems);
  // A pinned pack whose manifest is gone would otherwise pass silently.
  for (const pack of Object.keys(pins)) if (!manifests.has(pack)) problems.push(`${pack}: pinned but has no manifest.json`);
  for (const [pack, manifest] of manifests) {
    const base = join(out, pack);
    // The loader trusts a skill's file list only through the digests, so every listed file needs one.
    for (const [skill, paths] of Object.entries(manifest.skills)) {
      if (!Array.isArray(paths) || !paths.includes(`reference/${skill}/SKILL.md`)) problems.push(`${pack}: skill ${skill} does not list its SKILL.md`);
      for (const path of Array.isArray(paths) ? paths : []) {
        if (typeof path !== "string" || !path.startsWith(`reference/${skill}/`) || !Object.hasOwn(manifest.files, path)) {
          problems.push(`${pack}: skill ${skill} lists ${path}, which has no digest in its skill folder`);
        }
      }
    }
    if (manifest.commit !== pins[pack]?.commit || !pins[pack]) {
      problems.push(`${pack}: manifest commit ${manifest.commit} != pin ${pins[pack]?.commit ?? "(missing)"}`);
    }
    const reference = join(base, "reference");
    const present = new Set();
    if (existsSync(join(base, "LICENSE"))) present.add("LICENSE");
    if (existsSync(reference) && lstatSync(reference).isDirectory()) {
      for (const path of listFiles(reference, "reference/")) present.add(path);
    }
    for (const path of present) {
      if (!Object.hasOwn(manifest.files, path)) problems.push(`${pack}/${path}: not in manifest`);
    }
    const listed = new Set(["LICENSE", ...Object.keys(manifest.files)]);
    for (const path of listed) {
      const label = `${pack}/${path}`;
      if (!localPath(path) || (path !== "LICENSE" && !path.startsWith("reference/"))) {
        problems.push(`${label}: invalid generated path`);
      } else if (!present.has(path) || !lstatSync(join(base, path)).isFile()) {
        problems.push(`${label}: missing or not a regular file`);
      } else if (Object.hasOwn(manifest.files, path)) {
        const actual = digest(readFileSync(join(base, path)));
        if (actual !== manifest.files[path]) problems.push(`${label}: digest ${actual} != manifest ${manifest.files[path]}`);
      }
    }
  }
  const stages = checkWorkflows(out, manifests);
  return [...problems, ...stages.problems, ...stages.unresolved];
}

function main() {
  const { values } = parseArgs({ options: {
    check: { type: "boolean" }, pack: { type: "string" }, from: { type: "string" }, out: { type: "string" },
  } });
  const out = resolve(values.out ?? DEFAULT_OUT);
  if (values.check) {
    const problems = check({ out });
    if (problems.length) throw new Error(problems.join("\ngenerate-workflow-packs: "));
    console.log(`workflow pack check passed: ${out}`);
    return;
  }
  const manifest = generate({ pack: values.pack, from: values.from, out });
  console.log(`wrote ${manifest.workflow} from ${manifest.commit} (${Object.keys(manifest.files).length} files + manifest.json)`);
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`generate-workflow-packs: ${error.message}`);
    process.exitCode = 1;
  }
}
