import { describe, expect, it } from "vitest";
import { cubeFor } from "../src/figures.js";
import { SLOTS, defaultLaneSet, hasWholeWords, laneSetOf, pathMatches, placeWork, proposePreset, resolveChoice } from "../src/work-lanes.js";
import { repoRootEntries } from "../src/workspace-projects.js";

/** Work lanes: presets, the order work is placed in, and the preset a setup proposes. Pure; no database. */
const lane = (id: string, over: Record<string, unknown> = {}) => ({ id, name: id[0]!.toUpperCase() + id.slice(1), purpose: `${id} work`, ...over });

describe("work lane sets", () => {
  it("reads a project with none as the capital-project preset: the six bays as they were", () => {
    const set = laneSetOf(undefined);
    expect(set.preset).toBe("capital-project");
    expect(set.lanes.map((l) => l.id)).toEqual([...SLOTS]);
    expect(set.lanes.map((l) => l.name)).toEqual(["Process", "Mechanical", "Electrical", "Civil", "Assurance", "Project controls"]);
    expect(set.default_lane).toBe("process");
    expect(laneSetOf(null)).toEqual(defaultLaneSet());
  });

  it("reads anything it cannot validate as the default, never as a crash", () => {
    expect(laneSetOf({ preset: "custom", lanes: [] }).preset).toBe("capital-project");
    expect(laneSetOf("nonsense").preset).toBe("capital-project");
  });

  it("resolves the software preset to Frontend, Backend, Platform, Data, Tests and Docs, defaulting to Platform", () => {
    const set = resolveChoice({ preset: "software" });
    expect(set.lanes.map((l) => l.name)).toEqual(["Frontend", "Backend", "Platform", "Data", "Tests", "Docs"]);
    expect(set.default_lane).toBe("platform");
    // The preset's own lanes win over whatever a request carried.
    expect(resolveChoice({ preset: "software", lanes: [lane("x")] }).lanes).toHaveLength(6);
  });

  it("takes one to six custom lanes and refuses a seventh rather than folding it", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g"];
    expect(resolveChoice({ preset: "custom", lanes: ids.slice(0, 6).map((i) => lane(i)) }).lanes).toHaveLength(6);
    expect(() => resolveChoice({ preset: "custom", lanes: ids.map((i) => lane(i)) })).toThrow(/at most 6/);
    expect(() => resolveChoice({ preset: "custom", lanes: [] })).toThrow(/at least one/);
    expect(() => resolveChoice({ preset: "custom" })).toThrow(/at least one/);
    expect(resolveChoice({ preset: "custom", lanes: [lane("a"), lane("b")] }).default_lane).toBe("a");
    expect(resolveChoice({ preset: "custom", lanes: [lane("a"), lane("b")], default_lane: "b" }).default_lane).toBe("b");
  });

  it("refuses bad lanes: duplicate ids or names, long names, a path that leaves the repository, an unknown default", () => {
    const set = (lanes: unknown[], extra = {}) => () => resolveChoice({ preset: "custom", lanes, ...extra });
    expect(set([lane("a"), lane("a", { name: "Other" })])).toThrow(/unique/);
    expect(set([lane("a"), lane("b", { name: "A" })])).toThrow(/unique/);
    expect(set([lane("a", { name: "x".repeat(25) })])).toThrow(/24/);
    expect(set([lane("A")])).toThrow(/lowercase/);
    expect(set([lane("a", { paths: ["../secrets/"] })])).toThrow(/never leaves/);
    expect(set([lane("a", { paths: ["/etc/"] })])).toThrow(/never leaves/);
    expect(set([lane("a", { extra: 1 })])).toThrow(/no field/);
    expect(set([lane("a")], { default_lane: "zzz" })).toThrow(/default_lane/);
    expect(() => resolveChoice({ preset: "bespoke" })).toThrow(/preset/);
    expect(() => resolveChoice("software")).toThrow(/object/);
  });
});

