import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { loadWorkflowPacks, workflowBriefSections } from "../src/workflow.js";

/** The real packs/workflows, as generated from the pinned upstreams and committed. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const PACKS = join(ROOT, "packs", "workflows");
const WORKFLOWS = ["superpowers", "pocock", "pocock-superpowers"] as const;
const STAGES = ["intake", "author", "pre-check"] as const;

/** Every `inputs/workflow/<pack>/<skill>/<file>` a card tells the agent to read. */
const namedFiles = (card: string) => [...card.matchAll(/inputs\/workflow\/([a-z-]+)\/([a-z0-9-]+)\/([A-Za-z0-9_./-]+\.md)/g)].map((m) => `workflow/${m[1]}/${m[2]}/${m[3]}`);

describe("the real workflow packs", () => {
  const packs = loadWorkflowPacks(PACKS);

  it("all three load and verify", () => {
    for (const w of WORKFLOWS) expect(packs[w], w).toBeTruthy();
    expect(Object.keys(packs["pocock-superpowers"]!.commits).sort()).toEqual(["pocock", "superpowers"]);
  });

  for (const w of WORKFLOWS)
    for (const s of STAGES)
      it(`${w} ${s}: every file the card names ships with the stage`, () => {
        const { sections, inputs } = workflowBriefSections(packs, w, s);
        const card = sections.join("\n");
        const shipped = new Set(inputs.map((i) => i.name));
        const named = namedFiles(card);
        expect(named.length, "the card names at least one upstream file").toBeGreaterThan(0);
        for (const f of named) expect(shipped.has(f), `${f} is named by the card but not shipped`).toBe(true);
        // Each shipped file is the committed reference copy, byte for byte.
        for (const i of inputs) {
          const [, pack, ...rest] = i.name.split("/");
          const onDisk = readFileSync(join(PACKS, pack!, "reference", ...rest));
          expect(Buffer.from(i.content_base64, "base64").equals(onDisk), i.name).toBe(true);
        }
      });

  it("the hybrid ships skills from both packs", () => {
    const { inputs } = workflowBriefSections(packs, "pocock-superpowers", "author");
    const from = new Set(inputs.map((i) => i.name.split("/")[1]));
    expect([...from].sort()).toEqual(["pocock", "superpowers"]);
  });
});

describe("a tampered copy of the real packs", () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it("is refused when one shipped byte changes", () => {
    dir = mkdtempSync(join(tmpdir(), "cr-wf-real-"));
    cpSync(PACKS, dir, { recursive: true });
    const target = join(dir, "superpowers", "reference", "test-driven-development", "SKILL.md");
    writeFileSync(target, Buffer.concat([readFileSync(target), Buffer.from(" ")]));
    expect(() => loadWorkflowPacks(dir!, "superpowers")).toThrow(/does not match its manifest digest/);
    // The Pocock workflow does not read that file, so it still loads.
    expect(loadWorkflowPacks(dir!, "pocock").pocock).toBeTruthy();
  });
});
