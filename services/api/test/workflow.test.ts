import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { composeBrief } from "../src/brief.js";
import { captureWorkflow, loadWorkflowPacks, resolveWorkflow, workflowBriefSections, workflowPackCommits } from "../src/workflow.js";

/** Workflows without a database: resolution, the capture tag, pack loading and the brief sections, against fixture packs. */
const fixtures = fileURLToPath(new URL("./fixtures/workflows/", import.meta.url));
const decode = (i: { content_base64: string }) => Buffer.from(i.content_base64, "base64").toString();

describe("resolveWorkflow", () => {
  it("takes the card's setting, then the project default, then the playbook", () => {
    expect(resolveWorkflow({ workflow: "pocock" }, { default_workflow: "superpowers" })).toEqual({ workflow: "pocock", reason: "The card is set to pocock" });
    expect(resolveWorkflow({}, { default_workflow: "superpowers" })).toEqual({ workflow: "superpowers", reason: "The project default is superpowers" });
    expect(resolveWorkflow({ workflow: "playbook" }, { default_workflow: "pocock" })).toMatchObject({ workflow: "playbook" });
    expect(resolveWorkflow({}, null)).toEqual({ workflow: "playbook" });
    expect(resolveWorkflow(undefined, undefined)).toEqual({ workflow: "playbook" });
  });

  it("ignores values that are not a workflow", () => {
    expect(resolveWorkflow({ workflow: "Pocock" }, { default_workflow: 7 })).toEqual({ workflow: "playbook" });
    expect(resolveWorkflow({ workflow: "heavy" }, { default_workflow: "pocock" })).toMatchObject({ workflow: "pocock" });
  });
});

describe("captureWorkflow", () => {
  it("reads the token from the New work form's header line", () => {
    expect(captureWorkflow("[mode:software] [project:CR] [workflow:pocock] [stage:design] [grade:general-service]\n\nBuild the thing")).toBe("pocock");
    expect(captureWorkflow("  [workflow:pocock-superpowers]  \r\nText")).toBe("pocock-superpowers");
    expect(captureWorkflow("[workflow:playbook]")).toBe("playbook");
    expect(captureWorkflow("[workflow:superpowers] [workflow:superpowers]\n\nx")).toBe("superpowers");
  });

  it("reads nothing past the first line", () => {
    expect(captureWorkflow("[mode:software]\n\n[workflow:pocock]\nBuild")).toBeUndefined();
    expect(captureWorkflow("Build the thing.\n[workflow:pocock]")).toBeUndefined();
    expect(captureWorkflow("[project:CR] [workflow:pocock]\n[workflow:superpowers]")).toBe("pocock");
  });

  it("reads only a token that is exactly the tag", () => {
    expect(captureWorkflow("Please use [workflow:pocock]x for this")).toBeUndefined();
    expect(captureWorkflow("workflow:pocock")).toBeUndefined();
    expect(captureWorkflow("[workflow: pocock]")).toBeUndefined();
    expect(captureWorkflow("[Workflow:pocock]")).toBeUndefined();
    expect(captureWorkflow("[workflow:unknown] [project:CR]")).toBeUndefined();
    expect(captureWorkflow("")).toBeUndefined();
    expect(captureWorkflow(undefined)).toBeUndefined();
    expect(captureWorkflow(42)).toBeUndefined();
  });

  it("treats a known tag beside an unknown one as no tag, so an ambiguous request runs the playbook", () => {
    expect(captureWorkflow("[workflow:pocock] [workflow:unknown]\n\nBuild")).toBeUndefined();
    expect(captureWorkflow("[workflow:unknown] [workflow:pocock]")).toBeUndefined();
    expect(captureWorkflow("[workflow:] [workflow:superpowers]")).toBeUndefined();
  });

  it("treats two different tags on the first line as no tag", () => {
    expect(captureWorkflow("[workflow:pocock] [workflow:superpowers]\n\nBuild")).toBeUndefined();
  });
});

