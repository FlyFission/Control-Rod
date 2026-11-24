import { describe, expect, it } from "vitest";
import { projectWorkflowDefault, resolveWorkflow } from "./workflow.js";

describe("resolveWorkflow", () => {
  it("uses the card's value, else the project default, else Playbook", () => {
    expect(resolveWorkflow({ workflow: "pocock" }, "superpowers")).toEqual({ workflow: "pocock", reason: "The card is set to Pocock" });
    expect(resolveWorkflow({}, "pocock-superpowers")).toEqual({ workflow: "pocock-superpowers", reason: "The project default is Pocock Superpowers" });
    expect(resolveWorkflow({})).toEqual({ workflow: "playbook" });
  });

  it("is not locked by grade", () => {
    const r = resolveWorkflow({ workflow: "superpowers", grade: "safety" } as never);
    expect(r).toEqual({ workflow: "superpowers", reason: "The card is set to Superpowers" });
  });
});

describe("projectWorkflowDefault", () => {
  const projects = [{ id: "prj_1", default_workflow: "pocock" as const }, { id: "prj_2" }];
  it("finds the project by id", () => {
    expect(projectWorkflowDefault(projects, "prj_1")).toBe("pocock");
    expect(projectWorkflowDefault(projects, "prj_2")).toBeUndefined();
    expect(projectWorkflowDefault(projects, "nope")).toBeUndefined();
    expect(projectWorkflowDefault(undefined, "prj_1")).toBeUndefined();
  });
});