describe("placing work", () => {
  const software = resolveChoice({ preset: "software" });
  const custom = resolveChoice({
    preset: "custom",
    lanes: [lane("web", { paths: ["site/"], keywords: ["storefront"] }), lane("ops", { paths: ["deploy/*.yaml"], keywords: ["on call", "release"] }), lane("general")],
    default_lane: "general",
  });

  it("puts a lane tag first: a discipline equal to a lane id or name, even when paths and keywords point elsewhere", () => {
    const placed = placeWork(software, { discipline: "Docs", paths: ["services/api/src/a.ts"] });
    expect(placed).toMatchObject({ slot: "project-controls", by: "tag", defaulted: false });
    expect(placed.lane.id).toBe("docs");
    expect(placeWork(custom, { discipline: " OPS ", paths: ["site/index.html"] }).lane.id).toBe("ops");
  });

  it("puts repository paths second: the lane matching the most paths, the earlier lane on a tie", () => {
    expect(placeWork(software, { paths: ["apps/web/src/Plant.tsx", "apps/web/src/office.css"] }).lane.id).toBe("frontend");
    expect(placeWork(software, { paths: ["services/api/src/a.ts", "services/api/src/b.ts", "docs/x.md"] }).lane.id).toBe("backend");
    expect(placeWork(software, { paths: ["services/api/src/a.ts", "docs/x.md"] })).toMatchObject({ by: "path" });
    expect(placeWork(software, { paths: ["services/api/src/a.ts", "docs/x.md"] }).lane.id).toBe("backend");
    // Paths beat keywords.
    expect(placeWork(custom, { discipline: "release", paths: ["site/index.html"] }).lane.id).toBe("web");
  });

  it("puts whole-word keywords third, never a word inside another word", () => {
    expect(placeWork(custom, { discipline: "release notes", paths: [] })).toMatchObject({ by: "keyword" });
    expect(placeWork(custom, { discipline: "on call rota" }).lane.id).toBe("ops");
    expect(placeWork(custom, { discipline: "the storefront" }).lane.id).toBe("web");
    // "ui" is a Frontend keyword; it is not in "build" or "quiet".
    expect(placeWork(software, { discipline: "quiet build" }).lane.id).toBe("platform");
    expect(placeWork(software, { discipline: "UI polish" }).lane.id).toBe("frontend");
  });

  it("falls to the preset's default lane, and says it was defaulted", () => {
    const p = placeWork(software, {});
    expect(p).toMatchObject({ by: "default", defaulted: true, slot: "electrical" });
    expect(p.lane.name).toBe("Platform");
    expect(placeWork(custom, { discipline: "bespoke", paths: ["README.md"] }).lane.id).toBe("general");
  });

  it("never puts work outside the six bays, whatever the set", () => {
    for (const set of [software, custom, defaultLaneSet()]) for (const d of ["a", "docs", "civil", undefined]) expect(SLOTS).toContain(placeWork(set, { discipline: d }).slot);
  });

  it("keeps the capital-project preset exactly as before: the built-in discipline words, Process by default", () => {
    const cap = defaultLaneSet();
    for (const d of ["mechanical-hvac", "Instrumentation and controls", "structural", "quality assurance", "project controls", "process piping", "Scheduling", undefined, "bespoke", "website", "firebase"]) {
      const old = cubeFor(d);
      expect(placeWork(cap, { discipline: d }), String(d)).toMatchObject({ slot: old.place, defaulted: old.defaulted });
    }
    // A lane tag names a bay directly, and paths mean nothing to a set whose lanes carry none.
    expect(placeWork(cap, { discipline: "Civil" })).toMatchObject({ slot: "civil", by: "tag" });
    expect(placeWork(cap, { discipline: "bespoke", paths: ["apps/web/x.tsx"] })).toMatchObject({ slot: "process", defaulted: true });
  });
});

