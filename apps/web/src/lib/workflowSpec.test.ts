import { describe, expect, it } from "vitest";
import { agentRows } from "./agents.js";
import { councilOf } from "./councilFlow.js";
import {
  addSkillToStage,
  addStage,
  addUserModel,
  applyUpstreamCheck,
  assignAgentToSkill,
  buildPresetSpec,
  createCustomPack,
  diffLaneFromUpstream,
  exportPackJson,
  forkLane,
  importPackJson,
  moveSkill,
  parseWorkflowSpec,
  removeLaneSkill,
  removeSkillFromStage,
  removeStage,
  reorderLaneSkill,
  reorderSkillInStage,
  reorderStage,
  resetLaneToUpstream,
  resolveLaneConflict,
  rollbackLane,
  serializeWorkflowSpec,
  setContextDepth,
  setLaneUpdatePolicy,
  validateWorkflowSpec,
} from "./workflowSpec.js";

const rows = agentRows(
  [
    { runtime: "claude", ready: true, version: "1", login_checked: true },
    { runtime: "codex", ready: true, version: "1", login_checked: true },
  ] as never,
  { reported: true, reported_at: "2026-11-24T17:00:00Z", platform: "darwin", probes: [], checkers: [], tiers: [], local_rule: "", pins: [] } as never,
  { confirmed: true, seats: [], check_in: "start-and-merge" } as never,
);
const council = councilOf(rows);

