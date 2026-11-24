#!/usr/bin/env node
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_OUT, checkWorkflows, checkoutHead, generate, packPin, readJson, readManifests, writeJson,
} from "./generate-workflow-packs.mjs";

function lines(text) {
  return text ? text.replace(/\n$/, "").split("\n") : [];
}

function sharedLines(before, after) {
  // Keep only one row of the longest-common-subsequence table.
  const counts = new Uint32Array(after.length + 1);
  for (const line of before) {
    let diagonal = 0;
    for (let i = 1; i < counts.length; i++) {
      const previous = counts[i];
      counts[i] = line === after[i - 1] ? diagonal + 1 : Math.max(counts[i - 1], previous);
      diagonal = previous;
    }
  }
  return counts[after.length];
}

export function lineCounts(before, after) {
  const oldLines = lines(before);
  const newLines = lines(after);
  const common = sharedLines(oldLines, newLines);
  return { added: newLines.length - common, removed: oldLines.length - common };
}

function skillContent(files) {
  const text = files.get("SKILL.md");
  const frontmatter = text.match(/^---\n([\s\S]*?)^---(?:\n|$)/m);
  if (!frontmatter || frontmatter.index !== 0) return { body: lines(text) };
  const name = frontmatter[1].match(/^name:[ \t]*(.+)$/m)?.[1].trim().replace(/^(['"])(.*)\1$/, "$2");
  const body = lines(text.slice(frontmatter[0].length));
  return { name, body };
}

export function findRenames(before, after, removed, added) {
  const renames = [];
  const candidates = [];
  for (const old of removed) {
    const previous = skillContent(before.get(old));
    for (const next of added) {
      const current = skillContent(after.get(next));
      const sameName = Boolean(previous.name && previous.name === current.name);
      const length = Math.max(previous.body.length, current.body.length);
      const similarity = length ? sharedLines(previous.body, current.body) / length : 0;
      if (sameName || similarity >= 0.6) candidates.push({ old, next, sameName, similarity });
    }
  }
  // Prefer matching names, then the strongest body match. Input order breaks ties.
  candidates.sort((a, b) => Number(b.sameName) - Number(a.sameName) || b.similarity - a.similarity);
  for (const { old, next, sameName } of candidates) {
    if (!removed.has(old) || !added.has(next)) continue;
    removed.delete(old);
    added.delete(next);
    renames.push({ old, next, rule: sameName ? "matching frontmatter name" : "body shares at least 60% of lines" });
  }
  return renames;
}

function snapshot(base, manifest) {
  return new Map(Object.entries(manifest.skills).map(([name, paths]) => {
    const prefix = `reference/${name}/`;
    const files = new Map(paths.map((path) => [path.slice(prefix.length), readFileSync(join(base, path), "utf8")]));
    return [name, files];
  }));
}

function report(pack, oldCommit, newCommit, before, after, unresolved) {
  const removed = new Set([...before.keys()].filter((name) => !after.has(name)));
  const added = new Set([...after.keys()].filter((name) => !before.has(name)));
  const renames = findRenames(before, after, removed, added);
  const renamed = new Map(renames.map(({ old, next }) => [next, old]));
  const sections = [
    `# Workflow pack sync: ${pack}`, "",
    `- Old commit: \`${oldCommit}\``, `- New commit: \`${newCommit}\``, "",
    "## Added", "", ...([...added].map((name) => `- \`${name}\``).concat(added.size ? [] : ["None"])), "",
    "## Removed", "", ...([...removed].map((name) => `- \`${name}\``).concat(removed.size ? [] : ["None"])), "",
    "## Renamed", "",
    ...(renames.length ? renames.map(({ old, next, rule }) => `- \`${old}\` → \`${next}\` (${rule})`) : ["None"]),
    "", "## File changes", "",
  ];
  let anyChanges = false;
  for (const name of [...new Set([...after.keys(), ...removed])].sort()) {
    const oldName = renamed.get(name) ?? name;
    const oldFiles = before.get(oldName) ?? new Map();
    const newFiles = after.get(name) ?? new Map();
    const changes = [];
    for (const path of [...new Set([...oldFiles.keys(), ...newFiles.keys()])].sort()) {
      const oldText = oldFiles.get(path);
      const newText = newFiles.get(path);
      if (oldText === newText) continue;
      const { added, removed } = lineCounts(oldText, newText);
      changes.push(`- \`${path}\` +${added} / -${removed}`);
    }
    if (!changes.length) continue;
    sections.push(`### \`${name}\``, "", ...changes, "");
    anyChanges = true;
  }
  if (!anyChanges) sections.push("None", "");
  sections.push("## Stage skills that no longer resolve", "");
  if (unresolved.length) {
    sections.push(...unresolved.map((problem) => `- ${problem}`), "",
      "A person must update the affected `workflow.json` files before merge.");
  } else {
    sections.push("None");
  }
  return `${sections.join("\n")}\n`;
}

export function sync({ pack, from, reportPath, out = DEFAULT_OUT }) {
  const pinsPath = join(out, "pins.json");
  const pins = readJson(pinsPath);
  const pin = packPin(pins, pack);
  const base = join(out, pack);
  const old = readJson(join(base, "manifest.json"));
  const before = snapshot(base, old);
  pin.commit = checkoutHead(from);
  const next = generate({ pack, from, out, pins });
  writeJson(pinsPath, pins);

  const errors = [];
  const manifests = readManifests(out, errors);
  const { problems, unresolved } = checkWorkflows(out, manifests);
  const markdown = report(pack, old.commit, next.commit, before, snapshot(base, next), unresolved);
  if (reportPath) writeFileSync(reportPath, markdown);
  else process.stdout.write(markdown);
  if (errors.length || problems.length) throw new Error([...errors, ...problems].join("\nsync-workflow-packs: "));
  return unresolved.length ? 2 : 0;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: {
      pack: { type: "string" }, from: { type: "string" }, report: { type: "string" },
    } });
    process.exitCode = sync({ pack: values.pack, from: values.from, reportPath: values.report });
  } catch (error) {
    console.error(`sync-workflow-packs: ${error.message}`);
    process.exitCode = 1;
  }
}
