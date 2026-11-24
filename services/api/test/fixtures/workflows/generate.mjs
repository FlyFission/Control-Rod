// Writes the fixture workflow packs next to this file, with manifest digests computed from the bytes
// it writes. Run: node services/api/test/fixtures/workflows/generate.mjs
// The fixtures have the real layout (manifest.json, LICENSE, reference/<skill>/..., workflow.json,
// stages/*.md) but tiny, marked content, so API tests need not carry the real upstream packs.
import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sha = (t) => `sha256:${createHash("sha256").update(t).digest("hex")}`;
// Every manifest, map and card the API composes from goes in lock.json, as the real packs do.
const locked = {};
const write = (rel, text) => {
  const p = join(here, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text);
  if (/\/(manifest|workflow)\.json$|\/stages\//.test(rel)) locked[rel] = sha(text);
};

const packs = {
  superpowers: {
    name: "Superpowers",
    commit: "5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a",
    skills: {
      brainstorming: ["SKILL.md"],
      "writing-plans": ["SKILL.md"],
      "subagent-driven-development": ["SKILL.md", "implementer-prompt.md"],
      "verification-before-completion": ["SKILL.md"],
    },
    stages: {
      intake: ["superpowers:brainstorming", "superpowers:writing-plans"],
      author: ["superpowers:subagent-driven-development", "superpowers:verification-before-completion"],
      "pre-check": ["superpowers:subagent-driven-development", "superpowers:verification-before-completion"],
    },
  },
  pocock: {
    name: "Pocock",
    commit: "7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c",
    skills: { grilling: ["SKILL.md"], "to-tickets": ["SKILL.md"], tdd: ["SKILL.md", "deep-modules.md"], retro: ["SKILL.md"], "code-review": ["SKILL.md"] },
    stages: {
      intake: ["pocock:grilling", "pocock:to-tickets"],
      author: ["pocock:tdd", "pocock:retro"],
      "pre-check": ["pocock:code-review"],
    },
  },
};

rmSync(join(here, "superpowers"), { recursive: true, force: true });
rmSync(join(here, "pocock"), { recursive: true, force: true });
rmSync(join(here, "pocock-superpowers"), { recursive: true, force: true });

const card = (pack, stage) => `## Workflow: ${pack} ${stage} card\n\nCARD-MARKER-${pack}-${stage}\n`;

for (const [id, p] of Object.entries(packs)) {
  const files = {};
  const skills = {};
  write(`${id}/LICENSE`, `MIT fixture license for ${id}\n`);
  files.LICENSE = sha(`MIT fixture license for ${id}\n`);
  for (const [skill, list] of Object.entries(p.skills)) {
    skills[skill] = list.map((f) => `reference/${skill}/${f}`);
    for (const f of list) {
      const text = `# ${skill}/${f}\n\nSKILL-MARKER-${id}-${skill}-${f}\n`;
      write(`${id}/reference/${skill}/${f}`, text);
      files[`reference/${skill}/${f}`] = sha(text);
    }
  }
  write(`${id}/manifest.json`, JSON.stringify({ workflow: id, upstream: `https://example.test/${id}`, commit: p.commit, license: "MIT", generated_by: "fixture generate.mjs", skills, files }, null, 2) + "\n");
  const stages = {};
  for (const [stage, list] of Object.entries(p.stages)) {
    write(`${id}/stages/${stage}.md`, card(id, stage));
    stages[stage] = { card: `stages/${stage}.md`, skills: list };
  }
  write(`${id}/workflow.json`, JSON.stringify({ id, name: p.name, upstream: `https://example.test/${id}`, stages }, null, 2) + "\n");
}

const hybrid = {
  intake: ["pocock:grilling", "superpowers:writing-plans"],
  author: ["superpowers:subagent-driven-development", "pocock:tdd"],
  "pre-check": ["pocock:code-review", "superpowers:verification-before-completion"],
};
const hstages = {};
for (const [stage, list] of Object.entries(hybrid)) {
  write(`pocock-superpowers/stages/${stage}.md`, card("pocock-superpowers", stage));
  hstages[stage] = { card: `stages/${stage}.md`, skills: list };
}
write("pocock-superpowers/workflow.json", JSON.stringify({ id: "pocock-superpowers", name: "Pocock Superpowers", hybrid_of: ["pocock", "superpowers"], stages: hstages }, null, 2) + "\n");
writeFileSync(join(here, "lock.json"), JSON.stringify({ note: "fixture lock, written by generate.mjs", files: Object.fromEntries(Object.keys(locked).sort().map((k) => [k, locked[k]])) }, null, 2) + "\n");