describe("workflowSpec engine", () => {
  it("builds presets with 6 stages and lossless JSON round-trip", () => {
    const spec = buildPresetSpec("pocock-superpowers", "nuclear", "start-and-merge");
    expect(spec.stages.map((s) => s.id)).toEqual(["brainstorm", "plan", "author", "check", "review", "ship"]);
    expect(spec.stages.find((s) => s.id === "check")?.allowFallback).toBe(false);
    expect(spec.stages.find((s) => s.id === "review")?.built).toBe(false);
    expect(spec.stages.find((s) => s.id === "ship")?.built).toBe(false);
    expect(spec.lanes.filter((l) => l.enabled).map((l) => l.id)).toEqual(["pocock", "superpowers", "nuclear-grade"]);

    const roundTripped = parseWorkflowSpec(serializeWorkflowSpec(spec));
    expect(roundTripped).toEqual(spec);
  });

  it("supports stage add, reorder, and remove", () => {
    let spec = buildPresetSpec("superpowers", "light", "start-and-merge");
    spec = addStage(spec, { label: "Security audit", role: "custom" });
    expect(spec.stages[spec.stages.length - 1]?.label).toBe("Security audit");
    expect(spec.stages[spec.stages.length - 1]?.built).toBe(false);

    spec = reorderStage(spec, "plan", "earlier");
    expect(spec.stages[0]?.id).toBe("plan");
    expect(spec.stages[1]?.id).toBe("brainstorm");

    spec = removeStage(spec, "security-audit");
    expect(spec.stages.some((s) => s.id === "security-audit")).toBe(false);
  });

  it("supports skill add, move across stages, reorder within stage, and remove", () => {
    let spec = buildPresetSpec("superpowers", "light", "start-and-merge");
    spec = addSkillToStage(spec, "brainstorm", { packId: "superpowers", skill: "superpowers:extra" });
    const added = spec.stages.find((s) => s.id === "brainstorm")!.skills.find((b) => b.skill === "superpowers:extra")!;
    expect(added).toBeTruthy();

    spec = reorderSkillInStage(spec, "brainstorm", added.id, "earlier");
    expect(spec.stages.find((s) => s.id === "brainstorm")!.skills[0]?.id).toBe(added.id);

    spec = moveSkill(spec, added.id, "plan");
    expect(spec.stages.find((s) => s.id === "brainstorm")!.skills.some((b) => b.id === added.id)).toBe(false);
    expect(spec.stages.find((s) => s.id === "plan")!.skills.some((b) => b.id === added.id)).toBe(true);

    spec = removeSkillFromStage(spec, "plan", added.id);
    expect(spec.stages.find((s) => s.id === "plan")!.skills.some((b) => b.id === added.id)).toBe(false);
  });

  it("validates blind checker != author and no-fallback invariant (ADR 0024)", () => {
    let spec = buildPresetSpec("superpowers", "light", "start-and-merge");
    expect(validateWorkflowSpec(spec, council).valid).toBe(true);

    const checkBlock = spec.stages.find((s) => s.id === "check")!.skills[0]!;
    // Assign author (claude) to a blind checker skill -> violation
    spec = assignAgentToSkill(spec, checkBlock.id, "claude", council);
    const res1 = validateWorkflowSpec(spec, council);
    expect(res1.valid).toBe(false);
    expect(res1.errors.some((e) => e.code === "BLIND_CHECKER_SAME_AS_AUTHOR")).toBe(true);
    expect(res1.blockViolations[checkBlock.id]?.length).toBe(1);

    // Clearing override falls back to council checker (codex) -> valid
    spec = assignAgentToSkill(spec, checkBlock.id, null, council);
    expect(validateWorkflowSpec(spec, council).valid).toBe(true);

    // Enabling fallback on blind checker -> error
    spec = {
      ...spec,
      stages: spec.stages.map((s) => (s.id === "check" ? { ...s, allowFallback: true } : s)),
    };
    const res2 = validateWorkflowSpec(spec, council);
    expect(res2.valid).toBe(false);
    expect(res2.errors.some((e) => e.code === "BLIND_CHECKER_FALLBACK_FORBIDDEN")).toBe(true);
  });

  it("toggles context depth independently without wiping workflow edits and flags modified/blocked Nuclear lane", () => {
    let spec = buildPresetSpec("superpowers", "light", "start-and-merge");
    spec = addSkillToStage(spec, "author", { packId: "superpowers", skill: "superpowers:custom-author-step" });

    // Switch to Nuclear -> adds nuclear-grade skills, preserves custom author step
    spec = setContextDepth(spec, "nuclear");
    expect(spec.contextDepth).toBe("nuclear");
    expect(spec.lanes.find((l) => l.id === "nuclear-grade")?.enabled).toBe(true);
    expect(spec.stages.find((s) => s.id === "author")?.skills.some((b) => b.skill === "superpowers:custom-author-step")).toBe(true);
    expect(spec.stages.find((s) => s.id === "check")?.skills.some((b) => b.packId === "nuclear-grade")).toBe(true);

    // Forking nuclear lane produces amber warning
    spec = forkLane(spec, "nuclear-grade");
    const warnCheck = validateWorkflowSpec(spec, council);
    expect(warnCheck.valid).toBe(true);
    expect(warnCheck.warnings.some((w) => w.message === "Nuclear lane modified — flagged before run")).toBe(true);

    // Pack error blocks Nuclear workflow
    spec = {
      ...spec,
      lanes: spec.lanes.map((l) => (l.id === "nuclear-grade" ? { ...l, packError: "Digest mismatch" } : l)),
    };
    const errCheck = validateWorkflowSpec(spec, council);
    expect(errCheck.valid).toBe(false);
    expect(errCheck.errors.some((e) => e.code === "NUCLEAR_PACK_BLOCKED")).toBe(true);
  });

  it("handles swim-lane fork, diff, 3-way merge, conflict pause, resolution, and rollback", () => {
    let spec = buildPresetSpec("superpowers", "light", "start-and-merge");
    const lane0 = spec.lanes.find((l) => l.id === "superpowers")!;
    expect(lane0.forked).toBe(false);
    expect(lane0.updatePolicy).toBe("auto");

    // Clean update on unforked lane snapshots prior version
    const updated1 = applyUpstreamCheck(
      spec,
      "superpowers",
      {
        commit: "next-commit-111",
        digest: "sha256:next-111",
        skills: [
          ...lane0.nativeSkills,
          { skill: "superpowers:new-upstream-skill", label: "New upstream skill", defaultStage: "plan" },
        ],
      },
      "2026-11-24T20:00:00Z",
    );
    const lane1 = updated1.lanes.find((l) => l.id === "superpowers")!;
    expect(lane1.versions).toHaveLength(1);
    expect(lane1.skills.some((s) => s.skill === "superpowers:new-upstream-skill")).toBe(true);

    // Rollback restores previous version AND keeps a pre-rollback snapshot so rollback is reversible
    const rolled = rollbackLane(updated1, "superpowers");
    const laneRolled = rolled.lanes.find((l) => l.id === "superpowers")!;
    expect(laneRolled.source.commit).toBe(lane0.source.commit);
    expect(laneRolled.skills).toHaveLength(lane0.skills.length);
    expect(laneRolled.versions.length).toBeGreaterThanOrEqual(2);
    const undoRollback = rollbackLane(rolled, "superpowers");
    expect(undoRollback.lanes.find((l) => l.id === "superpowers")?.source.commit).toBe("next-commit-111");

    // Fork defaults updatePolicy to freeze and tracks diff
    let forked = forkLane(spec, "superpowers");
    expect(forked.lanes.find((l) => l.id === "superpowers")?.updatePolicy).toBe("freeze");
    forked = reorderLaneSkill(forked, "superpowers", "writing-plans", "earlier");
    forked = removeLaneSkill(forked, "superpowers", "systematic-debugging");
    const diff = diffLaneFromUpstream(forked.lanes.find((l) => l.id === "superpowers")!);
    expect(diff.hasChanges).toBe(true);
    expect(diff.removed.map((r) => r.skill)).toContain("systematic-debugging");
    expect(diff.reordered).toContain("writing-plans");

    // Upstream modifies a skill that user also removed/edited -> conflict pauses without overwriting
    const withConflict = applyUpstreamCheck(forked, "superpowers", {
      commit: "upstream-222",
      digest: "sha256:up-222",
      skills: lane0.nativeSkills.map((s) =>
        s.skill === "systematic-debugging"
          ? { ...s, label: "Systematic debugging v2", digest: "sha256:v2" }
          : s,
      ),
    });
    const conflictLane = withConflict.lanes.find((l) => l.id === "superpowers")!;
    expect(conflictLane.pendingConflict).toBeTruthy();
    expect(conflictLane.pendingConflict?.conflicts.some((c) => c.skill === "systematic-debugging")).toBe(true);
    // User's local edits are still intact
    expect(conflictLane.skills.some((s) => s.skill === "systematic-debugging")).toBe(false);

    // Resolve conflict taking upstream
    const resolved = resolveLaneConflict(withConflict, "superpowers", {
      "systematic-debugging": "upstream",
    });
    const resolvedLane = resolved.lanes.find((l) => l.id === "superpowers")!;
    expect(resolvedLane.pendingConflict).toBeNull();
    expect(resolvedLane.source.commit).toBe("upstream-222");
    expect(resolvedLane.skills.some((s) => s.skill === "systematic-debugging")).toBe(true);

    // Reset to upstream restores auto-update and nativeSkills
    const reset = resetLaneToUpstream(setLaneUpdatePolicy(forked, "superpowers", "freeze"), "superpowers");
    const resetLane = reset.lanes.find((l) => l.id === "superpowers")!;
    expect(resetLane.forked).toBe(false);
    expect(resetLane.updatePolicy).toBe("auto");
    expect(resetLane.skills).toEqual(resetLane.nativeSkills);
  });

  it("creates custom packs, exports/imports JSON, adds user models, and detects empty checker / stage-canvas Nuclear edits", () => {
    let spec = buildPresetSpec("superpowers", "light", "start-and-merge");
    spec = createCustomPack(spec, { name: "QA Gate", fromLaneId: "superpowers" });
    const qaLane = spec.lanes.find((l) => l.name === "QA Gate")!;
    expect(qaLane.kind).toBe("custom");
    expect(qaLane.updatePolicy).toBe("freeze");
    expect(qaLane.skills.length).toBeGreaterThan(0);

    const exported = exportPackJson(qaLane);
    const imported = importPackJson(spec, exported);
    expect(imported.lanes.filter((l) => l.name === "QA Gate")).toHaveLength(2);

    const withModel = addUserModel(spec, "llama-3.3-70b");
    expect(withModel.userModels).toEqual(["user:llama-3.3-70b"]);

    // Empty blind checker stage still validates council checker != author
    const emptyCheckSpec: typeof spec = {
      ...spec,
      stages: spec.stages.map((s) => (s.id === "check" ? { ...s, skills: [] } : s)),
    };
    const sameCouncil = { ...council, ...(council.author ? { checker: council.author } : {}) };
    expect(validateWorkflowSpec(emptyCheckSpec, sameCouncil).valid).toBe(false);

    // Removing a Nuclear skill on the stage canvas triggers Nuclear lane modified warning
    const nucSpec = buildPresetSpec("superpowers", "nuclear", "start-and-merge");
    const editedNuc = {
      ...nucSpec,
      stages: nucSpec.stages.map((s) =>
        s.id === "check" ? { ...s, skills: s.skills.filter((b) => b.packId !== "nuclear-grade") } : s,
      ),
    };
    expect(validateWorkflowSpec(editedNuc, council).warnings.some((w) => w.code === "NUCLEAR_LANE_MODIFIED")).toBe(true);
  });
});