const scratch: string[] = [];
function copyOfFixtures(): string {
  const dir = mkdtempSync(join(tmpdir(), "cr-workflows-"));
  cpSync(fixtures, dir, { recursive: true });
  scratch.push(dir);
  return dir;
}
afterEach(() => {
  for (const d of scratch.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** Re-records lock.json for a copy, so a test can reach the check behind the lock. */
function relock(dir: string): void {
  const lock = JSON.parse(readFileSync(join(dir, "lock.json"), "utf8"));
  for (const f of Object.keys(lock.files)) if (existsSync(join(dir, f))) lock.files[f] = `sha256:${createHash("sha256").update(readFileSync(join(dir, f))).digest("hex")}`;
  writeFileSync(join(dir, "lock.json"), JSON.stringify(lock));
}

describe("lock.json", () => {
  it("refuses a stage card, a workflow map or a manifest that differs from lock.json", () => {
    for (const [file, re] of [
      ["superpowers/stages/author.md", /stages\/author\.md does not match lock\.json/],
      ["pocock/workflow.json", /workflow\.json does not match lock\.json/],
      ["pocock/manifest.json", /manifest\.json does not match lock\.json/],
    ] as const) {
      const dir = copyOfFixtures();
      writeFileSync(join(dir, file), readFileSync(join(dir, file), "utf8").replace(/\n$/, " \n"));
      expect(() => loadWorkflowPacks(dir), file).toThrow(re);
    }
  });

  it("refuses a manifest whose upstream digests were edited to match a tampered file, since the manifest itself is locked", () => {
    const dir = copyOfFixtures();
    const skill = join(dir, "superpowers", "reference", "brainstorming", "SKILL.md");
    writeFileSync(skill, "# swapped instructions\n");
    const m = JSON.parse(readFileSync(join(dir, "superpowers", "manifest.json"), "utf8"));
    m.files["reference/brainstorming/SKILL.md"] = `sha256:${createHash("sha256").update(readFileSync(skill)).digest("hex")}`;
    writeFileSync(join(dir, "superpowers", "manifest.json"), JSON.stringify(m));
    expect(() => loadWorkflowPacks(dir)).toThrow(/manifest\.json does not match lock\.json/);
  });

  it("refuses an installed pack when lock.json is gone", () => {
    const dir = copyOfFixtures();
    rmSync(join(dir, "lock.json"));
    expect(() => loadWorkflowPacks(dir)).toThrow(/lock\.json is missing/);
  });
});

describe("loadWorkflowPacks", () => {
  it("loads the two packs and the hybrid, with every skill file verified", () => {
    const packs = loadWorkflowPacks(fixtures);
    expect(Object.keys(packs).sort()).toEqual(["pocock", "pocock-superpowers", "superpowers"]);
    expect(packs.superpowers?.commits).toEqual({ superpowers: "5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a" });
    expect(packs.pocock?.skills.tdd?.map((f) => f.name)).toEqual(["SKILL.md", "deep-modules.md"]);
    expect(packs["pocock-superpowers"]?.commits).toEqual({
      pocock: "7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c",
      superpowers: "5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a",
    });
  });

  it("returns null for a pack that is not installed", () => {
    const dir = copyOfFixtures();
    rmSync(join(dir, "pocock"), { recursive: true });
    rmSync(join(dir, "pocock-superpowers"), { recursive: true });
    const packs = loadWorkflowPacks(dir);
    expect(packs.pocock).toBeNull();
    expect(packs["pocock-superpowers"]).toBeNull();
    expect(packs.superpowers).not.toBeNull();
    expect(loadWorkflowPacks(join(dir, "nowhere"))).toMatchObject({ superpowers: null, pocock: null, "pocock-superpowers": null });
  });

  it("with `only`, reads just what that workflow needs, so a damaged pack stops its own runs only", () => {
    const dir = copyOfFixtures();
    writeFileSync(join(dir, "pocock", "reference", "tdd", "SKILL.md"), "tampered\n");
    expect(Object.keys(loadWorkflowPacks(dir, "superpowers"))).toEqual(["superpowers"]);
    expect(() => loadWorkflowPacks(dir, "pocock")).toThrow(/reference\/tdd\/SKILL\.md does not match its manifest digest/);
    expect(() => loadWorkflowPacks(dir, "pocock-superpowers")).toThrow(/reference\/tdd\/SKILL\.md does not match its manifest digest/);
  });

  it("refuses a tampered skill file", () => {
    const dir = copyOfFixtures();
    writeFileSync(join(dir, "superpowers", "reference", "brainstorming", "SKILL.md"), "# changed\n");
    expect(() => loadWorkflowPacks(dir)).toThrow(/workflow pack superpowers: reference\/brainstorming\/SKILL\.md does not match its manifest digest/);
  });

  it("refuses a file the manifest does not digest", () => {
    const dir = copyOfFixtures();
    const m = JSON.parse(readFileSync(join(dir, "pocock", "manifest.json"), "utf8"));
    delete m.files["reference/retro/SKILL.md"];
    writeFileSync(join(dir, "pocock", "manifest.json"), JSON.stringify(m));
    relock(dir);
    expect(() => loadWorkflowPacks(dir)).toThrow(/reference\/retro\/SKILL\.md has no digest in the manifest/);
  });

  it("refuses a manifest path that climbs out of the pack", () => {
    const dir = copyOfFixtures();
    const m = JSON.parse(readFileSync(join(dir, "pocock", "manifest.json"), "utf8"));
    m.skills.retro = ["reference/retro/../../../superpowers/LICENSE"];
    writeFileSync(join(dir, "pocock", "manifest.json"), JSON.stringify(m));
    relock(dir);
    expect(() => loadWorkflowPacks(dir)).toThrow(/not under reference\/retro\/|leaves the pack/);
    m.skills.retro = ["/etc/hosts"];
    writeFileSync(join(dir, "pocock", "manifest.json"), JSON.stringify(m));
    relock(dir);
    expect(() => loadWorkflowPacks(dir)).toThrow(/not under reference\/retro\//);
  });

  it("refuses a skill file that is a symlink out of the pack, even with a matching digest", () => {
    const dir = copyOfFixtures();
    const outside = join(mkdtempSync(join(tmpdir(), "cr-workflows-out-")), "secret.md");
    scratch.push(join(outside, ".."));
    writeFileSync(outside, "outside the pack\n");
    rmSync(join(dir, "superpowers", "reference", "writing-plans", "SKILL.md"));
    symlinkSync(outside, join(dir, "superpowers", "reference", "writing-plans", "SKILL.md"));
    expect(() => loadWorkflowPacks(dir)).toThrow(/reference\/writing-plans\/SKILL\.md leaves the pack/);
  });

  it("refuses a stage card that climbs out of the pack", () => {
    const dir = copyOfFixtures();
    const w = JSON.parse(readFileSync(join(dir, "superpowers", "workflow.json"), "utf8"));
    w.stages.author.card = "../pocock/stages/author.md";
    writeFileSync(join(dir, "superpowers", "workflow.json"), JSON.stringify(w));
    relock(dir);
    expect(() => loadWorkflowPacks(dir)).toThrow(/leaves the pack/);
  });

  it("refuses a stage skill that does not resolve", () => {
    const dir = copyOfFixtures();
    const w = JSON.parse(readFileSync(join(dir, "pocock", "workflow.json"), "utf8"));
    w.stages.author.skills.push("pocock:no-such-skill");
    writeFileSync(join(dir, "pocock", "workflow.json"), JSON.stringify(w));
    relock(dir);
    expect(() => loadWorkflowPacks(dir, "pocock")).toThrow(/stage skill pocock:no-such-skill does not resolve/);
  });

  it("refuses a hybrid skill that does not resolve in the pack it names, or names a pack it does not use", () => {
    const dir = copyOfFixtures();
    const w = JSON.parse(readFileSync(join(dir, "pocock-superpowers", "workflow.json"), "utf8"));
    w.stages.intake.skills.push("superpowers:grilling");
    writeFileSync(join(dir, "pocock-superpowers", "workflow.json"), JSON.stringify(w));
    relock(dir);
    expect(() => loadWorkflowPacks(dir, "pocock-superpowers")).toThrow(/superpowers:grilling does not resolve/);
    w.stages.intake.skills.pop();
    w.stages.intake.skills.push("other:thing");
    writeFileSync(join(dir, "pocock-superpowers", "workflow.json"), JSON.stringify(w));
    relock(dir);
    expect(() => loadWorkflowPacks(dir, "pocock-superpowers")).toThrow(/names pack other, which this workflow does not use/);
  });

  it("refuses a hybrid whose base pack is not installed", () => {
    const dir = copyOfFixtures();
    rmSync(join(dir, "pocock"), { recursive: true });
    expect(() => loadWorkflowPacks(dir, "pocock-superpowers")).toThrow(/it uses the pocock pack, which is not installed|does not resolve/);
  });
});

describe("workflowBriefSections", () => {
  const packs = loadWorkflowPacks(fixtures);
  const names = (r: { inputs: { name: string }[] }) => r.inputs.map((i) => i.name);

  it("adds nothing for the playbook", () => {
    expect(workflowBriefSections(packs, "playbook", "author")).toEqual({ sections: [], inputs: [] });
    expect(workflowPackCommits(packs, "playbook")).toEqual({});
  });

  it("gives the stage's card under a header naming the workflow and the commit, and its skills as inputs under workflow/<pack>/<skill>/", () => {
    const r = workflowBriefSections(packs, "superpowers", "author");
    expect(r.sections).toHaveLength(2);
    expect(r.sections[0]).toBe("Workflow: superpowers (superpowers 5a5a5a5a5a5a). Skills the card names: inputs/workflow/<pack>/<skill>/.\n");
    expect(r.sections[1]).toBe(readFileSync(join(fixtures, "superpowers", "stages", "author.md"), "utf8"));
    expect(names(r)).toEqual([
      "workflow/superpowers/subagent-driven-development/SKILL.md",
      "workflow/superpowers/subagent-driven-development/implementer-prompt.md",
      "workflow/superpowers/verification-before-completion/SKILL.md",
    ]);
    expect(decode(r.inputs[1]!)).toBe(readFileSync(join(fixtures, "superpowers", "reference", "subagent-driven-development", "implementer-prompt.md"), "utf8"));
  });

  it("picks the card and skills by role, and reads the checker role as the pre-check", () => {
    expect(workflowBriefSections(packs, "pocock", "intake").sections[1]).toContain("CARD-MARKER-pocock-intake");
    expect(names(workflowBriefSections(packs, "pocock", "intake"))).toEqual(["workflow/pocock/grilling/SKILL.md", "workflow/pocock/to-tickets/SKILL.md"]);
    expect(workflowBriefSections(packs, "pocock", "author").sections[1]).toContain("CARD-MARKER-pocock-author");
    expect(names(workflowBriefSections(packs, "pocock", "author"))).toEqual([
      "workflow/pocock/tdd/SKILL.md",
      "workflow/pocock/tdd/deep-modules.md",
      "workflow/pocock/retro/SKILL.md",
    ]);
    const pre = workflowBriefSections(packs, "pocock", "pre-check");
    expect(pre.sections[1]).toContain("CARD-MARKER-pocock-pre-check");
    expect(workflowBriefSections(packs, "pocock", "checker")).toEqual(pre);
    expect(() => workflowBriefSections(packs, "pocock", "reviewer")).toThrow(/no stage card for role reviewer/);
  });

  it("ships the hybrid's cross-pack skills from the packs they live in, in the card's order", () => {
    const author = workflowBriefSections(packs, "pocock-superpowers", "author");
    expect(author.sections[0]).toBe("Workflow: pocock-superpowers (pocock 7c7c7c7c7c7c, superpowers 5a5a5a5a5a5a). Skills the card names: inputs/workflow/<pack>/<skill>/.\n");
    expect(author.sections[1]).toContain("CARD-MARKER-pocock-superpowers-author");
    expect(names(author)).toEqual([
      "workflow/superpowers/subagent-driven-development/SKILL.md",
      "workflow/superpowers/subagent-driven-development/implementer-prompt.md",
      "workflow/pocock/tdd/SKILL.md",
      "workflow/pocock/tdd/deep-modules.md",
    ]);
    expect(decode(author.inputs[2]!)).toContain("SKILL-MARKER-pocock-tdd-SKILL.md");
    expect(names(workflowBriefSections(packs, "pocock-superpowers", "intake"))).toEqual(["workflow/pocock/grilling/SKILL.md", "workflow/superpowers/writing-plans/SKILL.md"]);
    expect(names(workflowBriefSections(packs, "pocock-superpowers", "pre-check"))).toEqual(["workflow/pocock/code-review/SKILL.md", "workflow/superpowers/verification-before-completion/SKILL.md"]);
  });

  it("is deterministic", () => {
    expect(workflowBriefSections(loadWorkflowPacks(fixtures), "pocock-superpowers", "author")).toEqual(workflowBriefSections(packs, "pocock-superpowers", "author"));
  });

  it("refuses a workflow whose pack is not loaded", () => {
    expect(() => workflowBriefSections({ pocock: null }, "pocock", "author")).toThrow(/pack is not installed/);
  });
});

describe("composeBrief with workflow sections", () => {
  const parts = { header: "H\n", roleText: "ROLE\n", objective: "OBJ", extra: ["EXTRA\n"] };

  it("is byte for byte unchanged with no workflow sections, with or without Nuclear sections", () => {
    expect(composeBrief({ ...parts, workflow: [] })).toBe(composeBrief(parts));
    expect(composeBrief({ ...parts, nuclear: ["NUC\n"], workflow: [] })).toBe(composeBrief({ ...parts, nuclear: ["NUC\n"] }));
  });

  it("puts the workflow sections after the extras and before the Nuclear sections", () => {
    const brief = composeBrief({ ...parts, nuclear: ["NUC\n"], workflow: ["WF1\n", "WF2\n"] });
    const at = (s: string) => brief.indexOf(s);
    expect(at("EXTRA")).toBeLessThan(at("WF1"));
    expect(at("WF1")).toBeLessThan(at("WF2"));
    expect(at("WF2")).toBeLessThan(at("NUC"));
    expect(at("NUC")).toBeLessThan(at("## Rules"));
  });
});