describe("matching", () => {
  it("matches whole words and runs of words only", () => {
    expect(hasWholeWords("Cost estimating", "cost")).toBe(true);
    expect(hasWholeWords("website", "site")).toBe(false);
    expect(hasWholeWords("front-end work", "front end")).toBe(true);
    expect(hasWholeWords("front work end", "front end")).toBe(false);
    expect(hasWholeWords(undefined, "x")).toBe(false);
    expect(hasWholeWords("x", "")).toBe(false);
  });

  it("treats a directory pattern with a wildcard as a glob that includes everything below it", () => {
    expect(pathMatches("apps/*/src/", "apps/web/src/main.ts")).toBe(true);
    expect(pathMatches("apps/*/src/", "apps/web/src/deep/x.ts")).toBe(true);
    expect(pathMatches("apps/*/src/", "apps/web/lib/main.ts")).toBe(false);
    expect(pathMatches("apps/*/src/", "apps/web/x/src/main.ts")).toBe(false);
    expect(pathMatches("**/migrations/", "services/api/db/migrations/001.sql")).toBe(true);
    expect(pathMatches("**/migrations/", "migrations/001.sql")).toBe(true);
    expect(pathMatches("**/migrations/", "services/api/db/migrationsx/001.sql")).toBe(false);
    expect(pathMatches("docs/", "docs/a/b.md")).toBe(true);
    expect(pathMatches("docs/", "docsx/b.md")).toBe(false);
    expect(pathMatches("deploy/prod.yaml", "deploy/prod.yaml")).toBe(true);
    expect(pathMatches("deploy/pr*.yaml", "deploy/prod.yaml")).toBe(true);
    expect(pathMatches("deploy/pr*.yaml", "deploy/prod.yaml.bak")).toBe(false);
  });

  it("matches a directory prefix, an exact path, and globs", () => {
    expect(pathMatches("apps/web/", "apps/web/src/a.tsx")).toBe(true);
    expect(pathMatches("apps/web/", "apps/webby/a.tsx")).toBe(false);
    expect(pathMatches("README.md", "README.md")).toBe(true);
    expect(pathMatches("docs", "docs/a.md")).toBe(true);
    expect(pathMatches("**/*.test.*", "src/a/b.test.tsx")).toBe(true);
    expect(pathMatches("**/*.test.*", "b.test.tsx")).toBe(true);
    expect(pathMatches("**/*.md", "a/b/c.md")).toBe(true);
    expect(pathMatches("deploy/*.yaml", "deploy/a.yaml")).toBe(true);
    expect(pathMatches("deploy/*.yaml", "deploy/x/a.yaml")).toBe(false);
    expect(pathMatches("a.b", "aXb")).toBe(false);
    expect(pathMatches("./apps/web/", "/apps/web/a.ts")).toBe(true);
  });
});

describe("setup proposes a preset from the repository", () => {
  it("proposes software for a repository with a manifest and no engineering-discipline folders", () => {
    for (const manifest of ["package.json", "go.mod", "Cargo.toml", "pyproject.toml"]) {
      expect(proposePreset({ entries: [manifest, "src", "README.md"] }), manifest).toMatchObject({ preset: "software" });
    }
  });

  it("proposes capital-project when discipline folders are present, even beside a manifest", () => {
    expect(proposePreset({ entries: ["calculations", "drawings", "specifications"] })).toMatchObject({ preset: "capital-project" });
    expect(proposePreset({ entries: ["package.json", "Calculations/"] }).preset).toBe("capital-project");
  });

  it("falls back to the project's mode when the repository says nothing, and to the bays as they were otherwise", () => {
    expect(proposePreset({ entries: [], mode: "software" })).toMatchObject({ preset: "software" });
    expect(proposePreset({ entries: ["notes.txt"], mode: "capital-projects" })).toMatchObject({ preset: "capital-project" });
    expect(proposePreset({})).toMatchObject({ preset: "capital-project" });
    expect(proposePreset({ entries: ["package.json"] }).reason).toMatch(/package\.json/);
  });

  it("reads no entries for a repository it cannot safely read", () => {
    expect(repoRootEntries("", "")).toEqual([]);
    expect(repoRootEntries("owner/name", "")).toEqual([]);
    expect(repoRootEntries("../escape", "")).toEqual([]);
    expect(repoRootEntries("does-not-exist-anywhere", "")).toEqual([]);
  });
});
