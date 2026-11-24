import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  WORKFLOW_SPEC_VERSION,
  buildCatalog,
  buildPresetSpec,
  createCustomPackLane,
  diffLaneFromUpstream,
  exportCustomPack,
  importCustomPackJson,
  importSkillsFromRepoUrl,
  mergeLaneUpdate,
  parseWorkflowSpec,
  resolveLaneConflict,
  rollbackLane,
  serializeWorkflowSpec,
  syncStageSkillsFromLaneUpdate,
  validateWorkflowSpec,
  type RepoFetcher,
  type WorkflowLaneSpec,
} from "../src/workflow-spec.js";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

const scratchDirs: string[] = [];
function makeScratchRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "cr-wfspec-"));
  scratchDirs.push(dir);
  cpSync(join(REPO_ROOT, "packs", "workflows"), join(dir, "packs", "workflows"), { recursive: true });
  cpSync(join(REPO_ROOT, "packs", "nuclear-grade"), join(dir, "packs", "nuclear-grade"), { recursive: true });
  return dir;
}

afterEach(() => {
  for (const d of scratchDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("buildCatalog & buildPresetSpec", () => {
  it("loads built-in workflow and context packs with real commits and SHA-256 digests", () => {
    const catalog = buildCatalog(REPO_ROOT);
    expect(catalog.workflowLanes.map((l) => l.id)).toEqual(["superpowers", "pocock"]);
    expect(catalog.contextLanes.map((l) => l.id)).toEqual(["light", "nuclear-grade"]);

    const sp = catalog.workflowLanes.find((l) => l.id === "superpowers")!;
    expect(sp.packError).toBeNull();
    expect(sp.source.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(sp.source.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(sp.nativeSkills.length).toBeGreaterThan(0);

    const nuc = catalog.contextLanes.find((l) => l.id === "nuclear-grade")!;
    expect(nuc.packError).toBeNull();
    expect(nuc.nuclearRequired).toBe(true);
    expect(nuc.source.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(nuc.nativeSkills.some((s) => s.skill === "proving-claims")).toBe(true);
  });

  it("builds a 6-stage preset spec and round-trips losslessly through serialize/parse", () => {
    const catalog = buildCatalog(REPO_ROOT);
    const spec = buildPresetSpec("pocock-superpowers", "nuclear", catalog, "every-step");

    expect(spec.schema_version).toBe(WORKFLOW_SPEC_VERSION);
    expect(spec.stages.map((s) => s.id)).toEqual(["brainstorm", "plan", "author", "check", "review", "ship"]);
    expect(spec.stages.find((s) => s.id === "check")?.isBlindChecker).toBe(true);
    expect(spec.stages.find((s) => s.id === "check")?.allowFallback).toBe(false);
    expect(spec.stages.find((s) => s.id === "review")?.built).toBe(false);
    expect(spec.stages.find((s) => s.id === "ship")?.built).toBe(false);

    // Includes both workflow skills and nuclear-grade skills
    const allBlocks = spec.stages.flatMap((s) => s.skills);
    expect(allBlocks.some((b) => b.packId === "pocock")).toBe(true);
    expect(allBlocks.some((b) => b.packId === "superpowers")).toBe(true);
    expect(allBlocks.some((b) => b.packId === "nuclear-grade")).toBe(true);

    const serialized = serializeWorkflowSpec(spec);
    const reparsed = parseWorkflowSpec(serialized);
    expect(reparsed).toEqual(spec);
  });

  it("rejects malformed specs during parseWorkflowSpec", () => {
    expect(() => parseWorkflowSpec("{}")).toThrow(/schema_version/);
    expect(() => parseWorkflowSpec({ schema_version: "2.0.0" })).toThrow(/schema_version/);
    expect(() => parseWorkflowSpec("not-json")).toThrow();
  });
});

describe("validateWorkflowSpec safety & nuclear rules", () => {
  it("rejects blind checker allowFallback: true (ADR 0024)", () => {
    const catalog = buildCatalog(REPO_ROOT);
    const spec = buildPresetSpec("superpowers", "light", catalog);
    const checkStage = spec.stages.find((s) => s.id === "check")!;
    checkStage.allowFallback = true;

    const res = validateWorkflowSpec(spec);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === "checker_fallback_forbidden" && e.stageId === "check")).toBe(true);
  });

  it("rejects blind checker resolving to the same vendor/agent as Author (including aliases and council seats)", () => {
    const catalog = buildCatalog(REPO_ROOT);
    const spec = buildPresetSpec("superpowers", "light", catalog);
    const authorStage = spec.stages.find((s) => s.id === "author")!;
    const checkStage = spec.stages.find((s) => s.id === "check")!;

    authorStage.skills[0]!.agent = "anthropic";
    checkStage.skills[0]!.agent = "claude-code";

    const resAlias = validateWorkflowSpec(spec);
    expect(resAlias.valid).toBe(false);
    expect(resAlias.errors.some((e) => e.code === "checker_same_as_author")).toBe(true);

    // Different vendors pass
    checkStage.skills.forEach((b) => {
      b.agent = "codex";
    });
    authorStage.skills.forEach((b) => {
      b.agent = "claude";
    });
    expect(validateWorkflowSpec(spec).valid).toBe(true);

    // Council seat collision when skills fall back to council
    authorStage.skills.forEach((b) => {
      b.agent = null;
    });
    checkStage.skills.forEach((b) => {
      b.agent = null;
    });
    const resCouncil = validateWorkflowSpec(spec, { author: "openai", checker: "codex" });
    expect(resCouncil.valid).toBe(false);
    expect(resCouncil.errors.some((e) => e.code === "checker_same_as_author")).toBe(true);
  });

  it("flags modified Nuclear lane as a warning before run", () => {
    const catalog = buildCatalog(REPO_ROOT);
    const spec = buildPresetSpec("superpowers", "nuclear", catalog);
    const nuc = spec.lanes.find((l) => l.id === "nuclear-grade")!;
    nuc.forked = true;
    nuc.skills = nuc.skills.filter((s) => s.skill !== "learning-from-experience");

    const diff = diffLaneFromUpstream(nuc);
    expect(diff.modified).toBe(true);
    expect(diff.removed).toEqual(["learning-from-experience"]);

    const res = validateWorkflowSpec(spec);
    expect(res.valid).toBe(true);
    expect(res.warnings.some((w) => w.code === "nuclear_lane_modified" && w.laneId === "nuclear-grade")).toBe(true);
  });

  it("blocks validation when Nuclear pack is tampered/corrupt and contextDepth is nuclear", () => {
    const dir = makeScratchRepo();
    writeFileSync(join(dir, "packs", "nuclear-grade", "core.md"), "# tampered core card\n");

    const catalog = buildCatalog(dir);
    const nuc = catalog.contextLanes.find((l) => l.id === "nuclear-grade")!;
    expect(nuc.packError).toMatch(/does not match its manifest digest/);

    const spec = buildPresetSpec("superpowers", "nuclear", catalog);
    const res = validateWorkflowSpec(spec);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === "nuclear_pack_load_failed")).toBe(true);
  });
});

describe("3-way lane update merge, conflict resolution & rollback", () => {
  function sampleLane(forked: boolean): WorkflowLaneSpec {
    const native = [
      { skill: "alpha", label: "Alpha", defaultStage: "brainstorm", digest: "sha256:a1" },
      { skill: "beta", label: "Beta", defaultStage: "author", digest: "sha256:b1" },
      { skill: "gamma", label: "Gamma", defaultStage: "check", digest: "sha256:c1" },
    ];
    return {
      id: "sample",
      name: "Sample Pack",
      kind: "workflow",
      enabled: true,
      source: { type: "builtin", commit: "111111111111", digest: "sha256:v1", license: "MIT" },
      forked,
      updatePolicy: forked ? "freeze" : "auto",
      nativeSkills: native.map((x) => ({ ...x })),
      skills: native.map((x) => ({ ...x })),
      versions: [],
      pendingConflict: null,
    };
  }

  it("auto-updates an untouched lane cleanly and snapshots the previous version for rollback", () => {
    const lane = sampleLane(false);
    const upstream = {
      commit: "222222222222",
      digest: "sha256:v2",
      skills: [
        { skill: "alpha", label: "Alpha", defaultStage: "brainstorm", digest: "sha256:a2" },
        { skill: "beta", label: "Beta", defaultStage: "author", digest: "sha256:b1" },
        { skill: "delta", label: "Delta", defaultStage: "plan", digest: "sha256:d1" },
      ],
    };

    const res = mergeLaneUpdate(lane, upstream);
    expect(res.status).toBe("updated");
    expect(res.lane.source.commit).toBe("222222222222");
    expect(res.lane.skills.map((s) => s.skill)).toEqual(["alpha", "beta", "delta"]);
    expect(res.lane.versions).toHaveLength(1);
    expect(res.lane.versions[0]!.commit).toBe("111111111111");

    // Rollback restores v1
    const rolled = rollbackLane(res.lane, 1);
    expect(rolled.source.commit).toBe("111111111111");
    expect(rolled.skills.map((s) => s.skill)).toEqual(["alpha", "beta", "gamma"]);
    expect(rolled.versions).toHaveLength(2);
  });

  it("3-way merges non-conflicting changes on a forked lane without losing local edits", () => {
    const lane = sampleLane(true);
    // User moves alpha to plan and adds a custom skill locally
    lane.skills[0]!.defaultStage = "plan";
    lane.skills.push({ skill: "local-only", label: "Local Only", defaultStage: "author", digest: "sha256:l1" });

    // Upstream updates beta's digest and adds delta
    const upstream = {
      commit: "222222222222",
      digest: "sha256:v2",
      skills: [
        { skill: "alpha", label: "Alpha", defaultStage: "brainstorm", digest: "sha256:a1" },
        { skill: "beta", label: "Beta", defaultStage: "author", digest: "sha256:b2" },
        { skill: "gamma", label: "Gamma", defaultStage: "check", digest: "sha256:c1" },
        { skill: "delta", label: "Delta", defaultStage: "plan", digest: "sha256:d1" },
      ],
    };

    const res = mergeLaneUpdate(lane, upstream);
    expect(res.status).toBe("updated");
    expect(res.lane.skills.find((s) => s.skill === "alpha")?.defaultStage).toBe("plan");
    expect(res.lane.skills.find((s) => s.skill === "beta")?.digest).toBe("sha256:b2");
    expect(res.lane.skills.some((s) => s.skill === "delta")).toBe(true);
    expect(res.lane.skills.some((s) => s.skill === "local-only")).toBe(true);
    expect(res.lane.versions).toHaveLength(1);
  });

  it("pauses on conflict for a forked lane without overwriting user edits, then resolves cleanly", () => {
    const lane = sampleLane(true);
    // User reassigns alpha to author and edits gamma
    lane.skills[0]!.defaultStage = "author";
    lane.skills[2]!.agent = "codex";

    // Upstream modifies alpha AND removes gamma
    const upstream = {
      commit: "333333333333",
      digest: "sha256:v3",
      skills: [
        { skill: "alpha", label: "Alpha v3", defaultStage: "plan", digest: "sha256:a3" },
        { skill: "beta", label: "Beta", defaultStage: "author", digest: "sha256:b1" },
      ],
    };

    const res = mergeLaneUpdate(lane, upstream);
    expect(res.status).toBe("conflict_paused");
    if (res.status !== "conflict_paused") throw new Error("expected conflict_paused");

    // User edits are NOT overwritten while paused
    expect(res.lane.source.commit).toBe("111111111111");
    expect(res.lane.skills[0]!.defaultStage).toBe("author");
    expect(res.lane.pendingConflict).not.toBeNull();
    expect(res.conflicts.map((c) => `${c.skill}:${c.reason}`).sort()).toEqual([
      "alpha:modified-both",
      "gamma:removed-upstream-edited-locally",
    ]);

    // Resolve: keep upstream for alpha, keep mine for gamma
    const resolved = resolveLaneConflict(res.lane, { alpha: "upstream", gamma: "mine" });
    expect(resolved.pendingConflict).toBeNull();
    expect(resolved.source.commit).toBe("333333333333");
    expect(resolved.skills.find((s) => s.skill === "alpha")?.defaultStage).toBe("plan");
    expect(resolved.skills.find((s) => s.skill === "gamma")?.agent).toBe("codex");
    expect(resolved.versions).toHaveLength(1);
  });
});

describe("custom packs & upstream repo URL import", () => {
  it("creates blank and cloned custom packs and round-trips export/import JSON", () => {
    const catalog = buildCatalog(REPO_ROOT);
    const sp = catalog.workflowLanes.find((l) => l.id === "superpowers")!;

    const blank = createCustomPackLane({ id: "team-qa", name: "Team QA" });
    expect(blank.kind).toBe("custom");
    expect(blank.skills).toEqual([]);

    const cloned = createCustomPackLane({ id: "my-superpowers", name: "My Superpowers", fromLane: sp });
    expect(cloned.skills).toEqual(sp.skills);

    const exported = exportCustomPack(cloned);
    const imported = importCustomPackJson(JSON.stringify(exported));
    expect(imported.id).toBe("my-superpowers");
    expect(imported.source.type).toBe("file");
    expect(imported.skills).toEqual(cloned.skills);
  });

  it("imports skills from a GitHub repo URL via injectable fetcher", async () => {
    const mockFetcher: RepoFetcher = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        sha: "abcdef1234567890abcdef1234567890abcdef12",
        tree: [
          { path: "skills/brainstorming/SKILL.md", type: "blob", sha: "111" },
          { path: "skills/code-review/SKILL.md", type: "blob", sha: "222" },
          { path: "README.md", type: "blob", sha: "333" },
        ],
      }),
      text: async () => "",
    });

    const lane = await importSkillsFromRepoUrl("https://github.com/acme/agent-skills", mockFetcher);
    expect(lane.id).toBe("acme-agent-skills");
    expect(lane.forked).toBe(false);
    expect(lane.updatePolicy).toBe("auto");
    expect(lane.source.type).toBe("git-url");
    expect(lane.skills.map((s) => s.skill)).toEqual(["brainstorming", "code-review"]);
    expect(lane.skills[0]!.defaultStage).toBe("brainstorm");
    expect(lane.skills[1]!.defaultStage).toBe("check");
    expect(lane.source.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("rejects non-HTTPS, localhost, private IP, and path-traversal URLs", async () => {
    const neverFetch: RepoFetcher = async () => {
      throw new Error("fetcher should not be called");
    };
    for (const bad of [
      "http://github.com/acme/skills",
      "file:///etc/passwd",
      "https://localhost/acme/skills",
      "https://127.0.0.1/acme/skills",
      "https://10.0.0.5/acme/skills",
      "https://192.168.1.1/acme/skills",
      "https://169.254.169.254/latest/meta-data",
      "https://[::1]/acme/skills",
      "https://github.com/acme/../secret",
      "https://github.com/acme/%2e%2e/secret",
    ]) {
      await expect(importSkillsFromRepoUrl(bad, neverFetch), bad).rejects.toThrow();
    }
  });

  it("blocks redirect responses to private hosts and rejects path-traversal slugs in specs/manifests", async () => {
    const redirectFetcher: RepoFetcher = async (_url, init) => {
      expect(init?.redirect).toBe("error");
      return {
        ok: true,
        status: 200,
        url: "http://169.254.169.254/latest/meta-data",
        json: async () => ({ skills: [{ skill: "ok" }] }),
        text: async () => "",
      };
    };
    await expect(importSkillsFromRepoUrl("https://example.com/skills.json", redirectFetcher)).rejects.toThrow(/https/i);

    const traversalManifest: RepoFetcher = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ skills: [{ skill: "../../etc/passwd" }] }),
      text: async () => "",
    });
    await expect(importSkillsFromRepoUrl("https://example.com/skills.json", traversalManifest)).rejects.toThrow(/unsafe/i);

    const catalog = buildCatalog(REPO_ROOT);
    const badSpec = buildPresetSpec("superpowers", "light", catalog);
    badSpec.stages[0]!.skills.push({ id: "bad", packId: "../evil", skill: "x" });
    expect(() => parseWorkflowSpec(badSpec)).toThrow(/unsafe/i);
  });

  it("flags stage-canvas Nuclear removals (with zero false positives on unmodified presets) and syncs stage blocks on auto-update", () => {
    const catalog = buildCatalog(REPO_ROOT);
    const spec = buildPresetSpec("superpowers", "nuclear", catalog);
    // Unmodified Nuclear preset must produce zero warnings
    expect(validateWorkflowSpec(spec).warnings).toEqual([]);
    // Remove a nuclear-grade skill directly from stages without touching nuclearLane.skills
    for (const st of spec.stages) {
      st.skills = st.skills.filter((b) => !(b.packId === "nuclear-grade" && b.skill === "proving-claims"));
    }
    const check = validateWorkflowSpec(spec);
    expect(check.valid).toBe(true);
    expect(check.warnings.some((w) => w.code === "nuclear_lane_modified")).toBe(true);

    // syncStageSkillsFromLaneUpdate propagates new upstream skills and preserves custom agent overrides
    const spLane = spec.lanes.find((l) => l.id === "superpowers")!;
    spec.stages.find((s) => s.id === "author")!.skills[0]!.agent = "claude";
    const updated = mergeLaneUpdate(spLane, {
      commit: "999999999999",
      digest: "sha256:9999",
      skills: [...spLane.nativeSkills, { skill: "new-skill", label: "New Skill", defaultStage: "plan" }],
    });
    if (updated.status !== "updated") throw new Error("expected updated");
    const syncedStages = syncStageSkillsFromLaneUpdate(spec.stages, updated.lane);
    expect(syncedStages.find((s) => s.id === "plan")?.skills.some((b) => b.skill === "new-skill")).toBe(true);
    expect(syncedStages.find((s) => s.id === "author")?.skills.some((b) => b.agent === "claude")).toBe(true);

    // importCustomPackJson also accepts frontend { pack } envelope
    const fromFrontendEnvelope = importCustomPackJson({
      schema_version: "1.0.0",
      pack: { id: "qa-pack", name: "QA Pack", skills: [{ skill: "smoke-test", defaultStage: "check" }] },
    });
    expect(fromFrontendEnvelope.id).toBe("qa-pack");
    expect(fromFrontendEnvelope.skills[0]?.skill).toBe("smoke-test");
  });
});
