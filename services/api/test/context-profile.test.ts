import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { type ClusterFacts, loadNuclearPack, nuclearBriefSections, resolveContextProfile, selectClusters } from "../src/context-profile.js";

/** Context profiles without a database: resolution, the cluster table and the Nuclear sections. */
const fixturePack = fileURLToPath(new URL("./fixtures/nuclear-grade/", import.meta.url));
const decode = (i: { content_base64: string }) => Buffer.from(i.content_base64, "base64").toString();

describe("resolveContextProfile", () => {
  it("locks Safety and Material grade work to Nuclear, whatever the card or project says", () => {
    expect(resolveContextProfile({ grade: "safety", context_profile: "light" }, { default_context_profile: "light" })).toEqual({
      profile: "nuclear",
      locked: true,
      reason: "Safety grade work is always Nuclear",
    });
    expect(resolveContextProfile({ grade: "material" }, null)).toMatchObject({ profile: "nuclear", locked: true });
  });

  it("takes the card's setting, then the project default, then Light", () => {
    expect(resolveContextProfile({ grade: "general-service", context_profile: "nuclear" }, { default_context_profile: "light" })).toMatchObject({ profile: "nuclear", locked: false });
    expect(resolveContextProfile({ context_profile: "light" }, { default_context_profile: "nuclear" })).toMatchObject({ profile: "light", locked: false });
    expect(resolveContextProfile({}, { default_context_profile: "nuclear" })).toMatchObject({ profile: "nuclear", locked: false, reason: "The project default is Nuclear" });
    expect(resolveContextProfile({}, null)).toEqual({ profile: "light", locked: false });
    expect(resolveContextProfile(undefined, undefined)).toEqual({ profile: "light", locked: false });
  });

  it("ignores values that are not a profile", () => {
    expect(resolveContextProfile({ context_profile: "NUCLEAR" }, { default_context_profile: 7 })).toEqual({ profile: "light", locked: false });
  });
});

describe("selectClusters", () => {
  const base: ClusterFacts = { tools: ["Read", "Glob", "Grep"], hosts: [], deliverables: [{ type: "report", format: ["md"] }], rigorMode: "quick" };
  const cases: [string, Partial<ClusterFacts>, string[]][] = [
    ["read-only quick report", {}, []],
    ["Write grants write", { tools: ["Read", "Write"] }, ["agent-authority"]],
    ["Edit grants write", { tools: ["Edit"] }, ["agent-authority"]],
    ["Bash grants run", { tools: ["Bash(python3:*)"] }, ["agent-authority"]],
    ["a network host grants network", { hosts: ["example.org"] }, ["agent-authority"]],
    ["documentation deliverable", { deliverables: [{ type: "documentation" }] }, ["claims-discipline"]],
    ["public- deliverable type", { deliverables: [{ type: "Public-Datasheet" }] }, ["claims-discipline"]],
    ["administrative rigor", { rigorMode: "administrative" }, []],
    ["standard rigor", { rigorMode: "standard" }, ["configuration-management"]],
    ["high-consequence rigor", { rigorMode: "high-consequence" }, ["configuration-management"]],
    ["safety grade", { grade: "safety" }, ["review-panel"]],
    ["material grade alone adds none", { grade: "material" }, []],
    [
      "everything, sorted",
      { tools: ["Write"], deliverables: [{ type: "readme" }], rigorMode: "high-consequence", grade: "safety" },
      ["agent-authority", "claims-discipline", "configuration-management", "review-panel"],
    ],
  ];
  it.each(cases)("%s", (_name, facts, want) => {
    expect(selectClusters({ ...base, ...facts })).toEqual(want);
  });
});

describe("nuclearBriefSections", () => {
  const pack = loadNuclearPack(fixturePack)!;

  it("puts the Core card and each selected cluster card in the brief, and the full skills and templates in inputs only", () => {
    const { sections, inputs } = nuclearBriefSections(pack, ["configuration-management", "agent-authority"], "author", "high-consequence", "Safety grade work is always Nuclear");
    const text = sections.join("\n");
    expect(sections[0]).toContain("Nuclear context profile (Safety grade work is always Nuclear)");
    expect(sections[1]).toContain("CORE-CARD-MARKER");
    expect(text).toContain("CLUSTER-CARD-MARKER-agent-authority");
    expect(text).toContain("CLUSTER-CARD-MARKER-configuration-management");
    expect(text).not.toContain("CLUSTER-CARD-MARKER-review-panel");
    expect(text).not.toContain("FULL-SKILL-MARKER");
    expect(text).toContain("inputs/templates/standard/ and inputs/templates/cm/");
    expect(text).toContain("inputs/reference/");
    expect(text).not.toContain("As checker");
    expect(inputs.map((i) => i.name)).toEqual([
      "templates/standard/record.md",
      "templates/cm/baseline.md",
      "reference/authority-limits/SKILL.md",
      "reference/config-baseline/SKILL.md",
      "reference/core-discipline/SKILL.md",
    ]);
    expect(decode(inputs.find((i) => i.name === "reference/core-discipline/SKILL.md")!)).toContain("FULL-SKILL-MARKER-core-discipline");
  });

  it("ships quick templates for quick and administrative rigor, and tells a checker to hold the author to the same cards", () => {
    for (const rigor of ["quick", "administrative"]) {
      const { sections, inputs } = nuclearBriefSections(pack, [], "pre-check", rigor);
      expect(inputs.map((i) => i.name)).toEqual(["templates/quick/record.md", "reference/core-discipline/SKILL.md"]);
      expect(sections.at(-1)).toContain("verify the author followed the same Core and cluster cards");
    }
  });
});

describe("loadNuclearPack", () => {
  it("returns null when the pack is not installed", () => {
    expect(loadNuclearPack(join(tmpdir(), "no-such-nuclear-pack"))).toBeNull();
  });

  it("refuses a manifest path that leaves the pack", () => {
    const dir = mkdtempSync(join(tmpdir(), "cr-ng-"));
    try {
      writeFileSync(join(dir, "manifest.json"), JSON.stringify({ commit: "x", core: { card: "../../etc/passwd", skills: [] }, files: {} }));
      expect(() => loadNuclearPack(dir)).toThrow(/leaves the pack/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /** A copy of the fixture pack to break, removed afterwards. */
  const withCopy = (fn: (dir: string, outside: string) => void) => {
    const dir = mkdtempSync(join(tmpdir(), "cr-ng-"));
    const outside = mkdtempSync(join(tmpdir(), "cr-ng-outside-"));
    try {
      cpSync(fixturePack, dir, { recursive: true });
      fn(dir, outside);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  };

  it("loads the intact fixture copy, so the cases below fail only for what they break", () => {
    withCopy((dir) => expect(loadNuclearPack(dir)?.commit).toBe("fixture0000000000000000000000000000000000"));
  });

  it("refuses a file reached through a symlinked parent directory that leaves the pack", () => {
    withCopy((dir, outside) => {
      mkdirSync(join(outside, "core-discipline"));
      cpSync(join(dir, "reference", "core-discipline", "SKILL.md"), join(outside, "core-discipline", "SKILL.md"));
      rmSync(join(dir, "reference", "core-discipline"), { recursive: true });
      symlinkSync(join(outside, "core-discipline"), join(dir, "reference", "core-discipline"));
      expect(() => loadNuclearPack(dir)).toThrow(/reference\/core-discipline\/SKILL\.md leaves the pack/);
    });
  });

  it("refuses a card whose bytes differ from its manifest digest", () => {
    withCopy((dir) => {
      writeFileSync(join(dir, "clusters", "review-panel.md"), "# Review panel (tampered)\n");
      expect(() => loadNuclearPack(dir)).toThrow(/clusters\/review-panel\.md does not match its manifest digest/);
    });
  });

  it("refuses a loaded file the manifest has no digest for", () => {
    withCopy((dir) => {
      const m = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
      delete m.files["templates/quick/record.md"];
      writeFileSync(join(dir, "manifest.json"), JSON.stringify(m));
      expect(() => loadNuclearPack(dir)).toThrow(/templates\/quick\/record\.md has no digest in the manifest/);
    });
  });
});
